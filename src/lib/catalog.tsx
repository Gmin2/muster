import type { ComponentType } from "react";
import type { z } from "zod";
import type { Panel, PanelType } from "./types";

import {
  RecordsPropsSchema,
  FilterPropsSchema,
  InsightsPropsSchema,
  TasksPropsSchema,
  ApprovalPropsSchema,
  DiffPropsSchema,
  ContextPropsSchema,
  RecommendationPropsSchema,
  StreamPropsSchema,
  ToolsPropsSchema,
} from "./schema";

import {
  toRecordRows,
  toFilterRows,
  toInsightPages,
  toTaskRows,
  toApprovalQuestions,
  toDiffRows,
  toContextChunks,
  toRecommendationOptions,
  toStreamingTokens,
  toToolSteps,
} from "./adapters";

import RecordsTable from "../primitives/records-table";
import FilterTable from "../primitives/filter-table";
import InsightCards from "../primitives/insight-cards";
import TaskRows from "../primitives/task-rows";
import ApprovalCard from "../primitives/approval-card";
import DiffTable from "../primitives/diff-table";
import ContextCards from "../primitives/context-cards";
import RecommendationCard from "../primitives/recommendation-card";
import StreamingText from "../primitives/streaming-text";
import ToolChips from "../primitives/tool-chips";

/* The single registry. Adding a panel type means touching only this file, and
   `describe` is the entire steering mechanism the model gets — those sentences
   are prompt text, not documentation. */

/* The primitives take wildly different props, so the catalog erases them and the
   adapters are what keep the call sites honest. */
export type PanelComponent = ComponentType<Record<string, unknown>>;

export type CatalogEntry<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  type: PanelType;
  label: string;
  schema: S;
  Component: PanelComponent;
  adapt: (props: z.infer<S>, panel: Panel) => Record<string, unknown>;
  defaultSpan: 1 | 2 | 3;
  describe: string;
};

function entry<S extends z.ZodTypeAny>(e: CatalogEntry<S>): CatalogEntry {
  return e as unknown as CatalogEntry;
}

export const CATALOG: Record<PanelType, CatalogEntry> = {
  records: entry({
    type: "records",
    label: "Records table",
    schema: RecordsPropsSchema,
    Component: RecordsTable as PanelComponent,
    adapt: (p) => ({
      rows: toRecordRows(p),
      labels: {
        name: "Item",
        tags: "Labels",
        last: "Updated",
        strength: "Health",
        links: "Link",
      },
    }),
    defaultSpan: 2,
    describe:
      "A sortable table of items. Use for lists of PRs, issues or pages where the user needs to scan and compare. Best at span 2 or 3.",
  }),

  filter: entry({
    type: "filter",
    label: "Filter table",
    schema: FilterPropsSchema,
    Component: FilterTable as PanelComponent,
    adapt: (p) => ({
      rows: toFilterRows(p),
      labels: {
        columns: { task: "Item", date: "Due", status: "Status", owner: "Owner" },
      },
    }),
    defaultSpan: 2,
    describe:
      "A task table with status filter tabs. Use when items have clear todo/progress/done states.",
  }),

  insights: entry({
    type: "insights",
    label: "Metrics",
    schema: InsightsPropsSchema,
    Component: InsightCards as PanelComponent,
    adapt: (p) => ({ pages: toInsightPages(p), labels: { title: "Metrics" } }),
    defaultSpan: 1,
    describe:
      "One to three metric cards with a sparkline. Use for counts and trends over time. Best at span 1.",
  }),

  tasks: entry({
    type: "tasks",
    label: "Multi-step work",
    schema: TasksPropsSchema,
    Component: TaskRows as PanelComponent,
    adapt: (p) => ({ rows: toTaskRows(p) }),
    defaultSpan: 2,
    describe:
      "Rows of multi-step work with running/done status. Use to show what an agent is doing or did across sources.",
  }),

  approval: entry({
    type: "approval",
    label: "Approval gate",
    schema: ApprovalPropsSchema,
    Component: ApprovalCard as PanelComponent,
    adapt: (p) => ({
      questions: toApprovalQuestions(p),
      labels: { send: "Approve", sentMessage: "Sent back through MCP" },
    }),
    defaultSpan: 3,
    describe:
      "A human-in-the-loop question gate. MUST be used for anything that writes to a source. Never write without one.",
  }),

  diff: entry({
    type: "diff",
    label: "Change preview",
    schema: DiffPropsSchema,
    Component: DiffTable as PanelComponent,
    adapt: (p) => ({ rows: toDiffRows(p) }),
    defaultSpan: 2,
    describe: "A before/after table of what a write will change. Pair with approval.",
  }),

  context: entry({
    type: "context",
    label: "Attributed facts",
    schema: ContextPropsSchema,
    Component: ContextCards as PanelComponent,
    adapt: (p) => ({
      chunks: toContextChunks(p),
      labels: { header: "Retrieved", count: String(p.chunks.length) },
    }),
    defaultSpan: 2,
    describe:
      "Retrieved chunks with source attribution. Use to show where facts came from.",
  }),

  recommendation: entry({
    type: "recommendation",
    label: "Suggested action",
    schema: RecommendationPropsSchema,
    Component: RecommendationCard as PanelComponent,
    adapt: (p, panel) => ({
      options: toRecommendationOptions(p),
      labels: { title: p.question ?? panel.title, accepted: "Queued" },
    }),
    defaultSpan: 1,
    describe:
      "A single suggested action with a confidence meter. Use when there is one clear next step. Set `question` to the decision being put to the user.",
  }),

  stream: entry({
    type: "stream",
    label: "Synthesis",
    schema: StreamPropsSchema,
    Component: StreamingText as PanelComponent,
    adapt: (p) => ({
      ...toStreamingTokens(p),
      labels: { sources: `${p.citations.length} sources` },
    }),
    defaultSpan: 2,
    describe:
      "A prose answer with inline citations. Use ONLY when no structured panel fits. Prefer structure.",
  }),

  tools: entry({
    type: "tools",
    label: "Provenance",
    schema: ToolsPropsSchema,
    Component: ToolChips as PanelComponent,
    adapt: (p) => ({
      steps: toToolSteps(p),
      diffs: [],
      labels: { header: `${p.steps.length} tool calls` },
    }),
    defaultSpan: 3,
    describe:
      "Compact chips showing which source tools ran. Use as a provenance strip, span 3, lowest priority.",
  }),
};

export function getEntry(type: PanelType): CatalogEntry | null {
  return CATALOG[type] ?? null;
}

export function catalogForPrompt(): string {
  return Object.values(CATALOG)
    .map((e) => `- ${e.type} (default span ${e.defaultSpan}): ${e.describe}`)
    .join("\n");
}
