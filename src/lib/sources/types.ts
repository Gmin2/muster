import type { SourceId, SourceItem, SourceState } from "../types";

export type SourceAdapter = {
  id: SourceId;
  label: string;
  isLive: () => boolean;
  fetch: (limit: number) => Promise<SourceItem[]>;
};

export async function gather(
  ids: SourceId[],
  adapters: Record<SourceId, SourceAdapter>
): Promise<{ items: SourceItem[]; states: SourceState[] }> {
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const adapter = adapters[id];
      if (!adapter) {
        return {
          id,
          label: id,
          status: "disconnected" as const,
          items: [] as SourceItem[],
          count: null,
        };
      }
      const isLive = adapter.isLive();
      try {
        const items = await adapter.fetch(20);
        return {
          id,
          label: adapter.label,
          status: isLive ? ("live" as const) : ("fixture" as const),
          items,
          count: items.length,
        };
      } catch (err: any) {
        return {
          id,
          label: adapter.label,
          status: "error" as const,
          items: [] as SourceItem[],
          count: null,
          error: err?.message || "Failed to fetch",
        };
      }
    })
  );

  const allItems: SourceItem[] = [];
  const states: SourceState[] = [];

  for (const res of results) {
    if (res.status === "fulfilled") {
      allItems.push(...res.value.items);
      states.push({
        id: res.value.id,
        label: res.value.label,
        status: res.value.status,
        count: res.value.count,
        error: res.value.error,
      });
    }
  }

  return { items: allItems, states };
}
