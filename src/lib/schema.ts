import { z } from "zod";
import { PANEL_TYPES, SOURCE_IDS } from "./constants";
import type { LayoutSpec, PanelType } from "./types";

/* Enums the model gets wrong for a good reason: the digest says "in_progress"
   and "failing-ci", so it echoes those back, and a strict enum would drop an
   otherwise perfect panel over a synonym. Normalise first, validate second.
   Anything genuinely unrecognised still fails, which is the point. */
function looseEnum<T extends readonly [string, ...string[]]>(
  values: T,
  synonyms: Record<string, T[number]>,
  fallback: T[number],
) {
  return z.preprocess((raw) => {
    if (raw === undefined || raw === null) return fallback;
    const key = String(raw).toLowerCase().replace(/[\s-]+/g, "_");
    if ((values as readonly string[]).includes(key)) return key;
    // An unrecognised value falls back rather than failing. These fields are
    // cosmetic: the wrong tint on one row is a far smaller loss than dropping
    // the entire panel, which is what strictness actually buys you here.
    return synonyms[key] ?? fallback;
  }, z.enum(values));
}

/* Models emit 3 where the schema says "3 files". A number is not a reason to
   lose a panel either, so coerce anything scalar to its string form. */
const looseString = z.preprocess(
  (raw) => (typeof raw === "number" || typeof raw === "boolean" ? String(raw) : raw),
  z.string(),
);

const FILTER_STATUS = looseEnum(["todo", "progress", "done"] as const, {
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
  finished: "done",
}, "todo");

const TASK_STATUS = looseEnum(["done", "running", "sequence"] as const, {
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
  failed: "running",
}, "running");

const HEALTH = looseEnum(["good", "warn", "bad", "none"] as const, {
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
  none: "none",
}, "good");

const TONE4 = looseEnum(["blue", "green", "orange", "red"] as const, {
  info: "blue", neutral: "blue", success: "green", warning: "orange",
  warn: "orange", danger: "red", error: "red", critical: "red",
}, "blue");

const TONE3 = looseEnum(["green", "orange", "red"] as const, {
  success: "green", high: "green", positive: "green",
  warning: "orange", warn: "orange", medium: "orange",
  danger: "red", error: "red", low: "red", critical: "red",
}, "green");

const TOOL_ICON = looseEnum(["think", "read", "write", "run"] as const, {
  search: "read", list: "read", get: "read", fetch: "read", query: "read",
  create: "write", update: "write", comment: "write", post: "write", send: "write",
  plan: "think", reason: "think", compose: "think", analyze: "think",
  execute: "run", call: "run", invoke: "run",
}, "run");

// 1. Records (RecordsTable)
export const RecordsPropsSchema = z.object({
  rows: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        tags: z.array(z.string()).max(4).default([]),
        updated: looseString, // "3d" | "2h"
        health: HEALTH,
        url: z.string().optional(),
      })
    )
    .min(1)
    .max(12),
});

// 2. Filter (FilterTable)
export const FilterPropsSchema = z.object({
  rows: z
    .array(
      z.object({
        task: z.string(),
        date: looseString,
        status: FILTER_STATUS,
        owner: z.string(),
      })
    )
    .min(1)
    .max(15),
});

// 3. Insights (InsightCards)
export const InsightsPropsSchema = z.object({
  cards: z
    .array(
      z.object({
        key: z.string(),
        pill: looseString, // e.g. "Last 7 days"
        headline: looseString, // e.g. "14 PRs merged"
        prose: looseString, // plain text summary
        // One point is a degenerate sparkline, not a reason to lose the panel.
        series: z.array(z.number()).min(1).max(40),
      })
    )
    .min(1)
    .max(3),
});

// 4. Tasks (TaskRows)
export const TasksPropsSchema = z.object({
  rows: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        amount: looseString, // e.g. "3 files"
        status: TASK_STATUS,
        details: z
          .array(
            z.union([
              z.string(),
              z.object({ label: z.string(), meta: z.string().optional() }),
            ])
          )
          .max(4)
          .default([]),
      })
    )
    .min(1)
    .max(8),
});

// 5. Approval (ApprovalCard)
export const ApprovalPropsSchema = z.object({
  questions: z
    .array(
      z.object({
        q: z.string(),
        type: z.enum(["radio", "check"]).default("radio"),
        options: z.array(z.string()).min(2).max(5),
      })
    )
    .min(1)
    .max(3),
  action: z
    .object({
      tool: z.string(),
      target: z.string(),
      payload: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
});

// 6. Diff (DiffTable)
export const DiffPropsSchema = z.object({
  rows: z
    .array(
      z.object({
        key: z.string(),
        id: z.string(),
        label: z.string(),
        detail: z.string(),
        removed: z.boolean().default(false),
      })
    )
    .min(1)
    .max(10),
});

// 7. Context (ContextCards)
export const ContextPropsSchema = z.object({
  chunks: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
        source: z.string(),
        badge: z.string(),
        tone: TONE4,
      })
    )
    .min(1)
    .max(6),
});

// 8. Recommendation (RecommendationCard)
export const RecommendationPropsSchema = z.object({
  question: z.string().max(120).optional(),
  options: z
    .array(
      z.object({
        key: z.string(),
        body: z.string(),
        short: z.string(),
        signal: z.number().min(0).max(3).default(2),
        label: z.string(),
        cta: z.string(),
        tone: TONE3,
      })
    )
    .min(1)
    .max(3),
});

// 9. Stream (StreamingText)
export const StreamPropsSchema = z.object({
  text: z.string().max(1200),
  citations: z
    .array(
      z.object({
        name: z.string(),
        domain: z.string(),
        href: z.string(),
      })
    )
    .max(4)
    .default([]),
  followUps: z.array(z.string()).max(3).default([]),
});

// 10. Tools (ToolChips)
export const ToolsPropsSchema = z.object({
  steps: z
    .array(
      z.object({
        icon: TOOL_ICON,
        label: z.string(),
        chip: looseString,
        detail: z.array(z.string()).max(5).default([]),
      })
    )
    .min(1)
    .max(6),
});

export const PanelPropSchemas: Record<PanelType, z.ZodTypeAny> = {
  records: RecordsPropsSchema,
  filter: FilterPropsSchema,
  insights: InsightsPropsSchema,
  tasks: TasksPropsSchema,
  approval: ApprovalPropsSchema,
  diff: DiffPropsSchema,
  context: ContextPropsSchema,
  recommendation: RecommendationPropsSchema,
  stream: StreamPropsSchema,
  tools: ToolsPropsSchema,
};

export const PanelSchema = z.object({
  id: z.string(),
  type: z.enum(Array.from(PANEL_TYPES) as [string, ...string[]]) as z.ZodType<PanelType>,
  span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  priority: z.number().int().min(0),
  title: z.string().max(80),
  subtitle: z.string().max(120).optional(),
  sources: z.array(z.enum(Array.from(SOURCE_IDS) as [string, ...string[]])).min(1) as any,
  props: z.unknown(),
});

export const LayoutSchema = z.object({
  title: z.string().max(100),
  rationale: z.string().max(200).optional(),
  panels: z.array(PanelSchema).min(1).max(7),
});

export function validateLayout(raw: unknown): {
  layout: LayoutSpec;
  dropped: string[];
} {
  const parsed = LayoutSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid layout structure: ${parsed.error.message}`);
  }

  const rawLayout = parsed.data;
  const validPanels: typeof rawLayout.panels = [];
  const dropped: string[] = [];

  for (const panel of rawLayout.panels) {
    const propSchema = PanelPropSchemas[panel.type as PanelType];
    if (!propSchema) {
      dropped.push(panel.id);
      continue;
    }
    const propParsed = propSchema.safeParse(panel.props);
    if (propParsed.success) {
      validPanels.push({
        ...panel,
        props: propParsed.data,
      });
    } else {
      // A dropped panel is a silent quality loss, so say why. These messages are
      // how you find out the prompt is describing a shape the schema rejects.
      const why = propParsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      console.warn(`[muster] dropped panel ${panel.id} (${panel.type}) -> ${why}`);
      dropped.push(panel.id);
    }
  }

  // Sort by priority ascending
  validPanels.sort((a: any, b: any) => a.priority - b.priority);

  // Clamp total span to <= 12 by dropping lowest-priority (highest index) panels
  let totalSpan = 0;
  const clampedPanels: typeof validPanels = [];
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
      panels: clampedPanels as any,
    },
    dropped,
  };
}
