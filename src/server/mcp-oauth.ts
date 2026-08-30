/* Access tokens for the OAuth MCP servers.

   Notion and Linear both refuse a static API key on their MCP endpoints: the
   only way in is OAuth 2.1. Both advertise the refresh_token grant, though,
   which is what makes them usable on a deployed demo. You authorise once with
   scripts/mcp-auth.mjs, the refresh token goes in server env, and from then on
   this module mints hourly access tokens with no human in the loop. A visitor
   clicks nothing and never sees a consent screen. */

const env = (key: string) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
};

export type OAuthServer = "notion" | "linear";

const ENDPOINTS: Record<OAuthServer, { token: string; mcp: string }> = {
  notion: { token: "https://mcp.notion.com/token", mcp: "https://mcp.notion.com/mcp" },
  linear: { token: "https://mcp.linear.app/token", mcp: "https://mcp.linear.app/mcp" },
};

const KEYS = (server: OAuthServer) => ({
  clientId: `${server.toUpperCase()}_MCP_CLIENT_ID`,
  clientSecret: `${server.toUpperCase()}_MCP_CLIENT_SECRET`,
  refresh: `${server.toUpperCase()}_MCP_REFRESH_TOKEN`,
});

export function oauthConfigured(server: OAuthServer, connection?: Connection | null): boolean {
  return Boolean(connection ?? connectionFromEnv(server));
}

export function mcpUrl(server: OAuthServer): string {
  return env(`${server.toUpperCase()}_MCP_URL`) ?? ENDPOINTS[server].mcp;
}

const cache = new Map<string, { token: string; expiresAt: number }>();

/* A visitor who connected their own account, carried on their cookie. When
   present it wins over the owner's env credentials, which is what turns the
   deployed showcase into something a stranger can point at their own workspace. */
export type Connection = { clientId: string; clientSecret?: string; refreshToken: string };

export function connectionFromEnv(server: OAuthServer): Connection | null {
  const k = KEYS(server);
  const clientId = env(k.clientId);
  const refreshToken = env(k.refresh);
  if (!clientId || !refreshToken) return null;
  return { clientId, clientSecret: env(k.clientSecret), refreshToken };
}

/* Returns a getter rather than a token, because McpClient may hold a client
   across the hour boundary and needs to be able to ask again. */
export function accessTokenFor(
  server: OAuthServer,
  connection?: Connection | null,
): () => Promise<string> {
  return async () => {
    const conn = connection ?? connectionFromEnv(server);
    if (!conn) throw new Error(`${server} MCP is not authorised`);

    // Keyed by the refresh token so a visitor's session and the owner's default
    // never hand each other the wrong access token.
    const key = `${server}:${conn.refreshToken.slice(-24)}`;
    const hit = cache.get(key);
    if (hit && Date.now() < hit.expiresAt) return hit.token;

    const clientId = conn.clientId;
    const refresh = conn.refreshToken;

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId,
    });
    // Dynamic registration may or may not issue a secret depending on whether
    // the client registered as public or confidential.
    if (conn.clientSecret) body.set("client_secret", conn.clientSecret);

    const res = await fetch(ENDPOINTS[server].token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      throw new Error(`${server} token refresh ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in?: number };
    cache.set(key, {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    });
    return data.access_token;
  };
}


// ── The in-app connect flow ─────────────────────────────────────────────────

/* Same OAuth dance the setup script performs, but the redirect comes back to
   this app rather than to a terminal, and the resulting refresh token is handed
   to the caller to put in that visitor's cookie. That is the whole difference
   between "everyone sees the owner's data" and "connect your own". */

const AUTH_BASE: Record<OAuthServer, { authorize: string; register: string; scope: string }> = {
  notion: {
    authorize: "https://mcp.notion.com/authorize",
    register: "https://mcp.notion.com/register",
    scope: "default",
  },
  linear: {
    authorize: "https://mcp.linear.app/authorize",
    register: "https://mcp.linear.app/register",
    scope: "read write",
  },
};

/* Both servers support Dynamic Client Registration, so a client is created on
   demand instead of being pre-registered in a developer console. Cached per
   process because registering on every click would be rude and slow. */
const clients = new Map<OAuthServer, { clientId: string; clientSecret?: string }>();

export async function registerClient(
  server: OAuthServer,
  redirectUri: string,
): Promise<{ clientId: string; clientSecret?: string }> {
  const hit = clients.get(server);
  if (hit) return hit;

  const res = await fetch(AUTH_BASE[server].register, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Muster",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  if (!res.ok) throw new Error(`${server} registration ${res.status}`);
  const data = (await res.json()) as { client_id: string; client_secret?: string };
  const client = { clientId: data.client_id, clientSecret: data.client_secret };
  clients.set(server, client);
  return client;
}

export function authorizeUrl(args: {
  server: OAuthServer;
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  return (
    `${AUTH_BASE[args.server].authorize}?` +
    new URLSearchParams({
      client_id: args.clientId,
      redirect_uri: args.redirectUri,
      response_type: "code",
      scope: AUTH_BASE[args.server].scope,
      state: args.state,
      code_challenge: args.challenge,
      code_challenge_method: "S256",
    })
  );
}

export async function exchangeCode(args: {
  server: OAuthServer;
  code: string;
  verifier: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}): Promise<Connection> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: args.clientId,
    code_verifier: args.verifier,
  });
  if (args.clientSecret) body.set("client_secret", args.clientSecret);

  const res = await fetch(ENDPOINTS[args.server].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`${args.server} code exchange ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }

  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token) throw new Error(`${args.server} returned no refresh token`);

  return {
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    refreshToken: data.refresh_token,
  };
}
