var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/mcp-oauth.ts
function oauthConfigured(server, connection) {
  return Boolean(connection ?? connectionFromEnv(server));
}
function mcpUrl(server) {
  return env2(`${server.toUpperCase()}_MCP_URL`) ?? ENDPOINTS[server].mcp;
}
function currentRefreshToken(server, original) {
  return rotated.get(`${server}:${original.slice(-24)}`) ?? original;
}
function setRotateHandler(handler) {
  onRotate = handler;
}
function connectionFromEnv(server) {
  const k = KEYS(server);
  const clientId = env2(k.clientId);
  const refreshToken = env2(k.refresh);
  if (!clientId || !refreshToken) return null;
  return { clientId, clientSecret: env2(k.clientSecret), refreshToken };
}
function accessTokenFor(server, connection) {
  return async () => {
    const conn = connection ?? connectionFromEnv(server);
    if (!conn) throw new Error(`${server} MCP is not authorised`);
    const key = `${server}:${conn.refreshToken.slice(-24)}`;
    const hit = cache.get(key);
    if (hit && Date.now() < hit.expiresAt) return hit.token;
    const clientId = conn.clientId;
    const refresh = currentRefreshToken(server, conn.refreshToken);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId
    });
    if (conn.clientSecret) body.set("client_secret", conn.clientSecret);
    const res = await fetch(ENDPOINTS[server].token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok) {
      throw new Error(`${server} token refresh ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    const data = await res.json();
    if (data.refresh_token && data.refresh_token !== refresh) {
      rotated.set(`${server}:${conn.refreshToken.slice(-24)}`, data.refresh_token);
      onRotate?.(server, { ...conn, refreshToken: data.refresh_token });
    }
    cache.set(key, {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1e3
    });
    return data.access_token;
  };
}
async function registerClient(server, redirectUri) {
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
      token_endpoint_auth_method: "none"
    })
  });
  if (!res.ok) throw new Error(`${server} registration ${res.status}`);
  const data = await res.json();
  const client = { clientId: data.client_id, clientSecret: data.client_secret };
  clients.set(server, client);
  return client;
}
function authorizeUrl(args) {
  return `${AUTH_BASE[args.server].authorize}?` + new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: AUTH_BASE[args.server].scope,
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: "S256"
  });
}
async function exchangeCode(args) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: args.clientId,
    code_verifier: args.verifier
  });
  if (args.clientSecret) body.set("client_secret", args.clientSecret);
  const res = await fetch(ENDPOINTS[args.server].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    throw new Error(`${args.server} code exchange ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  const data = await res.json();
  if (!data.refresh_token) throw new Error(`${args.server} returned no refresh token`);
  return {
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    refreshToken: data.refresh_token
  };
}
var env2, ENDPOINTS, KEYS, cache, rotated, onRotate, AUTH_BASE, clients;
var init_mcp_oauth = __esm({
  "src/server/mcp-oauth.ts"() {
    env2 = (key) => {
      const v = process.env[key];
      return v && v.trim() ? v.trim() : void 0;
    };
    ENDPOINTS = {
      notion: { token: "https://mcp.notion.com/token", mcp: "https://mcp.notion.com/mcp" },
      linear: { token: "https://mcp.linear.app/token", mcp: "https://mcp.linear.app/mcp" }
    };
    KEYS = (server) => ({
      clientId: `${server.toUpperCase()}_MCP_CLIENT_ID`,
      clientSecret: `${server.toUpperCase()}_MCP_CLIENT_SECRET`,
      refresh: `${server.toUpperCase()}_MCP_REFRESH_TOKEN`
    });
    cache = /* @__PURE__ */ new Map();
    rotated = /* @__PURE__ */ new Map();
    onRotate = null;
    AUTH_BASE = {
      notion: {
        authorize: "https://mcp.notion.com/authorize",
        register: "https://mcp.notion.com/register",
        scope: "default"
      },
      linear: {
        authorize: "https://mcp.linear.app/authorize",
        register: "https://mcp.linear.app/register",
        scope: "read write"
      }
    };
    clients = /* @__PURE__ */ new Map();
  }
});

// src/server/persist.ts
var persist_exports = {};
__export(persist_exports, {
  installLocalPersistence: () => installLocalPersistence
});
import { readFileSync, writeFileSync, existsSync } from "node:fs";
function installLocalPersistence() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) return;
  setRotateHandler((server, next) => {
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
var init_persist = __esm({
  "src/server/persist.ts"() {
    init_mcp_oauth();
  }
});

// src/server/handler.ts
import { randomBytes as randomBytes2, createHash as createHash2 } from "node:crypto";

// src/lib/constants.ts
var PANEL_TYPES = [
  "records",
  "filter",
  "insights",
  "tasks",
  "approval",
  "diff",
  "context",
  "recommendation",
  "stream",
  "tools"
];
var SOURCE_IDS = [
  "github",
  "linear",
  "notion",
  "gmail",
  "calendar"
];

// src/lib/digest.ts
function digest(items) {
  if (!items || items.length === 0) {
    return "No live items returned from connected sources.";
  }
  const bySource = {};
  for (const item of items) {
    if (!bySource[item.source]) bySource[item.source] = [];
    bySource[item.source].push(item);
  }
  const lines = [];
  for (const [source, sourceItems] of Object.entries(bySource)) {
    lines.push(`## ${source} (${sourceItems.length} items)`);
    for (const item of sourceItems.slice(0, 15)) {
      const parts = [`- [${item.kind}] ${item.title}`];
      if (item.author) parts.push(`by ${item.author}`);
      if (item.state) parts.push(`state: ${item.state}`);
      if (typeof item.meta?.hoursAway === "number") {
        const h = item.meta.hoursAway;
        parts.push(h <= 0 ? "now" : h < 24 ? `in ${h}h` : `in ${Math.round(h / 24)}d`);
      } else if (item.ageDays !== void 0) {
        parts.push(`${item.ageDays}d old`);
      }
      if (item.labels && item.labels.length > 0) {
        parts.push(`labels: ${item.labels.join(",")}`);
      }
      if (item.meta) {
        const metaStr = Object.entries(item.meta).map(([k, v]) => `${k}=${v}`).join(" ");
        if (metaStr) parts.push(`(${metaStr})`);
      }
      lines.push(parts.join(" \xB7 "));
    }
  }
  const fullText = lines.join("\n");
  if (fullText.length > 8e3) {
    return fullText.slice(0, 8e3) + "\n... [truncated for context limit]";
  }
  return fullText;
}

// src/lib/catalog-meta.ts
var PANEL_META = {
  records: {
    label: "Records table",
    defaultSpan: 2,
    describe: "A sortable table of items. Use for lists of PRs, issues or pages where the user needs to scan and compare. Best at span 2 or 3."
  },
  filter: {
    label: "Filter table",
    defaultSpan: 2,
    describe: "A task table with status filter tabs. Use when items have clear todo/progress/done states."
  },
  insights: {
    label: "Metrics",
    defaultSpan: 1,
    describe: "One to three metric cards with a sparkline. Use for counts and trends over time. Best at span 1."
  },
  tasks: {
    label: "Multi-step work",
    defaultSpan: 2,
    describe: "Rows of multi-step work with running/done status. Use to show what an agent is doing or did across sources."
  },
  approval: {
    label: "Approval gate",
    defaultSpan: 3,
    describe: "A human-in-the-loop question gate. MUST be used for anything that writes to a source. Never write without one."
  },
  diff: {
    label: "Change preview",
    defaultSpan: 2,
    describe: "A before/after table of what a write will change. Pair with approval."
  },
  context: {
    label: "Attributed facts",
    defaultSpan: 2,
    describe: "Retrieved chunks with source attribution. Use to show where facts came from."
  },
  recommendation: {
    label: "Suggested action",
    defaultSpan: 1,
    describe: "A single suggested action with a confidence meter. Use when there is one clear next step. Set `question` to the decision being put to the user."
  },
  stream: {
    label: "Synthesis",
    defaultSpan: 2,
    describe: "A prose answer with inline citations. Use ONLY when no structured panel fits. Prefer structure."
  },
  tools: {
    label: "Provenance",
    defaultSpan: 3,
    describe: "Compact chips showing which source tools ran. Use as a provenance strip, span 3, lowest priority."
  }
};
function catalogForPrompt() {
  return PANEL_TYPES.map(
    (type) => `- ${type} (default span ${PANEL_META[type].defaultSpan}): ${PANEL_META[type].describe}`
  ).join("\n");
}

// src/lib/prompt.ts
function systemPrompt(catalog) {
  return `You are Muster. You do not answer questions in prose. You compose a
dashboard: you decide which panels exist, how wide they are and what order they
sit in, based on what is actually urgent in the data you are given.

PANEL CATALOG
${catalog}

COMPOSITION RULES
- Choose 3 to 6 panels. Never more than 7.
- Panel type must come from the catalog. Nothing else exists.
- Total span across all panels must be between 6 and 12.
- The most urgent thing gets span 3 and priority 0. Size means urgency.
- Every panel must declare which sources its data came from.
- Anything that writes must be an approval panel, optionally paired with diff.
- Prefer structured panels. Use stream only when nothing else fits.
- Do not invent data. Use only what is in the digest.
- Reply with ONE fenced json block and nothing else.

OUTPUT SHAPE
{
  "title": string,
  "rationale": string,
  "panels": [
    {
      "id": string,
      "type": one of the catalog names,
      "span": 1 | 2 | 3,
      "priority": integer, 0 is most urgent,
      "title": string,
      "subtitle": string,
      "sources": ["github", "linear", "notion", "gmail", "calendar"],
      "props": shaped per type, see the example
    }
  ]
}

PANEL PROPS BY TYPE
- records: { rows: [{ id, title, tags: string[], updated: "3d", health: "good"|"warn"|"bad"|"none", url? }] }
- filter: { rows: [{ task, date, status: "todo"|"progress"|"done", owner }] }
- insights: { cards: [{ key, pill, headline, prose, series: number[] }] }
- tasks: { rows: [{ key, label, amount, status: "done"|"running"|"sequence", details: [{ label, meta }] }] }
- approval: { questions: [{ q, type: "radio"|"check", options: string[] }], action?: { tool, target, payload } }
- diff: { rows: [{ key, id, label, detail, removed: boolean }] }
- context: { chunks: [{ title, body, source, badge, tone: "blue"|"green"|"orange"|"red" }] }
- recommendation: { question, options: [{ key, body, short, signal: 0-3, label, cta, tone: "green"|"orange"|"red" }] }
- stream: { text, citations: [{ name, domain, href }], followUps: string[] }
- tools: { steps: [{ icon: "think"|"read"|"write"|"run", label, chip, detail: string[] }] }

EXAMPLE
\`\`\`json
{
  "title": "Three things need you today",
  "rationale": "One PR has been failing CI for eleven days and is blocking the release branch.",
  "panels": [
    {
      "id": "p0",
      "type": "approval",
      "span": 3,
      "priority": 0,
      "title": "PR #482 has been red for 11 days",
      "subtitle": "Blocking the release branch, author has not responded",
      "sources": ["github"],
      "props": {
        "questions": [
          {
            "q": "How do you want to unblock #482?",
            "type": "radio",
            "options": ["Ask the author for a rebase", "Re-run CI", "Close it"]
          }
        ],
        "action": { "tool": "github.comment", "target": "#482", "payload": { "pr": 482 } }
      }
    },
    {
      "id": "p1",
      "type": "records",
      "span": 2,
      "priority": 1,
      "title": "Open pull requests",
      "subtitle": "Sorted by how long they have been waiting",
      "sources": ["github"],
      "props": {
        "rows": [
          { "id": "482", "title": "#482 fix auth race", "tags": ["bug", "auth"], "updated": "11d", "health": "bad" },
          { "id": "491", "title": "#491 bump deps", "tags": ["deps"], "updated": "2d", "health": "good" }
        ]
      }
    },
    {
      "id": "p2",
      "type": "insights",
      "span": 1,
      "priority": 2,
      "title": "Review throughput",
      "subtitle": "Last seven days",
      "sources": ["github", "linear"],
      "props": {
        "cards": [
          {
            "key": "merged",
            "pill": "Last 7 days",
            "headline": "14 merged.",
            "prose": "Steady, but review latency doubled midweek.",
            "series": [2, 3, 1, 4, 2, 1, 1]
          }
        ]
      }
    }
  ]
}
\`\`\``;
}
function userPrompt(query, digest2, scope) {
  const scoped = scope.length === 1 ? `The user has scoped this to ${scope[0]} only. Compose a layout that goes deeper on that one source rather than a thin summary.` : `All ${scope.length} servers are in scope. Prefer panels that cross-reference more than one of them.`;
  return `The user asked: "${query}"

${scoped}

Here is everything those servers are currently holding.

${digest2}

Compose the layout.`;
}

// src/lib/schema.ts
import { z } from "zod";
function looseEnum(values, synonyms, fallback) {
  return z.preprocess((raw) => {
    if (raw === void 0 || raw === null) return fallback;
    const key = String(raw).toLowerCase().replace(/[\s-]+/g, "_");
    if (values.includes(key)) return key;
    return synonyms[key] ?? fallback;
  }, z.enum(values));
}
var looseString = z.preprocess(
  (raw) => typeof raw === "number" || typeof raw === "boolean" ? String(raw) : raw,
  z.string()
);
var FILTER_STATUS = looseEnum(["todo", "progress", "done"], {
  in_progress: "progress",
  inprogress: "progress",
  started: "progress",
  doing: "progress",
  active: "progress",
  open: "todo",
  backlog: "todo",
  unstarted: "todo",
  pending: "todo",
  completed: "done",
  closed: "done",
  merged: "done",
  finished: "done"
}, "todo");
var TASK_STATUS = looseEnum(["done", "running", "sequence"], {
  in_progress: "running",
  progress: "running",
  active: "running",
  started: "running",
  completed: "done",
  closed: "done",
  passed: "done",
  queued: "sequence",
  pending: "sequence",
  waiting: "sequence",
  failed: "running"
}, "running");
var HEALTH = looseEnum(["good", "warn", "bad", "none"], {
  ok: "good",
  green: "good",
  passing: "good",
  passed: "good",
  healthy: "good",
  warning: "warn",
  yellow: "warn",
  stale: "warn",
  at_risk: "warn",
  error: "bad",
  red: "bad",
  failing: "bad",
  failed: "bad",
  failing_ci: "bad",
  critical: "bad",
  blocked: "bad",
  unknown: "none",
  neutral: "none",
  high: "bad",
  urgent: "bad",
  medium: "warn",
  moderate: "warn",
  low: "good",
  normal: "good",
  none: "none"
}, "good");
var TONE4 = looseEnum(["blue", "green", "orange", "red"], {
  info: "blue",
  neutral: "blue",
  success: "green",
  warning: "orange",
  warn: "orange",
  danger: "red",
  error: "red",
  critical: "red"
}, "blue");
var TONE3 = looseEnum(["green", "orange", "red"], {
  success: "green",
  high: "green",
  positive: "green",
  warning: "orange",
  warn: "orange",
  medium: "orange",
  danger: "red",
  error: "red",
  low: "red",
  critical: "red"
}, "green");
var TOOL_ICON = looseEnum(["think", "read", "write", "run"], {
  search: "read",
  list: "read",
  get: "read",
  fetch: "read",
  query: "read",
  create: "write",
  update: "write",
  comment: "write",
  post: "write",
  send: "write",
  plan: "think",
  reason: "think",
  compose: "think",
  analyze: "think",
  execute: "run",
  call: "run",
  invoke: "run"
}, "run");
var RecordsPropsSchema = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tags: z.array(z.string()).max(4).default([]),
      updated: looseString,
      // "3d" | "2h"
      health: HEALTH,
      url: z.string().optional()
    })
  ).min(1).max(12)
});
var FilterPropsSchema = z.object({
  rows: z.array(
    z.object({
      task: z.string(),
      date: looseString,
      status: FILTER_STATUS,
      owner: z.string()
    })
  ).min(1).max(15)
});
var InsightsPropsSchema = z.object({
  cards: z.array(
    z.object({
      key: z.string(),
      pill: looseString,
      // e.g. "Last 7 days"
      headline: looseString,
      // e.g. "14 PRs merged"
      prose: looseString,
      // plain text summary
      // One point is a degenerate sparkline, not a reason to lose the panel.
      series: z.array(z.number()).min(1).max(40)
    })
  ).min(1).max(3)
});
var TasksPropsSchema = z.object({
  rows: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      amount: looseString,
      // e.g. "3 files"
      status: TASK_STATUS,
      details: z.array(
        z.union([
          z.string(),
          z.object({ label: z.string(), meta: z.string().optional() })
        ])
      ).max(4).default([])
    })
  ).min(1).max(8)
});
var ApprovalPropsSchema = z.object({
  questions: z.array(
    z.object({
      q: z.string(),
      type: z.enum(["radio", "check"]).default("radio"),
      options: z.array(z.string()).min(2).max(5)
    })
  ).min(1).max(3),
  action: z.object({
    tool: z.string(),
    target: z.string(),
    payload: z.record(z.string(), z.unknown()).default({})
  }).optional()
});
var DiffPropsSchema = z.object({
  rows: z.array(
    z.object({
      key: z.string(),
      id: z.string(),
      label: z.string(),
      detail: z.string(),
      removed: z.boolean().default(false)
    })
  ).min(1).max(10)
});
var ContextPropsSchema = z.object({
  chunks: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      source: z.string(),
      badge: z.string(),
      tone: TONE4
    })
  ).min(1).max(6)
});
var RecommendationPropsSchema = z.object({
  question: z.string().max(120).optional(),
  options: z.array(
    z.object({
      key: z.string(),
      body: z.string(),
      short: z.string(),
      signal: z.number().min(0).max(3).default(2),
      label: z.string(),
      cta: z.string(),
      tone: TONE3
    })
  ).min(1).max(3)
});
var StreamPropsSchema = z.object({
  text: z.string().max(1200),
  citations: z.array(
    z.object({
      name: z.string(),
      domain: z.string(),
      href: z.string()
    })
  ).max(4).default([]),
  followUps: z.array(z.string()).max(3).default([])
});
var ToolsPropsSchema = z.object({
  steps: z.array(
    z.object({
      icon: TOOL_ICON,
      label: z.string(),
      chip: looseString,
      detail: z.array(z.string()).max(5).default([])
    })
  ).min(1).max(6)
});
var PanelPropSchemas = {
  records: RecordsPropsSchema,
  filter: FilterPropsSchema,
  insights: InsightsPropsSchema,
  tasks: TasksPropsSchema,
  approval: ApprovalPropsSchema,
  diff: DiffPropsSchema,
  context: ContextPropsSchema,
  recommendation: RecommendationPropsSchema,
  stream: StreamPropsSchema,
  tools: ToolsPropsSchema
};
var PanelSchema = z.object({
  id: z.string(),
  type: z.enum(Array.from(PANEL_TYPES)),
  span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  priority: z.number().int().min(0),
  title: z.string().max(80),
  subtitle: z.string().max(120).optional(),
  sources: z.array(z.enum(Array.from(SOURCE_IDS))).min(1),
  props: z.unknown()
});
var LayoutSchema = z.object({
  title: z.string().max(100),
  rationale: z.string().max(200).optional(),
  panels: z.array(PanelSchema).min(1).max(7)
});
function validateLayout(raw) {
  const parsed = LayoutSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid layout structure: ${parsed.error.message}`);
  }
  const rawLayout = parsed.data;
  const validPanels = [];
  const dropped = [];
  for (const panel of rawLayout.panels) {
    const propSchema = PanelPropSchemas[panel.type];
    if (!propSchema) {
      dropped.push(panel.id);
      continue;
    }
    const propParsed = propSchema.safeParse(panel.props);
    if (propParsed.success) {
      validPanels.push({
        ...panel,
        props: propParsed.data
      });
    } else {
      const why = propParsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      console.warn(`[muster] dropped panel ${panel.id} (${panel.type}) -> ${why}`);
      dropped.push(panel.id);
    }
  }
  validPanels.sort((a, b) => a.priority - b.priority);
  let totalSpan = 0;
  const clampedPanels = [];
  for (const p of validPanels) {
    if (totalSpan + p.span <= 12 || clampedPanels.length === 0) {
      clampedPanels.push(p);
      totalSpan += p.span;
    } else {
      dropped.push(p.id);
    }
  }
  return {
    layout: {
      title: rawLayout.title,
      rationale: rawLayout.rationale,
      panels: clampedPanels
    },
    dropped
  };
}

// src/lib/fallback.ts
var SOURCE_LABEL = {
  github: "GitHub",
  linear: "Linear",
  notion: "Notion",
  gmail: "Gmail",
  calendar: "Calendar"
};
function health(item) {
  if (item.meta?.ci === "failed") return "bad";
  if (item.ageDays >= 7) return "bad";
  if (item.ageDays >= 3) return "warn";
  return "good";
}
function weeklySeries(items) {
  const buckets = new Array(7).fill(0);
  for (const item of items) {
    const day = Math.min(Math.max(Math.floor(item.ageDays), 0), 6);
    buckets[6 - day] += 1;
  }
  return buckets;
}
function fallbackLayout(items) {
  const sources = [...new Set(items.map((i) => i.source))];
  const byAge = [...items].sort((a, b) => b.ageDays - a.ageDays);
  const stale = byAge.filter((i) => i.ageDays >= 3);
  const worst = byAge[0];
  const panels = [];
  if (worst) {
    panels.push({
      id: "fallback-approval",
      type: "approval",
      span: 3,
      priority: 0,
      title: worst.title,
      subtitle: `${SOURCE_LABEL[worst.source]} \xB7 untouched for ${worst.ageDays} days${worst.author ? ` \xB7 ${worst.author}` : ""}`,
      sources: [worst.source],
      props: {
        questions: [
          {
            q: "This is the oldest thing waiting on you. What should happen to it?",
            type: "radio",
            options: ["Nudge the author", "Pick it up myself", "Leave it for now"]
          }
        ],
        action: {
          tool: "github.comment",
          target: worst.title,
          payload: {
            pr: Number(worst.title.match(/#(\d+)/)?.[1] ?? 0),
            body: "Checking in on this one from Muster."
          }
        }
      }
    });
  }
  if (items.length > 0) {
    panels.push({
      id: "fallback-records",
      type: "records",
      span: 2,
      priority: 1,
      title: "Everything currently open",
      subtitle: "Oldest first, across every connected server",
      sources,
      props: {
        rows: byAge.slice(0, 10).map((item) => ({
          id: item.id,
          title: item.title,
          tags: (item.labels ?? [item.kind]).slice(0, 4),
          updated: `${item.ageDays}d`,
          health: health(item),
          url: item.url
        }))
      }
    });
    panels.push({
      id: "fallback-insights",
      type: "insights",
      span: 1,
      priority: 2,
      title: "Volume",
      subtitle: "Items touched per day this week",
      sources,
      props: {
        cards: [
          {
            key: "open",
            pill: `${sources.length} servers`,
            headline: `${items.length} open.`,
            prose: stale.length ? `${stale.length} of them have been sitting for three days or more.` : "Nothing has gone stale yet.",
            series: weeklySeries(items)
          }
        ]
      }
    });
  }
  panels.push({
    id: "fallback-tools",
    type: "tools",
    span: 3,
    priority: 3,
    title: "How this screen was built",
    subtitle: "The model was unavailable, so this layout is the deterministic one",
    sources: sources.length > 0 ? sources : ["github"],
    props: {
      steps: sources.map((id) => ({
        icon: "read",
        label: `${id}.list`,
        chip: `${items.filter((i) => i.source === id).length} items`,
        detail: [`Gathered from ${SOURCE_LABEL[id]}`]
      }))
    }
  });
  return {
    title: stale.length ? `${stale.length} things have been waiting on you` : "Nothing is overdue right now",
    rationale: "Composed without the model. Panels and sizes come from a fixed rule, not from urgency.",
    panels
  };
}

// src/lib/sources/fixtures.ts
var FIXTURE_ITEMS = [
  // Linear Issues
  {
    id: "linear-1",
    source: "linear",
    kind: "issue",
    title: "ENG-233 Session drops on page refresh in production",
    url: "https://linear.app/muster/issue/ENG-233",
    state: "in_progress",
    author: "sarah_k",
    updatedAt: "2026-08-29T14:20:00Z",
    ageDays: 1,
    labels: ["bug", "auth", "p0"],
    meta: { priority: "High", team: "Engineering" }
  },
  {
    id: "linear-2",
    source: "linear",
    kind: "issue",
    title: "ENG-241 Slow query on /api/v1/workspace/analytics",
    url: "https://linear.app/muster/issue/ENG-241",
    state: "todo",
    author: "devon_m",
    updatedAt: "2026-08-28T09:15:00Z",
    ageDays: 2,
    labels: ["performance", "backend"],
    meta: { priority: "Medium", team: "Backend" }
  },
  {
    id: "linear-3",
    source: "linear",
    kind: "issue",
    title: "ENG-219 Add OAuth scope validation for Slack integration",
    url: "https://linear.app/muster/issue/ENG-219",
    state: "in_progress",
    author: "alex_r",
    updatedAt: "2026-08-27T16:45:00Z",
    ageDays: 3,
    labels: ["security", "mcp"],
    meta: { priority: "High", team: "Security" }
  },
  {
    id: "linear-4",
    source: "linear",
    kind: "issue",
    title: "ENG-205 Dark mode color tokens contrast ratio audit",
    url: "https://linear.app/muster/issue/ENG-205",
    state: "done",
    author: "elena_v",
    updatedAt: "2026-08-26T11:00:00Z",
    ageDays: 4,
    labels: ["ui", "a11y"],
    meta: { priority: "Low", team: "Design" }
  },
  // Notion Pages
  {
    id: "notion-1",
    source: "notion",
    kind: "page",
    title: "Q3 2026 Architecture & MCP Roadmap",
    url: "https://notion.so/muster/q3-architecture-roadmap",
    state: "draft",
    author: "alex_r",
    updatedAt: "2026-08-29T10:00:00Z",
    ageDays: 1,
    labels: ["architecture", "roadmap"]
  },
  {
    id: "notion-2",
    source: "notion",
    kind: "page",
    title: "Incident Post-Mortem: Auth Gateway Latency Spike (Aug 24)",
    url: "https://notion.so/muster/post-mortem-aug-24",
    state: "review",
    author: "devon_m",
    updatedAt: "2026-08-28T18:30:00Z",
    ageDays: 2,
    labels: ["ops", "post-mortem"]
  },
  {
    id: "notion-3",
    source: "notion",
    kind: "page",
    title: "Customer Onboarding Specs & API Webhooks",
    url: "https://notion.so/muster/onboarding-spec",
    state: "published",
    author: "sarah_k",
    updatedAt: "2026-08-25T14:10:00Z",
    ageDays: 5,
    labels: ["docs", "api"]
  },
  // Gmail / Email
  {
    id: "gmail-1",
    source: "gmail",
    kind: "email",
    title: "Security Alert: New API Key scope requested for Github Sync",
    url: "https://mail.google.com/mail/u/0/#inbox/18a2bc4910f",
    state: "unread",
    author: "security-bot@muster.dev",
    updatedAt: "2026-08-30T07:12:00Z",
    ageDays: 0,
    labels: ["security", "urgent"]
  },
  {
    id: "gmail-2",
    source: "gmail",
    kind: "email",
    title: "Vercel Deployment Alert: Build sprint demo app staging",
    url: "https://mail.google.com/mail/u/0/#inbox/18a2b8e3902",
    state: "read",
    author: "notifications@vercel.com",
    updatedAt: "2026-08-29T22:05:00Z",
    ageDays: 1,
    labels: ["ci", "vercel"]
  },
  {
    id: "gmail-3",
    source: "gmail",
    kind: "email",
    title: "Re: Enterprise MCP server deployment timeline",
    url: "https://mail.google.com/mail/u/0/#inbox/18a29f8c122",
    state: "unread",
    author: "cto@partner.io",
    updatedAt: "2026-08-29T15:40:00Z",
    ageDays: 1,
    labels: ["partners", "high-priority"]
  },
  // Calendar Events
  {
    id: "cal-1",
    source: "calendar",
    kind: "event",
    title: "Sprint Review & Demo: BuildSprint 2026",
    state: "upcoming",
    author: "team@muster.dev",
    updatedAt: "2026-08-30T18:00:00Z",
    ageDays: 0,
    meta: { time: "18:00 IST", attendees: 4 }
  },
  {
    id: "cal-2",
    source: "calendar",
    kind: "event",
    title: "Architecture Sync: Zero-Knowledge Proof & Soroban",
    state: "upcoming",
    author: "alex_r",
    updatedAt: "2026-08-30T14:30:00Z",
    ageDays: 0,
    meta: { time: "14:30 IST", attendees: 3 }
  },
  {
    id: "cal-3",
    source: "calendar",
    kind: "event",
    title: "Customer Feedback: Generative Dashboard Usability",
    state: "completed",
    author: "sarah_k",
    updatedAt: "2026-08-29T11:00:00Z",
    ageDays: 1,
    meta: { time: "11:00 IST", attendees: 5 }
  }
];
var GITHUB_FIXTURES = [
  {
    id: "github-pr-482",
    source: "github",
    kind: "pr",
    title: "#482 fix(auth): resolve race condition in token refresh loop",
    url: "https://github.com/muster-org/muster/pull/482",
    state: "open",
    author: "alex_r",
    updatedAt: "2026-08-19T14:30:00Z",
    ageDays: 11,
    labels: ["bug", "auth", "p0"],
    meta: { repo: "muster-org/muster", ci: "failed", review: "requested" }
  },
  {
    id: "github-pr-475",
    source: "github",
    kind: "pr",
    title: "#475 perf(db): index workspace_id on mcp_logs",
    url: "https://github.com/muster-org/muster/pull/475",
    state: "open",
    author: "devon_m",
    updatedAt: "2026-08-26T19:00:00Z",
    ageDays: 4,
    labels: ["performance", "sql"],
    meta: { repo: "muster-org/muster", ci: "passed", review: "none" }
  },
  {
    id: "github-pr-491",
    source: "github",
    kind: "pr",
    title: "#491 chore(deps): bump @provablehq/sdk from 0.8.1 to 0.9.0",
    url: "https://github.com/muster-org/muster/pull/491",
    state: "open",
    author: "dependabot",
    updatedAt: "2026-08-29T08:15:00Z",
    ageDays: 1,
    labels: ["dependencies"],
    meta: { repo: "muster-org/muster", ci: "passed", review: "none" }
  },
  {
    id: "github-pr-488",
    source: "github",
    kind: "pr",
    title: "#488 feat(mcp): multi-server panel layout composition",
    url: "https://github.com/muster-org/muster/pull/488",
    state: "open",
    author: "mintu",
    updatedAt: "2026-08-30T04:20:00Z",
    ageDays: 0,
    labels: ["feature", "core"],
    meta: { repo: "muster-org/muster", ci: "running", review: "requested" }
  },
  {
    id: "github-issue-467",
    source: "github",
    kind: "issue",
    title: "#467 Session drops when the OAuth scope changes mid-flight",
    url: "https://github.com/muster-org/muster/issues/467",
    state: "open",
    author: "sarah_k",
    updatedAt: "2026-08-22T11:05:00Z",
    ageDays: 8,
    labels: ["bug", "auth"],
    meta: { repo: "muster-org/muster", comments: 6 }
  }
];

// src/server/mcp.ts
var PROTOCOL_VERSION = "2025-06-18";
function parseSse(body) {
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
    if (!data) continue;
    try {
      const msg = JSON.parse(data);
      if (msg.result !== void 0 || msg.error) return msg;
    } catch {
    }
  }
  return null;
}
var McpClient = class {
  /* The token may be a string, for servers that take a long lived PAT, or a
     function, for OAuth servers where the access token expires hourly and has to
     be minted from a refresh token on demand. */
  constructor(url, token, label = "mcp") {
    this.url = url;
    this.token = token;
    this.label = label;
  }
  sessionId = null;
  nextId = 1;
  ready = false;
  tools = null;
  async headers() {
    const token = typeof this.token === "function" ? await this.token() : this.token;
    const h = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Both, because the server picks which one it replies with.
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION
    };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }
  async rpc(method, params) {
    const id = this.nextId++;
    const res = await fetch(this.url, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });
    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (!res.ok) {
      throw new Error(`${this.label} ${method} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    const msg = contentType.includes("text/event-stream") ? parseSse(text) : JSON.parse(text);
    if (!msg) throw new Error(`${this.label} ${method} -> no response frame`);
    if (msg.error) throw new Error(`${this.label} ${method} -> ${msg.error.message}`);
    return msg.result;
  }
  /* A notification carries no id and gets no reply, so anything 2xx is success
     and the body is meaningless. */
  async notify(method) {
    await fetch(this.url, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method })
    });
  }
  async connect() {
    if (this.ready) return;
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "muster", version: "0.1.0" }
    });
    await this.notify("notifications/initialized");
    this.ready = true;
  }
  /* Memoised: resolving two tools used to cost two round trips, and the list
     cannot change inside one request. */
  async listTools() {
    if (this.tools) return this.tools;
    await this.connect();
    const result = await this.rpc("tools/list");
    this.tools = result.tools ?? [];
    return this.tools;
  }
  /* Tool results come back as content blocks rather than typed data. In practice
     servers return one text block holding JSON, so try to parse it and hand back
     the raw text if it turns out to be prose after all. */
  async callTool(name, args) {
    await this.connect();
    const result = await this.rpc("tools/call", { name, arguments: args });
    if (result.isError) {
      const detail = result.content?.map((c) => c.text).join(" ") ?? "unknown";
      throw new Error(`${this.label} tool ${name} failed: ${detail.slice(0, 200)}`);
    }
    if (result.structuredContent !== void 0) return result.structuredContent;
    const text = (result.content ?? []).filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  /* Servers rename tools between versions, so resolve by preference order and
     let the caller decide what to do when nothing matches. */
  async resolveTool(candidates) {
    const tools = await this.listTools();
    return candidates.map((c) => tools.find((t) => t.name === c)).find(Boolean) ?? null;
  }
  /* Call a tool using its own advertised schema to decide what to send. Servers
     disagree about perPage vs per_page and reject unknown properties, so offer
     every spelling and let the schema pick. This is the point of MCP: the server
     describes itself and we adapt, rather than hardcoding one API's shape. */
  async callWithSchema(tool, candidateArgs) {
    const schema = tool.inputSchema;
    const declared = schema?.properties ? Object.keys(schema.properties) : null;
    const args = declared ? Object.fromEntries(
      Object.entries(candidateArgs).filter(([key]) => declared.includes(key))
    ) : candidateArgs;
    for (const key of schema?.required ?? []) {
      if (!(key in args)) {
        throw new Error(`${this.label} tool ${tool.name} needs "${key}" and it was not supplied`);
      }
    }
    return this.callTool(tool.name, args);
  }
};

// src/server/google.ts
var env = (key) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : void 0;
};
function googleConfigured() {
  return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") && env("GOOGLE_REFRESH_TOKEN"));
}
var cached = null;
async function accessToken() {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) {
    throw new Error(`Google token refresh ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  const data = await res.json();
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1e3
  };
  return cached.token;
}
async function google(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}` }
  });
  if (!res.ok) throw new Error(`Google ${res.status} on ${new URL(url).pathname}`);
  return res.json();
}
function ageDays(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
}
var header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
function sender(raw) {
  const named = raw.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1].trim();
  return raw.replace(/[<>]/g, "").trim() || "unknown";
}
async function fetchGmail(limit) {
  const list = await google(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      "is:unread category:primary"
    )}&maxResults=${limit}`
  );
  const ids = (list.messages ?? []).slice(0, limit);
  const messages = await Promise.all(
    ids.map(
      (m) => google(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
      ).catch(() => null)
    )
  );
  return messages.filter((m) => Boolean(m)).map((msg) => {
    const iso = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
    return {
      id: `gmail-${msg.id}`,
      source: "gmail",
      kind: "email",
      title: header(msg, "Subject") || "(no subject)",
      url: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
      state: "unread",
      author: sender(header(msg, "From")),
      updatedAt: iso,
      ageDays: ageDays(iso),
      labels: (msg.labelIds ?? []).filter((l) => !l.startsWith("CATEGORY_")).slice(0, 3),
      meta: { snippet: (msg.snippet ?? "").slice(0, 120) }
    };
  });
}
async function fetchCalendar(limit) {
  const now = /* @__PURE__ */ new Date();
  const weekOut = new Date(now.getTime() + 7 * 864e5);
  const data = await google(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${weekOut.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=${limit}`
  );
  return (data.items ?? []).map((e) => {
    const startsAt = e.start?.dateTime ?? e.start?.date ?? now.toISOString();
    const start = new Date(startsAt);
    const hoursAway = Math.round((start.getTime() - now.getTime()) / 36e5);
    return {
      id: `calendar-${e.id}`,
      source: "calendar",
      kind: "event",
      title: e.summary ?? "(untitled event)",
      url: e.htmlLink,
      state: e.status ?? "confirmed",
      author: e.organizer?.displayName ?? e.organizer?.email ?? "",
      updatedAt: startsAt,
      // Calendar items are ahead of you, not behind, so age is always 0 and the
      // urgency signal is how soon it starts. The digest reads hoursAway.
      ageDays: 0,
      labels: e.start?.date ? ["all-day"] : [],
      meta: {
        hoursAway,
        attendees: e.attendees?.length ?? 0,
        startsAt
      }
    };
  });
}

// src/server/providers.ts
init_mcp_oauth();
var env3 = (key) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : void 0;
};
function ageDays2(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
}
var GH_CI_LOOKUPS = 6;
function ghRepos() {
  return (env3("GITHUB_REPOS") ?? "").split(",").map((slug) => slug.trim().split("/")).filter((p) => p.length === 2 && !!p[0] && !!p[1]);
}
async function gh(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}
async function ciState(owner, repo, sha, token) {
  try {
    const d = await gh(
      `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=30`,
      token
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
var GITHUB_MCP_URL = env3("GITHUB_MCP_URL") ?? "https://api.githubcopilot.com/mcp/";
function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["items", "results", "pull_requests", "issues", "data"]) {
      const inner = payload[key];
      if (Array.isArray(inner)) return inner;
    }
  }
  return [];
}
var str = (v, fallback = "") => typeof v === "string" ? v : fallback;
var num = (v) => typeof v === "number" ? v : null;
function labelsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => typeof l === "string" ? l : str(l?.name)).filter(Boolean);
}
async function fetchGithubMcp(limit) {
  const token = env3("GITHUB_TOKEN");
  const repos = ghRepos();
  if (!token || repos.length === 0) throw new Error("not configured");
  const client = new McpClient(GITHUB_MCP_URL, token, "github-mcp");
  const [prTool, issueTool] = await Promise.all([
    client.resolveTool(["list_pull_requests", "pull_requests_list"]),
    client.resolveTool(["list_issues", "issues_list"])
  ]);
  if (!prTool && !issueTool) throw new Error("github MCP exposed no list tools");
  const per = Math.max(3, Math.floor(limit / repos.length));
  const perRepo = await Promise.all(
    repos.map(async ([owner, repo]) => {
      const common = { owner, repo, state: "open", perPage: per, per_page: per, page: 1 };
      const items = [];
      const [prs, issues] = await Promise.all([
        prTool ? client.callWithSchema(prTool, common) : Promise.resolve(null),
        issueTool ? client.callWithSchema(issueTool, common) : Promise.resolve(null)
      ]);
      for (const pr of unwrapList(prs)) {
        const updated = str(pr.updated_at ?? pr.updatedAt, (/* @__PURE__ */ new Date()).toISOString());
        const number = num(pr.number) ?? 0;
        items.push({
          id: `github-pr-${repo}-${number}`,
          source: "github",
          kind: "pr",
          title: `#${number} ${str(pr.title, "untitled")}`,
          url: str(pr.html_url ?? pr.url) || void 0,
          state: pr.draft === true ? "draft" : "open",
          author: str(pr.user?.login, "unknown"),
          updatedAt: updated,
          ageDays: ageDays2(updated),
          labels: labelsOf(pr.labels),
          meta: { repo: `${owner}/${repo}`, via: "mcp" }
        });
      }
      for (const issue of unwrapList(issues)) {
        if (issue.pull_request) continue;
        const updated = str(issue.updated_at ?? issue.updatedAt, (/* @__PURE__ */ new Date()).toISOString());
        const number = num(issue.number) ?? 0;
        items.push({
          id: `github-issue-${repo}-${number}`,
          source: "github",
          kind: "issue",
          title: `#${number} ${str(issue.title, "untitled")}`,
          url: str(issue.html_url ?? issue.url) || void 0,
          state: "open",
          author: str(issue.user?.login, "unknown"),
          updatedAt: updated,
          ageDays: ageDays2(updated),
          labels: labelsOf(issue.labels),
          meta: { repo: `${owner}/${repo}`, via: "mcp" }
        });
      }
      return items;
    })
  );
  const out = perRepo.flat();
  if (out.length === 0) throw new Error("github MCP returned nothing");
  return out;
}
async function fetchGithub(limit) {
  const token = env3("GITHUB_TOKEN");
  const repos = ghRepos();
  if (!token || repos.length === 0) throw new Error("not configured");
  const per = Math.max(3, Math.floor(limit / repos.length));
  const out = [];
  for (const [owner, repo] of repos) {
    const pulls = await gh(`/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=asc&per_page=${per}`, token);
    const ci = await Promise.all(
      pulls.map(
        (pr, i) => i < GH_CI_LOOKUPS ? ciState(owner, repo, pr.head.sha, token) : Promise.resolve("unknown")
      )
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
        ageDays: ageDays2(pr.updated_at),
        labels: pr.labels.map((l) => l.name),
        meta: {
          repo: `${owner}/${repo}`,
          ci: ci[i],
          review: (pr.requested_reviewers?.length ?? 0) > 0 ? "requested" : "none"
        }
      });
    }
    const issues = await gh(`/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=asc&per_page=${per}`, token);
    for (const issue of issues) {
      if (issue.pull_request) continue;
      out.push({
        id: `github-issue-${repo}-${issue.number}`,
        source: "github",
        kind: "issue",
        title: `#${issue.number} ${issue.title}`,
        url: issue.html_url,
        state: "open",
        author: issue.user?.login ?? "unknown",
        updatedAt: issue.updated_at,
        ageDays: ageDays2(issue.updated_at),
        labels: issue.labels.map((l) => l.name),
        meta: { repo: `${owner}/${repo}`, comments: issue.comments }
      });
    }
  }
  return out;
}
var LINEAR_QUERY = `
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
async function fetchLinear(limit) {
  const key = env3("LINEAR_API_KEY");
  if (!key) throw new Error("not configured");
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: key.startsWith("lin_oauth") ? `Bearer ${key}` : key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: LINEAR_QUERY, variables: { n: limit } })
  });
  if (!res.ok) throw new Error(`Linear ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`Linear: ${body.errors[0].message}`);
  return (body.data?.issues.nodes ?? []).map((i) => ({
    id: `linear-${i.id}`,
    source: "linear",
    kind: "issue",
    title: `${i.identifier} ${i.title}`,
    url: i.url,
    state: i.state.type === "started" ? "in_progress" : i.state.name.toLowerCase(),
    author: i.assignee?.displayName ?? "unassigned",
    updatedAt: i.updatedAt,
    ageDays: ageDays2(i.updatedAt),
    labels: i.labels.nodes.map((l) => l.name),
    meta: { priority: i.priority, status: i.state.name }
  }));
}
function notionTitle(page) {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}
async function fetchNotion(limit) {
  const token = env3("NOTION_TOKEN");
  if (!token) throw new Error("not configured");
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: limit
    })
  });
  if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const body = await res.json();
  return body.results.map((page) => ({
    id: `notion-${page.id}`,
    source: "notion",
    kind: "page",
    title: notionTitle(page),
    url: page.url,
    state: "page",
    updatedAt: page.last_edited_time,
    ageDays: ageDays2(page.last_edited_time),
    labels: [],
    meta: {}
  }));
}
var pick = (o, ...keys) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object") {
      const inner = v.content ?? v.title;
      if (typeof inner === "string" && inner) return inner;
    }
  }
  return "";
};
async function fetchNotionMcp(limit, conn) {
  if (!oauthConfigured("notion", conn)) throw new Error("not authorised");
  const client = new McpClient(mcpUrl("notion"), accessTokenFor("notion", conn), "notion-mcp");
  const tool = await client.resolveTool([
    "notion-list-recent-pages",
    "notion-search",
    "search"
  ]);
  if (!tool) throw new Error("notion MCP exposed no page listing tool");
  const searching = tool.name.includes("search");
  const raw = await client.callWithSchema(tool, {
    limit,
    page_size: limit,
    ...searching ? { query: "project", query_type: "internal" } : {}
  });
  return unwrapList(raw).filter((r) => str(r.type, "page") === "page").slice(0, limit).map((r, i) => {
    const stamp = pick(r, "timestamp", "last_edited_time", "lastEditedTime");
    const url = pick(r, "url", "href");
    return {
      id: `notion-${pick(r, "id") || url || i}`,
      source: "notion",
      kind: "page",
      title: pick(r, "title", "name", "text") || "Untitled",
      url: url || void 0,
      state: "page",
      updatedAt: stamp || (/* @__PURE__ */ new Date()).toISOString(),
      ageDays: stamp ? ageDays2(stamp) : 0,
      labels: [],
      meta: {
        via: "mcp",
        // Position in Notion's own recency ordering, 1 being most recent.
        recency: i + 1,
        ...stamp ? {} : { dated: false }
      }
    };
  });
}
async function fetchLinearMcp(limit, conn) {
  if (!oauthConfigured("linear", conn)) throw new Error("not authorised");
  const client = new McpClient(mcpUrl("linear"), accessTokenFor("linear", conn), "linear-mcp");
  const tool = await client.resolveTool(["list_issues", "list_my_issues", "issues"]);
  if (!tool) throw new Error("linear MCP exposed no issue tool");
  const raw = await client.callWithSchema(tool, {
    limit,
    first: limit,
    includeArchived: false
  });
  return unwrapList(raw).slice(0, limit).map((r, i) => {
    const updated = pick(r, "updatedAt", "updated_at") || (/* @__PURE__ */ new Date()).toISOString();
    const identifier = pick(r, "identifier", "key");
    const title = pick(r, "title", "name") || "Untitled";
    return {
      id: `linear-${pick(r, "id") || i}`,
      source: "linear",
      kind: "issue",
      title: identifier ? `${identifier} ${title}` : title,
      url: pick(r, "url", "href") || void 0,
      state: pick(r, "state", "status") || "open",
      author: pick(r, "assignee", "assigneeName") || "unassigned",
      updatedAt: updated,
      ageDays: ageDays2(updated),
      labels: [],
      meta: { via: "mcp" }
    };
  });
}
function mcpFirst(viaMcp, viaRest, label) {
  return async (n, conn) => {
    try {
      return { items: await viaMcp(n, conn), via: "mcp" };
    } catch (err) {
      console.warn(`[muster] ${label} MCP unavailable, using its HTTP API:`, err);
      return { items: await viaRest(n), via: "rest" };
    }
  };
}
async function githubLive(limit) {
  try {
    return { items: await fetchGithubMcp(limit), via: "mcp" };
  } catch (err) {
    console.warn("[muster] github MCP failed, falling back to REST:", err);
    return { items: await fetchGithub(limit), via: "rest" };
  }
}
var fixturesFor = (id) => FIXTURE_ITEMS.filter((i) => i.source === id);
var PROVIDERS = {
  github: {
    label: "GitHub",
    configured: () => Boolean(env3("GITHUB_TOKEN")) && ghRepos().length > 0,
    live: githubLive,
    fixture: GITHUB_FIXTURES
  },
  linear: {
    label: "Linear",
    configured: (conn) => oauthConfigured("linear", conn) || Boolean(env3("LINEAR_API_KEY")),
    live: mcpFirst(fetchLinearMcp, fetchLinear, "linear"),
    fixture: fixturesFor("linear")
  },
  notion: {
    label: "Notion",
    configured: (conn) => oauthConfigured("notion", conn) || Boolean(env3("NOTION_TOKEN")),
    live: mcpFirst(fetchNotionMcp, fetchNotion, "notion"),
    fixture: fixturesFor("notion")
  },
  gmail: {
    label: "Gmail",
    configured: googleConfigured,
    live: async (n) => ({ items: await fetchGmail(n), via: "rest" }),
    fixture: fixturesFor("gmail")
  },
  calendar: {
    label: "Calendar",
    configured: googleConfigured,
    live: async (n) => ({ items: await fetchCalendar(n), via: "rest" }),
    fixture: fixturesFor("calendar")
  }
};
var CACHE_MS = 6e4;
var gatherCache = /* @__PURE__ */ new Map();
function cacheKey(id, conns) {
  const own = conns?.[id]?.refreshToken;
  return own ? `${id}:${own.slice(-16)}` : id;
}
async function gatherServer(ids, limit = 20, connections) {
  const results = await Promise.all(
    ids.map(async (id) => {
      const key = cacheKey(id, connections);
      const hit = gatherCache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        return { ...hit.state, items: hit.items };
      }
      const provider = PROVIDERS[id];
      if (!provider) {
        return { id, label: id, status: "disconnected", count: null, items: [] };
      }
      const conn = connections?.[id];
      if (!provider.configured(conn)) {
        const items = provider.fixture.slice(0, limit);
        return {
          id,
          label: provider.label,
          status: "fixture",
          via: "fixture",
          count: items.length,
          items
        };
      }
      try {
        const { items, via } = await provider.live(limit, conn);
        const capped = items.slice(0, limit);
        const state = {
          id,
          label: provider.label,
          status: "live",
          via,
          count: capped.length
        };
        gatherCache.set(key, { at: Date.now(), items: capped, state });
        return { ...state, items: capped };
      } catch (err) {
        return {
          id,
          label: provider.label,
          status: "error",
          via: void 0,
          count: null,
          items: [],
          error: err instanceof Error ? err.message : String(err)
        };
      }
    })
  );
  return {
    items: results.flatMap((r) => r.items),
    states: results.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      count: r.count,
      via: r.via,
      error: "error" in r ? r.error : void 0
    }))
  };
}

// src/server/compose.ts
var env4 = (key) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : void 0;
};
var MODEL = () => env4("LLM_MODEL") ?? env4("LATENT_MODEL") ?? "gpt-4o-mini";
var BASE_URL = () => (env4("LLM_BASE_URL") ?? env4("LATENT_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
var API_KEY = () => env4("LLM_API_KEY") ?? env4("LATENT_API_KEY") ?? env4("OPENAI_API_KEY");
function gatewayConfigured() {
  return Boolean(API_KEY());
}
function modelName() {
  return gatewayConfigured() ? MODEL() : "no gateway";
}
async function chat(messages) {
  const res = await fetch(`${BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: MODEL(), stream: false, messages })
  });
  if (!res.ok) {
    throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("gateway returned an empty message");
  return content;
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate.trim()) throw new Error("no json found in the reply");
  return JSON.parse(candidate);
}
async function completeLayout(system, user) {
  if (!API_KEY()) throw new Error("no model API key configured");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
  const first = await chat(messages);
  try {
    return extractJson(first);
  } catch {
    const second = await chat([
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content: "That was not valid JSON. Reply with only one fenced json block containing the LayoutSpec, and nothing else."
      }
    ]);
    return extractJson(second);
  }
}
async function composeServer(req, connections) {
  const start = Date.now();
  const { items, states } = await gatherServer(req.connected, 20, connections);
  try {
    const raw = await completeLayout(
      systemPrompt(catalogForPrompt()),
      userPrompt(req.query, digest(items), req.connected)
    );
    const { layout, dropped } = validateLayout(raw);
    return {
      ok: true,
      layout,
      meta: { ms: Date.now() - start, model: MODEL(), droppedPanels: dropped, sources: states }
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn("[muster] compose fell back to the deterministic layout:", error);
    return {
      ok: false,
      error,
      layout: fallbackLayout(items),
      sources: states,
      ms: Date.now() - start
    };
  }
}

// src/server/actions.ts
var ALLOWED = /* @__PURE__ */ new Set(["github.comment"]);
var env5 = (key) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : void 0;
};
var MCP_URL = () => env5("GITHUB_MCP_URL") ?? "https://api.githubcopilot.com/mcp/";
function firstRepo() {
  const [slug] = (env5("GITHUB_REPOS") ?? "").split(",");
  const [owner, repo] = (slug ?? "").trim().split("/");
  return owner && repo ? [owner, repo] : null;
}
async function executeServer(action) {
  if (!ALLOWED.has(action.tool)) {
    return { ok: false, applied: `${action.tool} is not an allowed write` };
  }
  const token = env5("GITHUB_TOKEN");
  const repo = firstRepo();
  const issue = Number(action.payload.pr ?? action.payload.issue);
  const body = String(action.payload.body ?? "Acknowledged from Muster.");
  if (!token || !repo || !Number.isFinite(issue)) {
    return { ok: true, applied: `${action.tool} on ${action.target} (simulated, GitHub not configured)` };
  }
  const [owner, name] = repo;
  try {
    const client = new McpClient(MCP_URL(), token, "github-mcp");
    const tool = await client.resolveTool(["add_issue_comment", "create_issue_comment"]);
    if (!tool) throw new Error("no comment tool exposed");
    await client.callWithSchema(tool, {
      owner,
      repo: name,
      issue_number: issue,
      issueNumber: issue,
      body
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ body })
    }
  );
  if (!res.ok) return { ok: false, applied: `GitHub refused the write (${res.status})` };
  return { ok: true, applied: `commented on #${issue}` };
}

// src/server/handler.ts
init_mcp_oauth();

// src/server/session.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
var SECRET = process.env.SESSION_SECRET ?? "muster-dev-secret-not-for-production";
var KEY = createHash("sha256").update(SECRET).digest();
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  console.warn(
    "[muster] SESSION_SECRET is not set. Visitor connection cookies are being encrypted with the public development key. Set it: openssl rand -base64 32"
  );
}
var CONNECTIONS_COOKIE = "muster_conn";
var PENDING_COOKIE = "muster_oauth";
function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
function open(raw) {
  if (!raw) return null;
  try {
    const [iv, tag, body] = raw.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(body), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } catch {
    return null;
  }
}
function parseCookies(header2) {
  const out = {};
  for (const part of (header2 ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookie(name, value, maxAgeSeconds, secure) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    // Lax, not Strict: the OAuth provider redirects back to us
    `Max-Age=${maxAgeSeconds}`
  ];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}
function readConnections(cookies) {
  return open(cookies[CONNECTIONS_COOKIE]) ?? {};
}
function writeConnections(next, secure) {
  return cookie(CONNECTIONS_COOKIE, seal(next), 60 * 60 * 24 * 30, secure);
}
function readPending(cookies) {
  return open(cookies[PENDING_COOKIE]);
}
function writePending(pending, secure) {
  return cookie(PENDING_COOKIE, seal(pending), 600, secure);
}
function clearPending(secure) {
  return cookie(PENDING_COOKIE, "", 0, secure);
}

// src/server/handler.ts
var json = (body, status = 200) => ({ status, body });
var OAUTH_SERVERS = /* @__PURE__ */ new Set(["notion", "linear"]);
function parseConnected(raw) {
  const allowed = new Set(SOURCE_IDS);
  const ids = Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
  const kept = ids.filter((id) => allowed.has(id));
  return kept.length > 0 ? kept : [...SOURCE_IDS];
}
var persistenceReady = false;
async function handle(req) {
  if (!persistenceReady) {
    persistenceReady = true;
    try {
      const { installLocalPersistence: installLocalPersistence2 } = await Promise.resolve().then(() => (init_persist(), persist_exports));
      installLocalPersistence2();
    } catch {
    }
  }
  const cookies = parseCookies(req.cookieHeader);
  const secure = req.origin.startsWith("https://");
  switch (req.path) {
    case "/api/status": {
      const connections = readConnections(cookies);
      return json({
        model: modelName(),
        // Lets the rail show Connect versus Disconnect without another call.
        connected: {
          notion: Boolean(connections.notion ?? connectionFromEnv("notion")),
          linear: Boolean(connections.linear ?? connectionFromEnv("linear"))
        },
        // True only when it is the visitor's own account rather than the owner's.
        own: { notion: Boolean(connections.notion), linear: Boolean(connections.linear) }
      });
    }
    case "/api/compose": {
      if (req.method !== "POST") return json({ error: "POST only" }, 405);
      const input = req.body ?? {};
      const query = typeof input.query === "string" && input.query.trim() ? input.query.trim().slice(0, 400) : "what needs me today?";
      return json(
        await composeServer(
          { query, connected: parseConnected(input.connected) },
          readConnections(cookies)
        )
      );
    }
    case "/api/act": {
      if (req.method !== "POST") return json({ error: "POST only" }, 405);
      const input = req.body ?? {};
      if (typeof input.tool !== "string") return json({ ok: false, applied: "no tool named" });
      return json(
        await executeServer({
          tool: input.tool,
          target: typeof input.target === "string" ? input.target : "",
          payload: input.payload ?? {}
        })
      );
    }
    /* Start the connect flow. Registers a client on the fly, because both these
       servers support Dynamic Client Registration, then sends the visitor off to
       consent with the PKCE verifier parked in a short lived cookie. */
    case "/api/oauth/start": {
      const server = req.query.server;
      if (!OAUTH_SERVERS.has(server)) return json({ error: "unknown server" }, 400);
      const redirectUri = `${req.origin}/api/oauth/callback`;
      const client = await registerClient(server, redirectUri);
      const verifier = randomBytes2(32).toString("base64url");
      const challenge = createHash2("sha256").update(verifier).digest("base64url");
      const state = randomBytes2(16).toString("hex");
      return {
        status: 302,
        redirect: authorizeUrl({
          server,
          clientId: client.clientId,
          redirectUri,
          state,
          challenge
        }),
        cookies: [
          writePending(
            {
              server,
              verifier,
              state,
              clientId: client.clientId,
              clientSecret: client.clientSecret,
              redirectUri
            },
            secure
          )
        ]
      };
    }
    case "/api/oauth/callback": {
      const pending = readPending(cookies);
      const fail = (why) => ({
        status: 302,
        redirect: `/?connect=error&reason=${encodeURIComponent(why)}`,
        cookies: [clearPending(secure)]
      });
      if (!pending) return fail("the sign-in expired, try again");
      if (req.query.error) return fail(req.query.error);
      if (req.query.state !== pending.state) return fail("state mismatch");
      if (!req.query.code) return fail("no code returned");
      try {
        const connection = await exchangeCode({
          server: pending.server,
          code: req.query.code,
          verifier: pending.verifier,
          clientId: pending.clientId,
          clientSecret: pending.clientSecret,
          redirectUri: pending.redirectUri
        });
        const next = { ...readConnections(cookies), [pending.server]: connection };
        return {
          status: 302,
          redirect: `/?connect=${pending.server}`,
          cookies: [writeConnections(next, secure), clearPending(secure)]
        };
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    }
    /* Forgets this visitor's account. It does not revoke the grant upstream,
       so the wording in the UI says "disconnect" rather than anything stronger. */
    case "/api/oauth/disconnect": {
      const server = req.query.server;
      if (!OAUTH_SERVERS.has(server)) return json({ error: "unknown server" }, 400);
      const next = { ...readConnections(cookies) };
      delete next[server];
      return {
        status: 302,
        redirect: "/?connect=removed",
        cookies: [writeConnections(next, secure)]
      };
    }
    default:
      return json({ error: "not found" }, 404);
  }
}
export {
  handle
};
