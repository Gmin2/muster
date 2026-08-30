import type { LayoutSpec, Panel, SourceId, SourceItem } from "./types";

/* The deterministic layout. No model, no network, no key. It is both the
   slice-3 deliverable and the permanent safety net: whatever else fails, the
   screen still shows something true about the gathered data. */

const SOURCE_LABEL: Record<SourceId, string> = {
  github: "GitHub",
  linear: "Linear",
  notion: "Notion",
  gmail: "Gmail",
  calendar: "Calendar",
};

function health(item: SourceItem): "good" | "warn" | "bad" | "none" {
  if (item.meta?.ci === "failed") return "bad";
  if (item.ageDays >= 7) return "bad";
  if (item.ageDays >= 3) return "warn";
  return "good";
}

/* Counts per day for the last week, so the sparkline says something real about
   when the work actually landed rather than drawing a decorative curve. */
function weeklySeries(items: SourceItem[]): number[] {
  const buckets = new Array(7).fill(0);
  for (const item of items) {
    const day = Math.min(Math.max(Math.floor(item.ageDays), 0), 6);
    buckets[6 - day] += 1;
  }
  return buckets;
}

export function fallbackLayout(items: SourceItem[]): LayoutSpec {
  const sources = [...new Set(items.map((i) => i.source))];
  const byAge = [...items].sort((a, b) => b.ageDays - a.ageDays);
  const stale = byAge.filter((i) => i.ageDays >= 3);
  const worst = byAge[0];

  const panels: Panel[] = [];

  if (worst) {
    panels.push({
      id: "fallback-approval",
      type: "approval",
      span: 3,
      priority: 0,
      title: worst.title,
      subtitle: `${SOURCE_LABEL[worst.source]} · untouched for ${worst.ageDays} days${
        worst.author ? ` · ${worst.author}` : ""
      }`,
      sources: [worst.source],
      props: {
        questions: [
          {
            q: "This is the oldest thing waiting on you. What should happen to it?",
            type: "radio",
            options: ["Nudge the author", "Pick it up myself", "Leave it for now"],
          },
        ],
        action: {
          tool: "github.comment",
          target: worst.title,
          payload: {
            pr: Number(worst.title.match(/#(\d+)/)?.[1] ?? 0),
            body: "Checking in on this one from Muster.",
          },
        },
      },
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
          url: item.url,
        })),
      },
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
            prose: stale.length
              ? `${stale.length} of them have been sitting for three days or more.`
              : "Nothing has gone stale yet.",
            series: weeklySeries(items),
          },
        ],
      },
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
        detail: [`Gathered from ${SOURCE_LABEL[id]}`],
      })),
    },
  });

  return {
    title: stale.length
      ? `${stale.length} things have been waiting on you`
      : "Nothing is overdue right now",
    rationale:
      "Composed without the model. Panels and sizes come from a fixed rule, not from urgency.",
    panels,
  };
}
