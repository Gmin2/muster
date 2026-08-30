import type { SourceAdapter } from "./types";
import { GITHUB_FIXTURES } from "./fixtures";

/* Client side this is fixtures only. The live GitHub path, over MCP with a REST
   fallback, lives in src/server/providers.ts because the token must not reach
   the bundle. This adapter is what renders when the API endpoint is unreachable. */
export const githubAdapter: SourceAdapter = {
  id: "github",
  label: "GitHub",
  isLive: () => false,
  fetch: async (limit) => GITHUB_FIXTURES.slice(0, limit),
};
