import { useMemo } from "react";
import { getEntry } from "../lib/catalog";
import { PanelFrame } from "./PanelFrame";
import ThinkingState from "../primitives/thinking-state";
import type { AppStatus, LayoutSpec, PanelAction } from "../lib/types";

export type PanelGridProps = {
  layout: LayoutSpec | null;
  status: AppStatus;
  note: string | null;
  onAction: (panelId: string, action: PanelAction) => void;
};

export function PanelGrid({ layout, status, note, onAction }: PanelGridProps) {
  /* Adapting is cheap but not free of identity: the insights adapter builds a
     component, so re-running it every render would remount the chart canvas
     before it ever gets measured. One pass per layout instead. */
  const rendered = useMemo(
    () =>
      (layout?.panels ?? []).flatMap((panel) => {
        const entry = getEntry(panel.type);
        return entry
          ? [{ panel, Component: entry.Component, props: entry.adapt(panel.props, panel) }]
          : [];
      }),
    [layout],
  );

  if (status === "composing") {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[var(--radius-window)] bg-[var(--canvas)] p-6 shadow-[var(--shadow-hairline)]">
        <ThinkingState variant="Steps" />
      </div>
    );
  }

  if (!layout || layout.panels.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[var(--radius-window)] bg-[var(--canvas)] p-6 shadow-[var(--shadow-hairline)]">
        <p className="max-w-[340px] text-center text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          Ask a question and the panels will be chosen, sized and placed from
          whatever the connected servers are actually holding.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[19px] leading-[1.25] font-semibold tracking-[-0.3px] text-balance text-[var(--ink)]">
            {layout.title}
          </h2>
          {layout.rationale && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
              {layout.rationale}
            </p>
          )}
        </div>
        {note && (
          <span className="shrink-0 rounded-full bg-[var(--field)] px-2.5 py-1 font-mono text-[11px] whitespace-nowrap text-[var(--ink-3)]">
            {note}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {rendered.map(({ panel, Component, props }, index) => {
          // The only panel that writes anything back out. Everything else is read
          // only, which is why the approval gate is the single wired callback.
          const extra =
            panel.type === "approval"
              ? {
                  onSubmitted: (answers: Record<number, number[]>) =>
                    onAction(panel.id, { kind: "approve", answers }),
                }
              : null;

          return (
            <PanelFrame key={panel.id} panel={panel} index={index}>
              <Component {...props} {...extra} />
            </PanelFrame>
          );
        })}
      </div>
    </div>
  );
}
