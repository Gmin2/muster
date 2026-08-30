import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setRotateHandler, type OAuthServer } from "./mcp-oauth";

/* Keeps a rotated refresh token across restarts in local development by writing
   it back to .env. Deliberately does nothing in production: a serverless
   filesystem is ephemeral, so writing there would be a lie that hides the real
   problem rather than solving it. */
export function installLocalPersistence(): void {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) return;

  setRotateHandler((server: OAuthServer, next) => {
    const key = `${server.toUpperCase()}_MCP_REFRESH_TOKEN`;
    process.env[key] = next.refreshToken;
    try {
      if (!existsSync(".env")) return;
      const lines = readFileSync(".env", "utf8").split("\n");
      const i = lines.findIndex((l) => l.startsWith(`${key}=`));
      if (i >= 0) lines[i] = `${key}=${next.refreshToken}`;
      else lines.push(`${key}=${next.refreshToken}`);
      writeFileSync(".env", lines.join("\n"));
      console.log(`[muster] ${server} rotated its refresh token, saved to .env`);
    } catch (err) {
      console.warn(`[muster] could not persist the rotated ${server} token:`, err);
    }
  });
}
