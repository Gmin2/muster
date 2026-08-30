import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "../src/server/handler";

/* Every /api/* path goes through the same handler the dev server mounts, so
   there is one implementation and production cannot drift from local.

   Deliberately the Node signature rather than the Web Request/Response one:
   that signature makes Vercel infer the Edge runtime, where node:fs and
   node:crypto do not exist, and both are load bearing here. */
export const config = { runtime: "nodejs", maxDuration: 60 };

type VercelRequest = IncomingMessage & { body?: unknown };

async function readBody(req: VercelRequest): Promise<unknown> {
  // Vercel usually parses JSON for us, but not for every content type.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return {};
  }
}

export default async function route(req: VercelRequest, res: ServerResponse): Promise<void> {
  try {
    const host = req.headers.host ?? "localhost";
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
    const url = new URL(req.url ?? "/", `${proto}://${host}`);

    const result = await handle({
      method: req.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      cookieHeader: req.headers.cookie,
      origin: url.origin,
      body: req.method === "POST" ? await readBody(req) : undefined,
    });

    if (result.cookies?.length) res.setHeader("Set-Cookie", result.cookies);

    if (result.redirect) {
      res.statusCode = result.status;
      res.setHeader("Location", result.redirect);
      res.end();
      return;
    }

    res.statusCode = result.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result.body));
  } catch (err) {
    // Never let the function itself 500: the client can render a fallback
    // layout from any JSON body, but not from a Vercel error page.
    console.error("[muster] handler threw:", err);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 4) : undefined,
      }),
    );
  }
}
