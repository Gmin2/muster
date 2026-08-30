#!/usr/bin/env node
/* One-time Google authorisation.
 *
 * Run it once, click through the consent screen, and it prints a refresh token
 * that goes in .env (and in Vercel env for the deploy). After that the server
 * mints access tokens on its own and nobody ever sees a Google login again,
 * which is the only way an unverified Gmail app can serve visitors at all.
 *
 *   node scripts/google-auth.mjs
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeEnv } from "./env-write.mjs";

const PORT = 5273;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function envFile() {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const file = envFile();
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || file.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || file.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
Missing credentials. Put these in .env first:

  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...

Get them from console.cloud.google.com:
  1. New project
  2. APIs and Services > Library: enable "Gmail API" and "Google Calendar API"
  3. OAuth consent screen: External, add yourself under Test users
  4. Credentials > Create credentials > OAuth client ID > Web application
  5. Authorised redirect URI: ${REDIRECT}
`);
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent is what actually returns a refresh token; without them
    // Google hands back an access token that dies in an hour and never renews.
    access_type: "offline",
    prompt: "consent",
    state,
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const finish = (msg) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<body style="font:15px system-ui;padding:40px">${msg}</body>`);
  };

  if (url.searchParams.get("state") !== state) {
    finish("State mismatch. Run the script again.");
    server.close();
    process.exit(1);
  }

  const error = url.searchParams.get("error");
  if (error) {
    finish(`Google returned: ${error}`);
    server.close();
    process.exit(1);
  }

  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code"),
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  }).then((r) => r.json());

  if (!token.refresh_token) {
    finish("No refresh token came back. Revoke the app at myaccount.google.com/permissions and rerun.");
    console.error("\nNo refresh_token in the response:", token);
    server.close();
    process.exit(1);
  }

  finish("Connected. You can close this tab, it is already saved.");
  writeEnv({ GOOGLE_REFRESH_TOKEN: token.refresh_token });
  console.log("\nWrote GOOGLE_REFRESH_TOKEN to .env");
  console.log("(value not shown on purpose, it is a live credential)\n");
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`\nOpening the consent screen. If nothing happens, visit:\n\n${authUrl}\n`);
  exec(`open "${authUrl}" || xdg-open "${authUrl}"`);
});
