import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Connection } from "./mcp-oauth";

/* Per-visitor state, kept entirely in an encrypted cookie.

   A visitor who connects their own Notion has a real refresh token that must be
   stored somewhere. A database would mean infrastructure this project does not
   otherwise need, so it goes in a cookie instead: httpOnly so page scripts
   cannot read it, Secure in production, and AES-256-GCM encrypted so it is
   opaque and tamper evident even if the cookie itself leaks.

   The tradeoff is size. Cookies cap around 4KB, which comfortably holds two
   refresh tokens but would not hold twenty, so this scales to a handful of
   connected sources and no further. That is the right ceiling for this. */

const SECRET = process.env.SESSION_SECRET ?? "muster-dev-secret-not-for-production";
const KEY = createHash("sha256").update(SECRET).digest();

/* The development fallback is in a public repo, so on a real deployment it is a
   key everyone already has. Say so loudly rather than quietly encrypting
   visitors' refresh tokens with a published secret. */
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  console.warn(
    "[muster] SESSION_SECRET is not set. Visitor connection cookies are being " +
      "encrypted with the public development key. Set it: openssl rand -base64 32",
  );
}

export const CONNECTIONS_COOKIE = "muster_conn";
export const PENDING_COOKIE = "muster_oauth";

function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

function open<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    const [iv, tag, body] = raw.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(body), decipher.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    // Wrong key, tampered value, or an old cookie format. Treat as signed out
    // rather than failing the request.
    return null;
  }
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax", // Lax, not Strict: the OAuth provider redirects back to us
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

// ── Connected accounts ──────────────────────────────────────────────────────

export type Connections = Partial<Record<"notion" | "linear", Connection>>;

export function readConnections(cookies: Record<string, string>): Connections {
  return open<Connections>(cookies[CONNECTIONS_COOKIE]) ?? {};
}

export function writeConnections(next: Connections, secure: boolean): string {
  // 30 days, long enough that a judge revisiting the link stays connected.
  return cookie(CONNECTIONS_COOKIE, seal(next), 60 * 60 * 24 * 30, secure);
}

export function clearConnections(secure: boolean): string {
  return cookie(CONNECTIONS_COOKIE, "", 0, secure);
}

// ── The in-flight authorisation ─────────────────────────────────────────────

/* The PKCE verifier has to survive the round trip out to the provider and back,
   and it must not be readable by anything else, so it rides the same way. */
export type Pending = {
  server: "notion" | "linear";
  verifier: string;
  state: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
};

export function readPending(cookies: Record<string, string>): Pending | null {
  return open<Pending>(cookies[PENDING_COOKIE]);
}

export function writePending(pending: Pending, secure: boolean): string {
  return cookie(PENDING_COOKIE, seal(pending), 600, secure);
}

export function clearPending(secure: boolean): string {
  return cookie(PENDING_COOKIE, "", 0, secure);
}
