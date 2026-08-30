import type { ComposeRequest, ComposeResponse, SourceState } from "./types";
import { SOURCES, gather } from "./sources";
import { fallbackLayout } from "./fallback";

/* The client no longer talks to GitHub, Linear or Notion. It asks its own server
   to, because tokens must not ship in the bundle and because Notion and Linear
   both refuse browser origins outright.

   If that endpoint is unreachable, which happens when the static build is served
   without its functions, the browser still composes a deterministic layout from
   the bundled fixtures rather than showing nothing. */
export async function compose(req: ComposeRequest): Promise<ComposeResponse> {
  const start = Date.now();

  try {
    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`compose endpoint returned ${res.status}`);
    return (await res.json()) as ComposeResponse;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn("[muster] compose endpoint unavailable, using local fixtures:", error);

    const { items, states } = await gather(req.connected, SOURCES);
    return {
      ok: false,
      error,
      layout: fallbackLayout(items),
      sources: states.map((s): SourceState => ({ ...s, via: "fixture" })),
      ms: Date.now() - start,
    };
  }
}

export type Status = {
  model: string;
  connected?: Partial<Record<"notion" | "linear", boolean>>;
  own?: Partial<Record<"notion" | "linear", boolean>>;
};

export async function fetchStatus(): Promise<Status> {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Status;
  } catch {
    return { model: "offline" };
  }
}
