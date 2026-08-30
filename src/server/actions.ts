import type { ActionResult, WriteAction } from "../lib/types";
import { McpClient } from "./mcp";

/* Writes are allowlisted by name. Anything the model proposes that is not on
   this list is refused rather than attempted, which is the entire reason the
   approval gate exists. */
const ALLOWED = new Set(["github.comment"]);

const env = (key: string) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
};

const MCP_URL = () => env("GITHUB_MCP_URL") ?? "https://api.githubcopilot.com/mcp/";

function firstRepo(): [string, string] | null {
  const [slug] = (env("GITHUB_REPOS") ?? "").split(",");
  const [owner, repo] = (slug ?? "").trim().split("/");
  return owner && repo ? [owner, repo] : null;
}

/* One real write, and it is deliberately the safest useful one: a PR comment is
   visible, reversible by hand, and needs no scope the read path did not. */
export async function executeServer(action: WriteAction): Promise<ActionResult> {
  if (!ALLOWED.has(action.tool)) {
    return { ok: false, applied: `${action.tool} is not an allowed write` };
  }

  const token = env("GITHUB_TOKEN");
  const repo = firstRepo();
  const issue = Number(action.payload.pr ?? action.payload.issue);
  const body = String(action.payload.body ?? "Acknowledged from Muster.");

  if (!token || !repo || !Number.isFinite(issue)) {
    return { ok: true, applied: `${action.tool} on ${action.target} (simulated, GitHub not configured)` };
  }

  const [owner, name] = repo;

  // MCP first, same as the read path, so the write goes out the way the product
  // claims it does. REST underneath so a preview endpoint cannot eat the demo.
  try {
    const client = new McpClient(MCP_URL(), token, "github-mcp");
    const tool = await client.resolveTool(["add_issue_comment", "create_issue_comment"]);
    if (!tool) throw new Error("no comment tool exposed");
    await client.callWithSchema(tool, {
      owner,
      repo: name,
      issue_number: issue,
      issueNumber: issue,
      body,
    });
    return { ok: true, applied: `commented on #${issue} via MCP` };
  } catch (err) {
    console.warn("[muster] MCP write failed, falling back to REST:", err);
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues/${issue}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!res.ok) return { ok: false, applied: `GitHub refused the write (${res.status})` };
  return { ok: true, applied: `commented on #${issue}` };
}
