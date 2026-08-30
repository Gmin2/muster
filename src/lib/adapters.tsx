import type { z } from "zod";

import type {
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

import type { RecordRow } from "../primitives/records-table";
import type { TableRow } from "../primitives/filter-table";
import type { InsightPage } from "../primitives/insight-cards";
import type { TaskRow, TaskDetail } from "../primitives/task-rows";
import type { ApprovalQuestion } from "../primitives/approval-card";
import type { DiffRow } from "../primitives/diff-table";
import type { ContextChunk } from "../primitives/context-cards";
import type { RecommendationOption } from "../primitives/recommendation-card";
import type { StreamingToken, StreamingSource } from "../primitives/streaming-text";
import type { ToolStep } from "../primitives/tool-chips";

/* Domain JSON in, primitive props out. Everything here is pure and synchronous.
   The model never sees the shapes on the right — that separation is what lets a
   bad panel get dropped instead of taking the screen down. */

const HEALTH_TO_STRENGTH = {
  good: "strong",
  warn: "weak",
  bad: "veryweak",
  none: "none",
} as const;

export function toRecordRows(p: z.infer<typeof RecordsPropsSchema>): RecordRow[] {
  return p.rows.map((r) => ({
    id: r.id,
    name: r.title,
    tags: r.tags,
    last: r.updated,
    strength: HEALTH_TO_STRENGTH[r.health],
    website: r.url,
  }));
}

export function toFilterRows(p: z.infer<typeof FilterPropsSchema>): TableRow[] {
  return p.rows.map((r) => ({
    task: r.task,
    date: r.date,
    status: r.status,
    owner: r.owner,
  }));
}

const SPARK_W = 300;
const SPARK_H = 96;
const SPARK_PAD = 10;

/* The sparkline is inline SVG rather than a canvas chart on purpose: it draws in
   one pass with no animation frame, so it survives a backgrounded tab, a
   screenshot pass and a print. Catmull-Rom through the points for a curve that
   does not visibly step at this size. */
function sparklinePath(input: number[]): { line: string; area: string } {
  // A single reading draws as a flat line rather than nothing at all.
  const values = input.length === 1 ? [input[0], input[0]] : input;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (SPARK_W - SPARK_PAD * 2) / Math.max(values.length - 1, 1);

  const pts = values.map((v, i) => ({
    x: SPARK_PAD + i * stepX,
    y: SPARK_PAD + (1 - (v - min) / range) * (SPARK_H - SPARK_PAD * 2),
  }));

  let line = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  const last = pts[pts.length - 1];
  return {
    line,
    area: `${line} L ${last.x} ${SPARK_H} L ${pts[0].x} ${SPARK_H} Z`,
  };
}

/* The one adapter that has to build a component: InsightPage wants a Card of its
   own rather than data, so the sparkline is closed over here. */
export function toInsightPages(p: z.infer<typeof InsightsPropsSchema>): InsightPage[] {
  return p.cards.map((c) => {
    const { line, area } = sparklinePath(c.series);
    const peak = Math.max(...c.series);
    const trough = Math.min(...c.series);
    const gradientId = `spark-${c.key}`;

    function Card() {
      return (
        <div className="overflow-hidden rounded-card bg-surface shadow-hairline">
          {/* The headline number lives in the prose above, so the card carries the
              shape of the series and its bounds rather than repeating a figure. */}
          <div className="flex items-baseline justify-between px-3 pt-2.5">
            <span className="text-[11px] text-ink-3">{c.pill}</span>
            <span className="font-mono text-[11px] tabular-nums text-ink-3">
              {trough}–{peak}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            preserveAspectRatio="none"
            className="mt-1 block h-[96px] w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      );
    }

    return {
      key: c.key,
      pill: c.pill,
      prose: (
        <>
          <span className="font-semibold text-ink">{c.headline}</span> {c.prose}
        </>
      ),
      Card,
    };
  });
}

/* Details arrive either as a bare line or as an already-split label/meta pair.
   Accepting both means a lazier model answer still renders. */
function toTaskDetail(d: string | { label: string; meta?: string }): TaskDetail {
  if (typeof d !== "string") return { label: d.label, meta: d.meta ?? "" };
  const [label, meta] = d.split(" · ");
  return { label, meta: meta ?? "" };
}

export function toTaskRows(p: z.infer<typeof TasksPropsSchema>): TaskRow[] {
  return p.rows.map((r) => ({
    key: r.key,
    label: r.label,
    amount: r.amount,
    status: r.status,
    details: r.details.map(toTaskDetail),
  }));
}

export function toApprovalQuestions(
  p: z.infer<typeof ApprovalPropsSchema>,
): ApprovalQuestion[] {
  return p.questions.map((q) => ({
    q: q.q,
    type: q.type,
    options: q.options,
  }));
}

/* DiffRow's field names are CRM leftovers from the reference demo. dept is the
   left column, email the right one. */
export function toDiffRows(p: z.infer<typeof DiffPropsSchema>): DiffRow[] {
  return p.rows.map((r) => ({
    key: r.key,
    id: r.id,
    dept: r.label,
    email: r.detail,
    removed: r.removed,
  }));
}

export function toContextChunks(p: z.infer<typeof ContextPropsSchema>): ContextChunk[] {
  return p.chunks.map((c) => ({
    title: c.title,
    chars: `${c.body.length} chars`,
    body: c.body,
    source: c.source,
    badge: c.badge,
    tone: c.tone,
  }));
}

export function toRecommendationOptions(
  p: z.infer<typeof RecommendationPropsSchema>,
): RecommendationOption[] {
  return p.options.map((o) => ({
    key: o.key,
    body: <span>{o.body}</span>,
    short: o.short,
    signal: o.signal,
    tone: o.tone,
    label: o.label,
    cta: o.cta,
    ctaVariant: o.tone === "green" ? "accent" : "secondary",
  }));
}

/* A neutral avatar for cited sources, coloured by the first letter so the chips
   in the sources list are at least distinguishable. */
function sourceAvatar(name: string): string {
  const hue = [...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='hsl(${hue} 52% 42%)'/><text x='32' y='42' font-family='sans-serif' font-size='30' font-weight='600' fill='white' text-anchor='middle'>${(name[0] ?? "?").toUpperCase()}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* StreamingText types one word at a time, so the prose has to arrive already cut
   into word tokens. A [1]-style marker in the text becomes an inline source chip. */
export function toStreamingTokens(p: z.infer<typeof StreamPropsSchema>): {
  content: StreamingToken[];
  sources: StreamingSource[];
  followUps: string[];
} {
  const content: StreamingToken[] = [];
  for (const word of p.text.split(/\s+/).filter(Boolean)) {
    if (/^\[\d+\]$/.test(word) && p.citations.length > 0) {
      content.push({ text: "", cite: true });
    } else {
      content.push({ text: `${word} ` });
    }
  }

  return {
    content,
    sources: p.citations.map((c) => ({
      name: c.name,
      domain: c.domain,
      href: c.href,
      image: sourceAvatar(c.name),
    })),
    followUps: p.followUps,
  };
}

/* ToolChips only knows four glyphs. Anything unrecognised would render blank, so
   source ids and tool names are folded onto the closest one. */
const TOOL_ICONS = ["think", "write", "run", "read"] as const;

function toolIcon(raw: string): string {
  if ((TOOL_ICONS as readonly string[]).includes(raw)) return raw;
  const s = raw.toLowerCase();
  if (/comment|create|update|post|write|send|merge/.test(s)) return "write";
  if (/plan|compose|reason|think/.test(s)) return "think";
  if (/list|get|search|query|read|fetch/.test(s)) return "read";
  return "run";
}

export function toToolSteps(p: z.infer<typeof ToolsPropsSchema>): ToolStep[] {
  return p.steps.map((s) => ({
    icon: toolIcon(s.icon),
    label: s.label,
    chip: s.chip,
    mono: true,
    detailMono: true,
    detail: s.detail.map((text) => ({ text })),
  }));
}
