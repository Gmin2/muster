import { handle } from "../src/server/handler";

/* Every /api/* path goes through the same handler the dev server mounts, so
   there is one implementation and production cannot drift from local. */
export const config = { maxDuration: 60 };

export default async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : undefined;

  const result = await handle({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    cookieHeader: req.headers.get("cookie"),
    origin: url.origin,
    body,
  });

  const headers = new Headers();
  for (const c of result.cookies ?? []) headers.append("Set-Cookie", c);

  if (result.redirect) {
    headers.set("Location", result.redirect);
    return new Response(null, { status: result.status, headers });
  }

  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}
