import type { PanelType } from "./types";
import { PANEL_TYPES } from "./constants";

/* The half of the catalog that has no React in it, so the server can build the
   prompt and validate a layout without loading a single component. `describe` is
   the entire steering mechanism the model gets: these sentences are prompt text,
   not documentation, and editing one changes what gets composed. */

export type PanelMeta = {
  label: string;
  defaultSpan: 1 | 2 | 3;
  describe: string;
};

export const PANEL_META: Record<PanelType, PanelMeta> = {
  records: {
    label: "Records table",
    defaultSpan: 2,
    describe:
      "A sortable table of items. Use for lists of PRs, issues or pages where the user needs to scan and compare. Best at span 2 or 3.",
  },
  filter: {
    label: "Filter table",
    defaultSpan: 2,
    describe:
      "A task table with status filter tabs. Use when items have clear todo/progress/done states.",
  },
  insights: {
    label: "Metrics",
    defaultSpan: 1,
    describe:
      "One to three metric cards with a sparkline. Use for counts and trends over time. Best at span 1.",
  },
  tasks: {
    label: "Multi-step work",
    defaultSpan: 2,
    describe:
      "Rows of multi-step work with running/done status. Use to show what an agent is doing or did across sources.",
  },
  approval: {
    label: "Approval gate",
    defaultSpan: 3,
    describe:
      "A human-in-the-loop question gate. MUST be used for anything that writes to a source. Never write without one.",
  },
  diff: {
    label: "Change preview",
    defaultSpan: 2,
    describe: "A before/after table of what a write will change. Pair with approval.",
  },
  context: {
    label: "Attributed facts",
    defaultSpan: 2,
    describe: "Retrieved chunks with source attribution. Use to show where facts came from.",
  },
  recommendation: {
    label: "Suggested action",
    defaultSpan: 1,
    describe:
      "A single suggested action with a confidence meter. Use when there is one clear next step. Set `question` to the decision being put to the user.",
  },
  stream: {
    label: "Synthesis",
    defaultSpan: 2,
    describe:
      "A prose answer with inline citations. Use ONLY when no structured panel fits. Prefer structure.",
  },
  tools: {
    label: "Provenance",
    defaultSpan: 3,
    describe:
      "Compact chips showing which source tools ran. Use as a provenance strip, span 3, lowest priority.",
  },
};

export function catalogForPrompt(): string {
  return PANEL_TYPES.map(
    (type) => `- ${type} (default span ${PANEL_META[type].defaultSpan}): ${PANEL_META[type].describe}`,
  ).join("\n");
}
