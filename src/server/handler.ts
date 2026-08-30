import { randomBytes, createHash } from "node:crypto";
import type { ComposeRequest, SourceId, WriteAction } from "../lib/types";
import { SOURCE_IDS } from "../lib/constants";
import { composeServer, modelName } from "./compose";
import { executeServer } from "./actions";
import { configReport } from "./providers";
import {
  authorizeUrl,
  connectionFromEnv,
  currentRefreshToken,
  exchangeCode,
  registerClient,
  type OAuthServer,
} from "./mcp-oauth";
import {
  clearPending,
  parseCookies,
  readConnections,
  readPending,
  writeConnections,
  writePending,
} from "./session";

/* One runtime-agnostic handler: a plain request in, a plain response out. The
   Vite dev middleware and the Vercel functions both wrap this, so there is
   exactly one implementation of the API and dev cannot drift from production. */

export type HttpRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  cookieHeader?: string | null;
  origin: string;
  body?: unknown;
};

export type HttpResponse = {
  status: number;
  body?: unknown;
  redirect?: string;
  cookies?: string[];
};

const json = (body: unknown, status = 200): HttpResponse => ({ status, body });

const OAUTH_SERVERS = new Set(["notion", "linear"]);

function parseConnected(raw: unknown): SourceId[] {
  const allowed = new Set<string>(SOURCE_IDS);
  const ids = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  const kept = ids.filter((id) => allowed.has(id)) as SourceId[];
  return kept.length > 0 ? kept : [...SOURCE_IDS];
}

let persistenceReady = false;

export async function handle(req: HttpRequest): Promise<HttpResponse> {
  /* Lazily, and never at module load: a serverless cold start that throws while
     evaluating imports fails with no usable error. */
  if (!persistenceReady) {
    persistenceReady = true;
    try {
      const { installLocalPersistence } = await import("./persist");
      installLocalPersistence();
    } catch {
      // No filesystem here, which is expected on a serverless host.
    }
  }

  const cookies = parseCookies(req.cookieHeader);
  const secure = req.origin.startsWith("https://");

  switch (req.path) {
    case "/api/status": {
      const connections = readConnections(cookies);
      return json({
        model: modelName(),
        // Lets the rail show Connect versus Disconnect without another call.
        connected: {
          notion: Boolean(connections.notion ?? connectionFromEnv("notion")),
          linear: Boolean(connections.linear ?? connectionFromEnv("linear")),
        },
        // True only when it is the visitor's own account rather than the owner's.
        own: { notion: Boolean(connections.notion), linear: Boolean(connections.linear) },
        config: configReport(),
      });
    }

    case "/api/compose": {
      if (req.method !== "POST") return json({ error: "POST only" }, 405);
      const input = (req.body ?? {}) as Partial<ComposeRequest>;
      const query =
        typeof input.query === "string" && input.query.trim()
          ? input.query.trim().slice(0, 400)
          : "what needs me today?";

      const connections = readConnections(cookies);
      const result = await composeServer(
        { query, connected: parseConnected(input.connected) },
        connections,
      );

      /* Notion and Linear rotate their refresh tokens, and a serverless instance
         forgets the new one the moment it goes cold. Writing it back into the
         visitor's cookie is what makes a connected account survive past the
         first hour, since the cookie is the only durable store we have. */
      let moved = false;
      const next = { ...connections };
      for (const server of ["notion", "linear"] as const) {
        const conn = connections[server];
        if (!conn) continue;
        const latest = currentRefreshToken(server, conn.refreshToken);
        if (latest !== conn.refreshToken) {
          next[server] = { ...conn, refreshToken: latest };
          moved = true;
        }
      }

      return moved
        ? { status: 200, body: result, cookies: [writeConnections(next, secure)] }
        : json(result);
    }

    case "/api/act": {
      if (req.method !== "POST") return json({ error: "POST only" }, 405);
      const input = (req.body ?? {}) as Partial<WriteAction>;
      if (typeof input.tool !== "string") return json({ ok: false, applied: "no tool named" });
      return json(
        await executeServer({
          tool: input.tool,
          target: typeof input.target === "string" ? input.target : "",
          payload: (input.payload ?? {}) as Record<string, unknown>,
        }),
      );
    }

    /* Route names are flat on purpose. Vercel's catch-all function only matched
       a single path segment, so /api/oauth/start never reached this handler at
       all while /api/status did. */

    /* Start the connect flow. Registers a client on the fly, because both these
       servers support Dynamic Client Registration, then sends the visitor off to
       consent with the PKCE verifier parked in a short lived cookie. */
    case "/api/oauth-start": {
      const server = req.query.server;
      if (!OAUTH_SERVERS.has(server)) return json({ error: "unknown server" }, 400);

      const redirectUri = `${req.origin}/api/oauth-callback`;
      const client = await registerClient(server as OAuthServer, redirectUri);

      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const state = randomBytes(16).toString("hex");

      return {
        status: 302,
        redirect: authorizeUrl({
          server: server as OAuthServer,
          clientId: client.clientId,
          redirectUri,
          state,
          challenge,
        }),
        cookies: [
          writePending(
            {
              server: server as OAuthServer,
              verifier,
              state,
              clientId: client.clientId,
              clientSecret: client.clientSecret,
              redirectUri,
            },
            secure,
          ),
        ],
      };
    }

    case "/api/oauth-callback": {
      const pending = readPending(cookies);
      const fail = (why: string): HttpResponse => ({
        status: 302,
        redirect: `/?connect=error&reason=${encodeURIComponent(why)}`,
        cookies: [clearPending(secure)],
      });

      if (!pending) return fail("the sign-in expired, try again");
      if (req.query.error) return fail(req.query.error);
      // Guards against a callback that did not originate from our own start.
      if (req.query.state !== pending.state) return fail("state mismatch");
      if (!req.query.code) return fail("no code returned");

      try {
        const connection = await exchangeCode({
          server: pending.server,
          code: req.query.code,
          verifier: pending.verifier,
          clientId: pending.clientId,
          clientSecret: pending.clientSecret,
          redirectUri: pending.redirectUri,
        });

        const next = { ...readConnections(cookies), [pending.server]: connection };
        return {
          status: 302,
          redirect: `/?connect=${pending.server}`,
          cookies: [writeConnections(next, secure), clearPending(secure)],
        };
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    }

    /* Forgets this visitor's account. It does not revoke the grant upstream,
       so the wording in the UI says "disconnect" rather than anything stronger. */
    case "/api/oauth-disconnect": {
      const server = req.query.server;
      if (!OAUTH_SERVERS.has(server)) return json({ error: "unknown server" }, 400);
      const next = { ...readConnections(cookies) };
      delete next[server as OAuthServer];
      return {
        status: 302,
        redirect: "/?connect=removed",
        cookies: [writeConnections(next, secure)],
      };
    }

    default:
      return json({ error: "not found" }, 404);
  }
}
