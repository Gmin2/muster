#!/usr/bin/env node
/* Bundles the server into one self-contained file for the serverless function.
 *
 * Vercel transpiles api/*.ts but does not reliably pull in code imported from
 * outside api/, and this project is ESM, where a extensionless relative import
 * does not resolve at runtime either. Rather than fight either behaviour, the
 * whole server graph is bundled ahead of time so the function has exactly one
 * local import and nothing left to resolve.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/server/handler.ts"],
  outfile: "api/_server.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // node_modules stay external: Vercel installs them, and bundling them would
  // bloat the function for no gain.
  packages: "external",
  logLevel: "warning",
});

console.log("bundled src/server -> api/_server.js");
