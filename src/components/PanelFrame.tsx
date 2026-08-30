import { Component, type ReactNode } from "react";
import type { Panel, SourceId } from "../lib/types";

const SPAN_CLASS: Record<1 | 2 | 3, string> = {
  1: "col-span-1",
  2: "col-span-1 lg:col-span-2",
  3: "col-span-1 lg:col-span-3",
};

const SOURCE_TINT: Record<SourceId, string> = {
  github: "var(--accent)",
  linear: "var(--ink-2)",
  notion: "var(--ink-2)",
  gmail: "var(--red)",
  calendar: "var(--green)",
};

/* A primitive that throws must take down its own panel and nothing else. */
class PanelBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "render failed" };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="rounded-[10px] bg-[var(--red-tint)] p-3 font-mono text-[11.5px] text-[var(--red)]">
          panel failed to render: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function PanelFrame({
  panel,
  index,
  children,
}: {
  panel: Panel;
  index: number;
  children: ReactNode;
}) {
  const maxChips = panel.span === 1 ? 2 : 4;
  const shown = panel.sources.slice(0, maxChips);
  const overflow = panel.sources.length - shown.length;

  return (
    <section
      className={`${SPAN_CLASS[panel.span]} flex min-w-0 flex-col rounded-[var(--radius-window)] bg-[var(--canvas)] p-3 shadow-[var(--shadow-hairline)]`}
      style={{
        // the exact ramp from the reference: 60ms per panel, pinned at 240
        animation: `fade-up 600ms cubic-bezier(0.23,1,0.32,1) ${Math.min(index * 60, 240)}ms both`,
      }}
    >
      <header className="mb-2.5 flex items-start justify-between gap-3 border-b border-dashed border-[var(--line)] pb-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-[var(--ink)]">
            {panel.title}
          </h2>
          {panel.subtitle && (
            <p className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">
              {panel.subtitle}
            </p>
          )}
        </div>

        {/* Provenance: which servers this panel was drawn from. Capped, because a
            narrow panel citing five sources would otherwise crowd out its title. */}
        <div className="flex shrink-0 items-center gap-1" title={panel.sources.join(", ")}>
          {shown.map((src) => (
            <span
              key={src}
              className="rounded-[var(--radius-chip)] bg-[var(--field)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]"
            >
              <span
                aria-hidden
                className="mr-1 inline-block size-[5px] rounded-full align-middle"
                style={{ background: SOURCE_TINT[src] ?? "var(--ink-3)" }}
              />
              {src}
            </span>
          ))}
          {overflow > 0 && (
            <span className="rounded-[var(--radius-chip)] bg-[var(--field)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-3)]">
              +{overflow}
            </span>
          )}
        </div>
      </header>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <PanelBoundary>{children}</PanelBoundary>
      </div>
    </section>
  );
}
