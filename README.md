# Muster

Every other generative UI renders a card per tool call. Muster generates the
whole layout, across every server at once.

You connect MCP servers. You type one line, "what needs me today?", and instead
of a reply you get a screen: panels drawn from live data across every connected
source, sized and placed by what is actually urgent right now. The panels are
real interactive components. They persist. You act on them and the write goes
back out through MCP.

GitHub is connected over the Model Context Protocol for real, against GitHub's
hosted MCP server. The client speaks JSON-RPC over Streamable HTTP: initialize,
`tools/list`, `tools/call`. Nothing about the GitHub REST API is hardcoded, and
arguments are filtered against each tool's own advertised `inputSchema`, so the
server describes itself and the app adapts. The other four sources ship as
clearly labelled demo data, and the rail says which is which on every row.

There is no chat box and no message list. Asking again recomposes the grid in
place.

Built for BuildSprint 2026.

## Why this shape

MCP-UI is architected one resource per tool call, with no mechanism for
combining resources from different servers into one view. The Keyhole Effect
(arXiv 2602.00947) argues that chat's turn by turn card presentation
structurally prevents cross referencing several views at once. Muster is the
counter argument: the frame is fixed and hand built, and only the panel
composition is generative.

## How it works

```
browser ──POST /api/compose──> server
                                 │
             MCP tools/call ─────┤ gather   (github live, rest fixtures)
                                 │ digest
             chat/completions ───┤ model
                                 │ zod validate
browser <──── LayoutSpec ────────┘
```

Everything that needs a credential runs server side. That is not an
optimisation: Vite inlines every `VITE_` variable into the client bundle, so a
token named that way would be published to every visitor, and Notion and Linear
both refuse browser origins outright. There is a build check that greps the
bundle for the token to keep it that way.

1. **Gather.** Every connected source is fetched in parallel and normalised to a
   flat `SourceItem`. A source that fails is marked and the others still land.
2. **Digest.** Items are compacted to one line each, grouped by source, capped.
3. **Compose.** One model call returns a `LayoutSpec`: a title, a rationale, and
   3 to 6 panels each carrying a type, a span of 1 to 3, a priority, its source
   attribution and its props.
4. **Validate.** Two stages. The envelope must parse or the whole thing falls
   back. Then each panel's props are checked against its own schema, and a panel
   that fails is dropped rather than taking the screen down. Total span is
   clamped to 12, panels sorted by priority.
5. **Render.** A three column grid. Each panel gets `col-span-{span}` and a
   reveal delay of `index * 60ms` capped at 240.

The model never sees the component prop types. It emits flat domain JSON and an
adapter layer translates. That separation is the reason bad model output
degrades to a missing panel instead of a crash.

### The screen is never empty

`fallbackLayout` builds a real dashboard from the gathered items with no model,
no network and no key: the oldest item as an approval gate, everything open as a
table, a per day volume sparkline, and a provenance strip. It runs whenever the
gateway is missing, slow, or returns something unusable, and the rail says so.

## The catalog

Ten panel types, each one a vendored primitive plus a zod schema plus an
adapter. The one line `describe` on each entry is what the model reads, so those
sentences are prompt text rather than documentation.

| Type | Panel |
| --- | --- |
| `records` | sortable table of items |
| `filter` | task table with status tabs |
| `insights` | metric cards with a sparkline |
| `tasks` | multi step work, running / done |
| `approval` | human in the loop gate, required before any write |
| `diff` | before and after of what a write will change |
| `context` | retrieved chunks with source attribution |
| `recommendation` | one suggested action with a confidence meter |
| `stream` | prose with inline citations, last resort |
| `tools` | provenance strip of which tools ran |

Adding a type means touching `lib/catalog.tsx` and nothing else.

## Sources

| Source | Transport | Auth |
| --- | --- | --- |
| GitHub | **MCP** `api.githubcopilot.com/mcp/` | PAT as Bearer |
| Notion | **MCP** `mcp.notion.com/mcp` | OAuth 2.1, DCR + PKCE |
| Linear | **MCP** `mcp.linear.app/mcp` | OAuth 2.1, DCR + PKCE |
| Gmail, Calendar | Google REST | OAuth, stored refresh token |

Each source has its HTTP API kept underneath its MCP path as a fallback, so a
preview endpoint having a bad afternoon degrades the transport rather than the
demo, and the rail says which one actually ran.

Notion and Linear refuse a static key on their MCP endpoints, but both advertise
Dynamic Client Registration and the `refresh_token` grant. That combination is
what makes them usable on a deployed demo:

```bash
node scripts/mcp-auth.mjs notion
node scripts/mcp-auth.mjs linear
```

Each registers a client on the fly, runs the PKCE consent once in your browser,
and writes the credentials straight into `.env`. No developer console, nothing to
copy by hand, and no visitor ever meets a consent screen. The scripts never print
the tokens, only the list of tools the server turned out to expose.

Gmail is the one that cannot work that way. Google will not let an unverified
app with Gmail scopes serve arbitrary users, and verification takes days, so
`scripts/google-auth.mjs` does the same authorise-once dance instead.

Each rail row is tagged with how its data actually arrived: `mcp`, `rest`,
`demo` or `error`. Nothing claims to be live when it is not.

Fixture sources are labelled `demo` in the rail, on every run. The fixtures are
written to cohere, same people and same projects across sources, so a cross
source panel looks genuinely correlated.

## Writes

One path, and it is gated. A panel that proposes a write must be an `approval`
panel carrying an `action`. On approve the browser posts to `/api/act`, the
server checks the tool against an allowlist, and only then calls out, over MCP
with REST underneath. The single real write is a GitHub PR comment, chosen
because it is visible and reversible by hand. Unconfigured sources acknowledge
the write and say plainly that they simulated it.

## Running it

```bash
pnpm install
cp .env.example .env    # fill in what you have, all of it is optional
pnpm dev
```

The dev server mounts the API itself, so there is one process and no CORS. With
an empty `.env` it runs entirely on demo data and the deterministic layout,
which is already a complete demo.

Copy `.env.example` for the full list. The two that matter most:

```
GITHUB_TOKEN=          # fine-grained PAT, read access to the repos below
GITHUB_REPOS=owner/repo,owner/other
LLM_API_KEY=           # any OpenAI compatible /chat/completions endpoint
```

The model is asked for one fenced json block. The server extracts it and retries
once with the error appended before falling back. No tool calling is required,
so a gateway with incomplete streaming or missing function support cannot break
the demo.

## Layout

```
api/                 Vercel functions, thin wrappers over src/server/handler
src/
  App.tsx            shell, owns all state
  components/        SourceRail, CommandBar, PanelGrid, PanelFrame
  server/            never reaches the browser
    mcp.ts           MCP client, Streamable HTTP + SSE, session handling
    providers.ts     github over MCP, linear, notion, fixtures
    compose.ts       gather -> digest -> model -> validate
    actions.ts       the allowlisted write path
    handler.ts       runtime agnostic request handler
  lib/
    types.ts         domain types, no React
    schema.ts        LayoutSpec and per panel prop schemas
    catalog-meta.ts  describe + default span, no React, shared with the server
    catalog.tsx      panel type -> component, schema, adapter
    adapters.tsx     domain JSON -> primitive props
    prompt.ts        system and user prompts
    digest.ts        source items -> compact model input
    fallback.ts      the deterministic layout
    compose.ts       client side, calls /api/compose
  primitives/        vendored, MIT
  atoms/             vendored, MIT
```

`src/server/handler.ts` is runtime agnostic: body in, JSON out. The Vite dev
middleware and the Vercel functions both wrap it, so there is one implementation
of the endpoint and dev cannot drift from production.

## Credits

UI primitives and design tokens are vendored from
[beautifului.dev](https://www.beautifului.dev/) by Turbo, MIT licensed, used as
a third party dependency. Two edits were made to the vendored files and both are
commented in place: `records-table` gained a `labels` prop for its column
headings, matching how the sibling primitives already work, and `tool-chips` now
hides its file diff strip when the caller passes no diffs. The shell chrome,
theme and rail choreography carry over from an earlier project of mine built on
the same tokens.
