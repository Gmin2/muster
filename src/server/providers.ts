import type { SourceId, SourceItem, SourceState, Transport } from "../lib/types";
import { FIXTURE_ITEMS, GITHUB_FIXTURES } from "../lib/sources/fixtures";
import { McpClient } from "./mcp";
import { fetchGmail, fetchCalendar, googleConfigured } from "./google";
import { accessTokenFor, mcpUrl, oauthConfigured, type Connection } from "./mcp-oauth";

/* Every real API call lives here and nowhere else. This module only ever runs on
   the server, which buys two things the browser cannot have: the tokens stay out
   of the bundle, and CORS stops existing. Notion refuses browser origins outright
   and Linear tells you not to use a personal key from one, so this is not an
   optimisation, it is the only way those two can work at all. */

const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
};

function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

// ── GitHub ──────────────────────────────────────────────────────────────────

const GH_CI_LOOKUPS = 6;

function ghRepos(): [string, string][] {
  return (env("GITHUB_REPOS") ?? "")
    .split(",")
    .map((slug) => slug.trim().split("/"))
    .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1]);
}

async function gh<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

/* One word for the whole run, because a table cell has room for one word.
   A failure outranks anything still running, which outranks a pass. */
async function ciState(owner: string, repo: string, sha: string, token: string) {
  try {
    const d = await gh<{ check_runs: { conclusion: string | null; status: string }[] }>(
      `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=30`,
      token,
    );
    if (d.check_runs.length === 0) return "none";
    if (d.check_runs.some((r) => r.status !== "completed")) return "running";
    if (d.check_runs.some((r) => r.conclusion === "failure" || r.conclusion === "timed_out")) {
      return "failed";
    }
    return "passed";
  } catch {
    return "unknown";
  }
}

/* GitHub over MCP. This is the real thing: initialize, ask the server what tools
   it has, then call them. Nothing about the GitHub REST API is encoded here
   beyond the tool names to look for, and even those are resolved by preference
   rather than assumed. */
const GITHUB_MCP_URL = env("GITHUB_MCP_URL") ?? "https://api.githubcopilot.com/mcp/";

/* MCP tool output is shaped by whoever wrote the server, so pull the array out
   of whatever wrapper came back rather than assuming a top level list. */
function unwrapList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    for (const key of ["items", "results", "pull_requests", "issues", "data"]) {
      const inner = (payload as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner as Record<string, unknown>[];
    }
  }
  return [];
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

function labelsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => (typeof l === "string" ? l : str((l as Record<string, unknown>)?.name)))
    .filter(Boolean);
}

async function fetchGithubMcp(limit: number): Promise<SourceItem[]> {
  const token = env("GITHUB_TOKEN");
  const repos = ghRepos();
  if (!token || repos.length === 0) throw new Error("not configured");

  const client = new McpClient(GITHUB_MCP_URL, token, "github-mcp");
  const [prTool, issueTool] = await Promise.all([
    client.resolveTool(["list_pull_requests", "pull_requests_list"]),
    client.resolveTool(["list_issues", "issues_list"]),
  ]);
  if (!prTool && !issueTool) throw new Error("github MCP exposed no list tools");

  const per = Math.max(3, Math.floor(limit / repos.length));

  // Repos in parallel. Serially this was the single biggest cost in a compose.
  const perRepo = await Promise.all(
    repos.map(async ([owner, repo]) => {
      // Every spelling these servers have used; the schema decides which survive.
      const common = { owner, repo, state: "open", perPage: per, per_page: per, page: 1 };
      const items: SourceItem[] = [];

      const [prs, issues] = await Promise.all([
        prTool ? client.callWithSchema(prTool, common) : Promise.resolve(null),
        issueTool ? client.callWithSchema(issueTool, common) : Promise.resolve(null),
      ]);

      for (const pr of unwrapList(prs)) {
        const updated = str(pr.updated_at ?? pr.updatedAt, new Date().toISOString());
        const number = num(pr.number) ?? 0;
        items.push({
          id: `github-pr-${repo}-${number}`,
          source: "github",
          kind: "pr",
          title: `#${number} ${str(pr.title, "untitled")}`,
          url: str(pr.html_url ?? pr.url) || undefined,
          state: pr.draft === true ? "draft" : "open",
          author: str((pr.user as Record<string, unknown>)?.login, "unknown"),
          updatedAt: updated,
          ageDays: ageDays(updated),
          labels: labelsOf(pr.labels),
          meta: { repo: `${owner}/${repo}`, via: "mcp" },
        });
      }

      for (const issue of unwrapList(issues)) {
        if (issue.pull_request) continue; // this tool returns PRs too
        const updated = str(issue.updated_at ?? issue.updatedAt, new Date().toISOString());
        const number = num(issue.number) ?? 0;
        items.push({
          id: `github-issue-${repo}-${number}`,
          source: "github",
          kind: "issue",
          title: `#${number} ${str(issue.title, "untitled")}`,
          url: str(issue.html_url ?? issue.url) || undefined,
          state: "open",
          author: str((issue.user as Record<string, unknown>)?.login, "unknown"),
          updatedAt: updated,
          ageDays: ageDays(updated),
          labels: labelsOf(issue.labels),
          meta: { repo: `${owner}/${repo}`, via: "mcp" },
        });
      }

      return items;
    }),
  );

  const out = perRepo.flat();

  if (out.length === 0) throw new Error("github MCP returned nothing");
  return out;
}

async function fetchGithub(limit: number): Promise<SourceItem[]> {
  const token = env("GITHUB_TOKEN");
  const repos = ghRepos();
  if (!token || repos.length === 0) throw new Error("not configured");

  const per = Math.max(3, Math.floor(limit / repos.length));
  const out: SourceItem[] = [];

  for (const [owner, repo] of repos) {
    const pulls = await gh<
      {
        number: number;
        title: string;
        html_url: string;
        draft: boolean;
        updated_at: string;
        user: { login: string } | null;
        labels: { name: string }[];
        head: { sha: string };
        requested_reviewers: unknown[] | null;
      }[]
    >(`/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=asc&per_page=${per}`, token);

    const ci = await Promise.all(
      pulls.map((pr, i) =>
        i < GH_CI_LOOKUPS ? ciState(owner, repo, pr.head.sha, token) : Promise.resolve("unknown"),
      ),
    );

    for (const [i, pr] of pulls.entries()) {
      out.push({
        id: `github-pr-${repo}-${pr.number}`,
        source: "github",
        kind: "pr",
        title: `#${pr.number} ${pr.title}`,
        url: pr.html_url,
        state: pr.draft ? "draft" : "open",
        author: pr.user?.login ?? "unknown",
        updatedAt: pr.updated_at,
        ageDays: ageDays(pr.updated_at),
        labels: pr.labels.map((l) => l.name),
        meta: {
          repo: `${owner}/${repo}`,
          ci: ci[i],
          review: (pr.requested_reviewers?.length ?? 0) > 0 ? "requested" : "none",
        },
      });
    }

    const issues = await gh<
      {
        number: number;
        title: string;
        html_url: string;
        updated_at: string;
        user: { login: string } | null;
        labels: { name: string }[];
        comments: number;
        pull_request?: unknown;
      }[]
    >(`/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=asc&per_page=${per}`, token);

    for (const issue of issues) {
      if (issue.pull_request) continue; // this endpoint returns PRs too
      out.push({
        id: `github-issue-${repo}-${issue.number}`,
        source: "github",
        kind: "issue",
        title: `#${issue.number} ${issue.title}`,
        url: issue.html_url,
        state: "open",
        author: issue.user?.login ?? "unknown",
        updatedAt: issue.updated_at,
        ageDays: ageDays(issue.updated_at),
        labels: issue.labels.map((l) => l.name),
        meta: { repo: `${owner}/${repo}`, comments: issue.comments },
      });
    }
  }

  return out;
}

// ── Linear ──────────────────────────────────────────────────────────────────

const LINEAR_QUERY = `
query Muster($n: Int!) {
  issues(
    first: $n
    filter: { state: { type: { nin: ["completed", "canceled"] } } }
    orderBy: updatedAt
  ) {
    nodes {
      id identifier title url updatedAt priority
      state { name type }
      assignee { displayName }
      labels { nodes { name } }
    }
  }
}`;

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  updatedAt: string;
  priority: number;
  state: { name: string; type: string };
  assignee: { displayName: string } | null;
  labels: { nodes: { name: string }[] };
};

async function fetchLinear(limit: number): Promise<SourceItem[]> {
  // Personal API keys go in Authorization with no Bearer prefix. OAuth tokens do
  // use Bearer, which is the usual reason a working key looks unauthorized.
  const key = env("LINEAR_API_KEY");
  if (!key) throw new Error("not configured");

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: key.startsWith("lin_oauth") ? `Bearer ${key}` : key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: LINEAR_QUERY, variables: { n: limit } }),
  });

  if (!res.ok) throw new Error(`Linear ${res.status}`);
  const body = (await res.json()) as {
    data?: { issues: { nodes: LinearIssue[] } };
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(`Linear: ${body.errors[0].message}`);

  return (body.data?.issues.nodes ?? []).map((i) => ({
    id: `linear-${i.id}`,
    source: "linear" as const,
    kind: "issue" as const,
    title: `${i.identifier} ${i.title}`,
    url: i.url,
    state: i.state.type === "started" ? "in_progress" : i.state.name.toLowerCase(),
    author: i.assignee?.displayName ?? "unassigned",
    updatedAt: i.updatedAt,
    ageDays: ageDays(i.updatedAt),
    labels: i.labels.nodes.map((l) => l.name),
    meta: { priority: i.priority, status: i.state.name },
  }));
}

// ── Notion ──────────────────────────────────────────────────────────────────

type NotionPage = {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, { type: string; title?: { plain_text: string }[] }>;
};

/* Notion has no fixed title field. The one property whose type is "title" is the
   title, whatever the database happens to call it. */
function notionTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

async function fetchNotion(limit: number): Promise<SourceItem[]> {
  const token = env("NOTION_TOKEN");
  if (!token) throw new Error("not configured");

  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: limit,
    }),
  });

  if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const body = (await res.json()) as { results: NotionPage[] };

  // An integration only sees pages that have been explicitly shared with it, so
  // an empty list here usually means nobody hit "Connect" on the page.
  return body.results.map((page) => ({
    id: `notion-${page.id}`,
    source: "notion" as const,
    kind: "page" as const,
    title: notionTitle(page),
    url: page.url,
    state: "page",
    updatedAt: page.last_edited_time,
    ageDays: ageDays(page.last_edited_time),
    labels: [],
    meta: {},
  }));
}

// ── Notion and Linear over MCP ──────────────────────────────────────────────

/* These two only accept OAuth on their MCP endpoints, so they run off a refresh
   token minted once by scripts/mcp-auth.mjs. Tool names differ between server
   versions and are not worth hardcoding, so each is resolved from a candidate
   list and the results are normalised defensively: an MCP tool returns whatever
   its author decided, not a typed record. */

const pick = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    // Notion nests its title under properties, so accept one level of object
    if (v && typeof v === "object") {
      const inner = (v as Record<string, unknown>).content ?? (v as Record<string, unknown>).title;
      if (typeof inner === "string" && inner) return inner;
    }
  }
  return "";
};

async function fetchNotionMcp(limit: number, conn?: Connection): Promise<SourceItem[]> {
  if (!oauthConfigured("notion", conn)) throw new Error("not authorised");

  const client = new McpClient(mcpUrl("notion"), accessTokenFor("notion", conn), "notion-mcp");

  /* notion-list-recent-pages is the right tool for "what needs me": it takes no
     query and returns pages already ordered by how recently they were touched.
     notion-search is the fallback, but it rejects an empty query, so it only
     works with something to search for. */
  const tool = await client.resolveTool([
    "notion-list-recent-pages",
    "notion-search",
    "search",
  ]);
  if (!tool) throw new Error("notion MCP exposed no page listing tool");

  const searching = tool.name.includes("search");
  const raw = await client.callWithSchema(tool, {
    limit,
    page_size: limit,
    ...(searching ? { query: "project", query_type: "internal" } : {}),
  });

  return unwrapList(raw)
    .filter((r) => str(r.type, "page") === "page")
    .slice(0, limit)
    .map((r, i) => {
      /* The recent-pages tool returns no timestamps, only order, so ordering is
         the signal and inventing dates would be a lie. Search does carry one,
         so use it when it is there. */
      const stamp = pick(r, "timestamp", "last_edited_time", "lastEditedTime");
      const url = pick(r, "url", "href");
      return {
        id: `notion-${pick(r, "id") || url || i}`,
        source: "notion" as const,
        kind: "page" as const,
        title: pick(r, "title", "name", "text") || "Untitled",
        url: url || undefined,
        state: "page",
        updatedAt: stamp || new Date().toISOString(),
        ageDays: stamp ? ageDays(stamp) : 0,
        labels: [],
        meta: {
          via: "mcp",
          // Position in Notion's own recency ordering, 1 being most recent.
          recency: i + 1,
          ...(stamp ? {} : { dated: false }),
        },
      };
    });
}

async function fetchLinearMcp(limit: number, conn?: Connection): Promise<SourceItem[]> {
  if (!oauthConfigured("linear", conn)) throw new Error("not authorised");

  const client = new McpClient(mcpUrl("linear"), accessTokenFor("linear", conn), "linear-mcp");
  const tool = await client.resolveTool(["list_issues", "list_my_issues", "issues"]);
  if (!tool) throw new Error("linear MCP exposed no issue tool");

  const raw = await client.callWithSchema(tool, {
    limit,
    first: limit,
    includeArchived: false,
  });

  return unwrapList(raw)
    .slice(0, limit)
    .map((r, i) => {
      const updated = pick(r, "updatedAt", "updated_at") || new Date().toISOString();
      const identifier = pick(r, "identifier", "key");
      const title = pick(r, "title", "name") || "Untitled";
      return {
        id: `linear-${pick(r, "id") || i}`,
        source: "linear" as const,
        kind: "issue" as const,
        title: identifier ? `${identifier} ${title}` : title,
        url: pick(r, "url", "href") || undefined,
        state: pick(r, "state", "status") || "open",
        author: pick(r, "assignee", "assigneeName") || "unassigned",
        updatedAt: updated,
        ageDays: ageDays(updated),
        labels: [],
        meta: { via: "mcp" },
      };
    });
}

/* MCP first, the HTTP API underneath. A source that has been authorised for MCP
   uses it; one that only has an API key still works. */
function mcpFirst(
  viaMcp: (n: number, conn?: Connection) => Promise<SourceItem[]>,
  viaRest: (n: number) => Promise<SourceItem[]>,
  label: string,
) {
  return async (n: number, conn?: Connection): Promise<LiveResult> => {
    try {
      return { items: await viaMcp(n, conn), via: "mcp" };
    } catch (err) {
      console.warn(`[muster] ${label} MCP unavailable, using its HTTP API:`, err);
      return { items: await viaRest(n), via: "rest" };
    }
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

type LiveResult = { items: SourceItem[]; via: Transport };

type Provider = {
  label: string;
  configured: (conn?: Connection) => boolean;
  live: (limit: number, conn?: Connection) => Promise<LiveResult>;
  fixture: SourceItem[];
};

/* MCP is the intended path. REST is kept underneath it because a demo that goes
   blank when a preview endpoint has a bad afternoon is worse than one that says
   plainly how the data arrived, and the rail reports which of the two ran. */
async function githubLive(limit: number): Promise<LiveResult> {
  try {
    return { items: await fetchGithubMcp(limit), via: "mcp" };
  } catch (err) {
    console.warn("[muster] github MCP failed, falling back to REST:", err);
    return { items: await fetchGithub(limit), via: "rest" };
  }
}

const fixturesFor = (id: SourceId) => FIXTURE_ITEMS.filter((i) => i.source === id);

const PROVIDERS: Record<SourceId, Provider> = {
  github: {
    label: "GitHub",
    configured: () => Boolean(env("GITHUB_TOKEN")) && ghRepos().length > 0,
    live: githubLive,
    fixture: GITHUB_FIXTURES,
  },
  linear: {
    label: "Linear",
    configured: (conn) => oauthConfigured("linear", conn) || Boolean(env("LINEAR_API_KEY")),
    live: mcpFirst(fetchLinearMcp, fetchLinear, "linear"),
    fixture: fixturesFor("linear"),
  },
  notion: {
    label: "Notion",
    configured: (conn) => oauthConfigured("notion", conn) || Boolean(env("NOTION_TOKEN")),
    live: mcpFirst(fetchNotionMcp, fetchNotion, "notion"),
    fixture: fixturesFor("notion"),
  },
  gmail: {
    label: "Gmail",
    configured: googleConfigured,
    live: async (n) => ({ items: await fetchGmail(n), via: "rest" }),
    fixture: fixturesFor("gmail"),
  },
  calendar: {
    label: "Calendar",
    configured: googleConfigured,
    live: async (n) => ({ items: await fetchCalendar(n), via: "rest" }),
    fixture: fixturesFor("calendar"),
  },
};

/* Gathering is the slow half of a compose: real MCP round trips per source. A
   short cache means the first visitor pays for it and everyone arriving in the
   next minute does not, which matters a lot when several people open the same
   demo link at once. Keyed per source so a focused compose reuses what the
   all-sources one already fetched. */
const CACHE_MS = 60_000;
type CacheEntry = { at: number; items: SourceItem[]; state: SourceState };
const gatherCache = new Map<string, CacheEntry>();

function cacheKey(id: SourceId, conns: Connections | undefined): string {
  // A visitor with their own connection must never be served the owner's data.
  const own = conns?.[id as "notion" | "linear"]?.refreshToken;
  return own ? `${id}:${own.slice(-16)}` : id;
}

/** Per-visitor MCP connections, read off their cookie. */
export type Connections = Partial<Record<"notion" | "linear", Connection>>;

/* Which sources are configured, and why not when they are not. Reports presence
   and shape only, never values, so it is safe to serve publicly and is the
   fastest way to tell a missing env var from a malformed one. */
export function configReport(): Record<string, string> {
  const repos = ghRepos();
  return {
    github: !env("GITHUB_TOKEN")
      ? "no GITHUB_TOKEN"
      : repos.length === 0
        ? `GITHUB_REPOS unusable, expected owner/repo, got ${JSON.stringify(env("GITHUB_REPOS") ?? "")}`
        : `ready, ${repos.length} repo(s)`,
    notion: oauthConfigured("notion")
      ? "ready via MCP"
      : env("NOTION_TOKEN")
        ? "ready via HTTP"
        : "not authorised",
    linear: oauthConfigured("linear")
      ? "ready via MCP"
      : env("LINEAR_API_KEY")
        ? "ready via HTTP"
        : "not authorised",
    google: googleConfigured() ? "ready" : "not authorised",
    model: process.env.LLM_API_KEY ? "ready" : "no LLM_API_KEY",
  };
}

/* One source failing must never take the screen down, so every provider is
   settled independently. A configured source that errors is reported as an
   error rather than quietly swapped for demo data under a green dot. */
export async function gatherServer(
  ids: SourceId[],
  limit = 20,
  connections?: Connections,
): Promise<{ items: SourceItem[]; states: SourceState[] }> {
  const results = await Promise.all(
    ids.map(async (id) => {
      const key = cacheKey(id, connections);
      const hit = gatherCache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        return { ...hit.state, items: hit.items };
      }

      const provider = PROVIDERS[id];
      if (!provider) {
        return { id, label: id, status: "disconnected" as const, count: null, items: [] };
      }

      const conn = connections?.[id as "notion" | "linear"];
      if (!provider.configured(conn)) {
        const items = provider.fixture.slice(0, limit);
        return {
          id,
          label: provider.label,
          status: "fixture" as const,
          via: "fixture" as Transport,
          count: items.length,
          items,
        };
      }

      try {
        const { items, via } = await provider.live(limit, conn);
        const capped = items.slice(0, limit);
        const state = {
          id,
          label: provider.label,
          status: "live" as const,
          via,
          count: capped.length,
        };
        gatherCache.set(key, { at: Date.now(), items: capped, state });
        return { ...state, items: capped };
      } catch (err) {
        return {
          id,
          label: provider.label,
          status: "error" as const,
          via: undefined,
          count: null,
          items: [] as SourceItem[],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return {
    items: results.flatMap((r) => r.items),
    states: results.map((r) => ({
      id: r.id as SourceId,
      label: r.label,
      status: r.status,
      count: r.count,
      via: r.via,
      error: "error" in r ? (r.error as string) : undefined,
    })),
  };
}
