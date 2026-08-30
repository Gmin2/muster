export type SourceId = "github" | "linear" | "notion" | "gmail" | "calendar";

export type SourceStatus = "live" | "fixture" | "error" | "disconnected";

/** How the data actually arrived. Shown in the rail so the screen never
 *  overstates what is real. */
export type Transport = "mcp" | "rest" | "fixture";

export type SourceState = {
  id: SourceId;
  label: string;
  status: SourceStatus;
  count: number | null; // null renders an em dash
  via?: Transport;
  error?: string;
};

// Normalised unit every source produces
export type SourceItem = {
  id: string;
  source: SourceId;
  kind: "pr" | "issue" | "event" | "email" | "page";
  title: string;
  url?: string;
  state?: string; // "open" | "merged" | "todo" | ...
  author?: string;
  updatedAt: string; // ISO string
  ageDays: number;
  labels?: string[];
  meta?: Record<string, string | number | boolean>;
};

export type PanelType =
  | "records"
  | "filter"
  | "insights"
  | "tasks"
  | "approval"
  | "diff"
  | "context"
  | "recommendation"
  | "stream"
  | "tools";

export type Panel = {
  id: string;
  type: PanelType;
  span: 1 | 2 | 3;
  priority: number;
  title: string;
  subtitle?: string;
  sources: SourceId[];
  props: unknown; // narrowed by schema.ts per type
};

export type LayoutSpec = {
  title: string;
  rationale?: string; // one line, shown in LayoutMeta
  panels: Panel[];
};

export type ComposeRequest = {
  query: string;
  connected: SourceId[];
};

export type ComposeResponse =
  | {
      ok: true;
      layout: LayoutSpec;
      meta: {
        ms: number;
        model: string;
        droppedPanels: string[];
        sources: SourceState[];
        /** which GitHub repos this layout was drawn from */
        repos?: string[];
      };
    }
  | {
      ok: false;
      error: string;
      layout: LayoutSpec; // ALWAYS present — the fallback layout
      sources: SourceState[];
      ms: number;
    };

export type AppStatus = "idle" | "composing" | "ready" | "error";

export type PanelAction =
  | { kind: "approve"; answers: Record<number, number[]> }
  | { kind: "reject" }
  | { kind: "select"; ids: string[] };

export type WriteAction = {
  tool: string;
  target: string;
  payload: Record<string, unknown>;
};

export type ActionResult = {
  ok: boolean;
  applied: string;
  undo?: string;
};
