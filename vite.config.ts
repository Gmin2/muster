import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/* Mounts the real API inside the dev server. It loads the same handler module
   the deployed function uses, through ssrLoadModule so edits hot reload, which
   means there is no separate dev backend to keep in sync. Source tokens and the
   model key are read here, in node, and never reach the browser bundle. */
function musterApi(): Plugin {
  return {
    name: "muster-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        if (!url.pathname.startsWith("/api/")) return next();

        try {
          const mod = await server.ssrLoadModule("/src/server/handler.ts");

          let body: unknown;
          if (req.method === "POST") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
          }

          const result = await mod.handle({
            method: req.method ?? "GET",
            path: url.pathname,
            query: Object.fromEntries(url.searchParams),
            cookieHeader: req.headers.cookie,
            origin: url.origin,
            body,
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
          server.config.logger.error(`[muster-api] ${err instanceof Error ? err.stack : err}`);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  /* Vite only exposes VITE_ prefixed variables, and only to the client. The
     server modules read plain process.env, so load the unprefixed ones here.
     They stay in the node process and never reach the bundle, which is the
     whole reason the tokens are named without the prefix. */
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
  plugins: [react(), tailwindcss(), musterApi()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  };
});
