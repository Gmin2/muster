#!/usr/bin/env node
/* One-time OAuth for an MCP server that requires it.
 *
 *   node scripts/mcp-auth.mjs notion
 *   node scripts/mcp-auth.mjs linear
 *
 * Both servers support Dynamic Client Registration, so there is no developer
 * console step at all: this registers a client, runs the PKCE consent flow in
 * your browser, and prints the lines to paste into .env. After that the server
 * refreshes its own access tokens and nobody sees a consent screen again, which
 * is what lets a deployed demo show real data to someone who is just visiting.
 *
 * It also prints the tool list it discovers, which is the fastest way to see
 * what a given MCP server actually offers.
 */
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { exec } from "node:child_process";
import { writeEnv } from "./env-write.mjs";

const SERVERS = {
  notion: { base: "https://mcp.notion.com", scope: "default" },
  linear: { base: "https://mcp.linear.app", scope: "read write" },
};

const name = process.argv[2];
if (!SERVERS[name]) {
  console.error(`usage: node scripts/mcp-auth.mjs <${Object.keys(SERVERS).join("|")}>`);
  process.exit(1);
}

const { base, scope } = SERVERS[name];
const PORT = 5274;
const REDIRECT = `http://localhost:${PORT}/callback`;

const b64url = (buf) => buf.toString("base64url");
const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const state = randomBytes(16).toString("hex");

// 1. Dynamic Client Registration, so no pre-registered app is needed.
console.log(`\nRegistering a client with ${base} ...`);
const reg = await fetch(`${base}/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "Muster",
    redirect_uris: [REDIRECT],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }),
}).then((r) => r.json());

if (!reg.client_id) {
  console.error("Registration failed:", reg);
  process.exit(1);
}
console.log(`client_id: ${reg.client_id}`);

const authUrl =
  `${base}/authorize?` +
  new URLSearchParams({
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const done = (msg) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<body style="font:15px system-ui;padding:40px">${msg}</body>`);
  };

  if (url.searchParams.get("state") !== state) {
    done("State mismatch. Run it again.");
    server.close();
    process.exit(1);
  }
  if (url.searchParams.get("error")) {
    done(`Returned: ${url.searchParams.get("error")}`);
    server.close();
    process.exit(1);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: url.searchParams.get("code"),
    redirect_uri: REDIRECT,
    client_id: reg.client_id,
    code_verifier: verifier,
  });
  if (reg.client_secret) body.set("client_secret", reg.client_secret);

  const token = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).then((r) => r.json());

  if (!token.refresh_token) {
    done("No refresh token came back. See the terminal.");
    console.error("\nNo refresh_token in response:", token);
    server.close();
    process.exit(1);
  }

  done("Connected. You can close this tab, it is already saved.");

  const U = name.toUpperCase();
  const written = writeEnv({
    [`${U}_MCP_CLIENT_ID`]: reg.client_id,
    [`${U}_MCP_CLIENT_SECRET`]: reg.client_secret,
    [`${U}_MCP_REFRESH_TOKEN`]: token.refresh_token,
  });
  console.log(`\nWrote to .env: ${written.join(", ")}`);
  console.log("(values not shown on purpose, they are live credentials)\n");
  console.log("For Vercel, copy them out of .env with:");
  console.log(`  grep '^${U}_MCP' .env\n`);

  // Discovery pass: shows exactly which tools this server exposes, which is
  // what the provider needs to resolve against.
  try {
    const call = async (method, params) => {
      const r = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const sid = r.headers.get("mcp-session-id");
      const text = await r.text();
      const payload = text.includes("data:")
        ? JSON.parse(
            text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5))[0],
          )
        : JSON.parse(text);
      return { payload, sid };
    };

    const init = await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "muster", version: "0.1.0" },
    });

    const listed = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        ...(init.sid ? { "Mcp-Session-Id": init.sid } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    }).then((r) => r.text());

    const parsed = listed.includes("data:")
      ? JSON.parse(listed.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5))[0])
      : JSON.parse(listed);

    const tools = parsed?.result?.tools ?? [];
    console.log(`Tools ${name} exposes (${tools.length}):`);
    for (const t of tools) console.log(`  ${t.name}`);
    console.log();
  } catch (err) {
    console.log("(could not list tools:", err.message, ")\n");
  }

  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`\nOpening consent. If nothing happens, visit:\n\n${authUrl}\n`);
  exec(`open "${authUrl}" || xdg-open "${authUrl}"`);
});
