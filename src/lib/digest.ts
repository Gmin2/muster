import type { SourceItem } from "./types";

export function digest(items: SourceItem[]): string {
  if (!items || items.length === 0) {
    return "No live items returned from connected sources.";
  }

  const bySource: Record<string, SourceItem[]> = {};
  for (const item of items) {
    if (!bySource[item.source]) bySource[item.source] = [];
    bySource[item.source].push(item);
  }

  const lines: string[] = [];

  for (const [source, sourceItems] of Object.entries(bySource)) {
    lines.push(`## ${source} (${sourceItems.length} items)`);
    for (const item of sourceItems.slice(0, 15)) {
      const parts: string[] = [`- [${item.kind}] ${item.title}`];
      if (item.author) parts.push(`by ${item.author}`);
      if (item.state) parts.push(`state: ${item.state}`);
      if (typeof item.meta?.hoursAway === "number") {
        // Calendar items sit ahead of you, so "3d old" would be nonsense; what
        // matters is how soon they start.
        const h = item.meta.hoursAway as number;
        parts.push(h <= 0 ? "now" : h < 24 ? `in ${h}h` : `in ${Math.round(h / 24)}d`);
      } else if (item.ageDays !== undefined) {
        parts.push(`${item.ageDays}d old`);
      }
      if (item.labels && item.labels.length > 0) {
        parts.push(`labels: ${item.labels.join(",")}`);
      }
      if (item.meta) {
        const metaStr = Object.entries(item.meta)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ");
        if (metaStr) parts.push(`(${metaStr})`);
      }
      lines.push(parts.join(" · "));
    }
  }

  // Cap total characters (~2500 tokens)
  const fullText = lines.join("\n");
  if (fullText.length > 8000) {
    return fullText.slice(0, 8000) + "\n... [truncated for context limit]";
  }
  return fullText;
}
