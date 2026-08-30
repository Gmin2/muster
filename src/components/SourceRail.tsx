import { useState, type CSSProperties, type ReactNode } from "react";
import GlideMenu from "./GlideMenu";
import { Mark, ThemeToggle } from "./Brand";
import {
  IconCalendar,
  IconGithub,
  IconLayers,
  IconLinear,
  IconMail,
  IconNotion,
  IconPin,
  IconRotate,
  IconSidebarLeftArrow,
} from "./icons";
import type { SourceId, SourceState } from "../lib/types";

/* The rail is hand-built and never generative. It is the fixed frame the model
   composes inside, and the pin/reset pair is the escape hatch out of it. */

const RAIL_MOTION = {
  expandedWidth: 240,
  collapsedWidth: 52,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

const SOURCE_ICONS: Record<SourceId, (p: { size?: number }) => ReactNode> = {
  github: IconGithub,
  linear: IconLinear,
  notion: IconNotion,
  gmail: IconMail,
  calendar: IconCalendar,
};

const STATUS_COLOR: Record<SourceState["status"], string> = {
  live: "var(--green)",
  fixture: "var(--orange)",
  error: "var(--red)",
  disconnected: "var(--ink-3)",
};

export type SourceRailProps = {
  sources: SourceState[];
  layoutMeta: { panels: number; sources: number; ms: number } | null;
  /** null means every source is in scope, which is the default and the point */
  focus: SourceId | null;
  /** which OAuth sources this visitor has connected with their own account */
  own: Partial<Record<"notion" | "linear", boolean>>;
  pinned: boolean;
  dark: boolean;
  onThemeChange: (v: boolean) => void;
  onFocus: (id: SourceId | null) => void;
  onTogglePin: () => void;
  onReset: () => void;
};

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-[11.5px] tabular-nums text-[var(--ink-2)]">
        {value}
      </span>
    </div>
  );
}

export function SourceRail({
  sources,
  layoutMeta,
  focus,
  own,
  pinned,
  dark,
  onThemeChange,
  onFocus,
  onTogglePin,
  onReset,
}: SourceRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const connected = sources.filter((s) => s.status !== "disconnected").length;

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Connected sources"
      className="group/aside relative flex h-full shrink-0 overflow-hidden border-r border-dashed border-[var(--line)] py-4 transition-[width]"
      style={
        {
          width: collapsed ? RAIL_MOTION.collapsedWidth : RAIL_MOTION.expandedWidth,
          transitionDuration: `${RAIL_MOTION.duration}ms`,
          transitionTimingFunction: RAIL_MOTION.easing,
          "--sidebar-copy-duration": `${RAIL_MOTION.copyDuration}ms`,
          "--sidebar-copy-offset": `${RAIL_MOTION.copyOffset}px`,
          "--sidebar-easing": RAIL_MOTION.easing,
        } as CSSProperties
      }
    >
      <div className="flex min-h-0 w-[240px] shrink-0 flex-col">
        <div className="px-4">
          <div className="flex items-start justify-between gap-2">
            <span className="sidebar-logo block shrink-0">
              <Mark size={38} />
            </span>
            <span className="sidebar-copy flex items-center gap-1">
              <button
                type="button"
                aria-label="Collapse rail"
                tabIndex={collapsed ? -1 : 0}
                onClick={() => setCollapsed(true)}
                className="grid size-7 place-items-center rounded-[7px] text-[var(--ink-3)] opacity-0 transition-[opacity,background-color,color] duration-150 group-hover/aside:opacity-100 hover:bg-[var(--hover-2)] hover:text-[var(--ink)] focus-visible:opacity-100"
              >
                <IconSidebarLeftArrow size={16} />
              </button>
              <ThemeToggle dark={dark} onChange={onThemeChange} />
            </span>
          </div>

          <h1 className="sidebar-copy mt-5 text-[18px] leading-[1.28] font-semibold tracking-[-0.3px] text-balance text-[var(--ink)]">
            The screen composes itself.
          </h1>
          <p className="sidebar-copy mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
            One layout drawn across every connected server, sized by what is
            actually urgent.
          </p>

          <div className="my-5 border-t border-dashed border-[var(--line-strong)]" />
        </div>

        <button
          type="button"
          aria-label="Expand rail"
          tabIndex={collapsed ? 0 : -1}
          onClick={() => setCollapsed(false)}
          className="sidebar-expand-control absolute top-3.5 left-2.5 z-20 flex size-8 items-center justify-center rounded-[7px] text-[var(--ink-3)] transition-[opacity,background-color,color] duration-150 hover:bg-[var(--hover-2)] hover:text-[var(--ink)]"
        >
          <IconSidebarLeftArrow size={16} className="rotate-180" />
        </button>

        <div className="sidebar-copy mx-4 mb-1 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-[var(--ink-3)]">Sources</span>
          {focus ? (
            <button
              type="button"
              onClick={() => onFocus(null)}
              className="rounded-[5px] px-1 font-mono text-[11px] text-[var(--accent-ink)] transition-colors duration-150 hover:bg-[var(--hover-2)]"
            >
              show all
            </button>
          ) : (
            <span className="font-mono text-[11.5px] tabular-nums text-[var(--ink-3)]">
              {connected}/{sources.length}
            </span>
          )}
        </div>

        <GlideMenu
          rowSelector="[data-row]"
          highlightClassName="sidebar-glide-highlight rounded-[7px] bg-[var(--hover-2)]"
          className="group/glide flex flex-col gap-px"
        >
          {sources.map((source) => {
            const Icon = SOURCE_ICONS[source.id];
            const active = focus === source.id;
            const dimmed = focus !== null && !active;
            return (
              <button
                key={source.id}
                data-row
                type="button"
                aria-pressed={active}
                onClick={() => onFocus(active ? null : source.id)}
                title={
                  source.error ??
                  (active
                    ? `Composing from ${source.label} only. Click again for every source.`
                    : `Compose from ${source.label} only`)
                }
                className={`sidebar-row relative z-10 mx-2 flex h-[34px] items-center rounded-[8px] px-2 text-left transition-[width,background-color,opacity,transform] duration-150 active:scale-[0.98] ${
                  active ? "bg-[var(--accent-tint)] group-hover/glide:bg-transparent" : ""
                } ${dimmed ? "opacity-45" : ""}`}
              >
                <span
                  className={`relative flex size-5 shrink-0 items-center justify-center ${
                    active ? "text-[var(--accent-ink)]" : "text-[var(--ink-2)]"
                  }`}
                >
                  <Icon size={16} />
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -bottom-0.5 size-[7px] rounded-full ring-2 ring-[var(--page)]"
                    style={{ background: STATUS_COLOR[source.status] }}
                  />
                </span>
                <span
                  className={`sidebar-copy ml-2 min-w-0 flex-1 truncate text-[13.5px] font-medium ${
                    active ? "text-[var(--accent-ink)]" : "text-[var(--ink-2)]"
                  }`}
                >
                  {source.label}
                </span>
                {/* How the data actually arrived. Saying "mcp" only when it came
                    over MCP is the difference between a claim and a receipt. */}
                {(() => {
                  const tag =
                    source.status === "error"
                      ? { text: "error", tint: "var(--red-tint)", ink: "var(--red)" }
                      : source.via === "mcp"
                        ? { text: "mcp", tint: "var(--accent-tint)", ink: "var(--accent-ink)" }
                        : source.via === "rest"
                          ? { text: "rest", tint: "var(--green-tint)", ink: "var(--green)" }
                          : source.status === "fixture"
                            ? { text: "demo", tint: "var(--orange-tint)", ink: "var(--orange)" }
                            : null;
                  return tag ? (
                    <span
                      className="sidebar-copy mr-1.5 shrink-0 rounded-[4px] px-1 py-px font-mono text-[9.5px] tracking-tight"
                      style={{ background: tag.tint, color: tag.ink }}
                    >
                      {tag.text}
                    </span>
                  ) : null;
                })()}
                <span className="sidebar-copy mr-1 shrink-0 font-mono text-[11.5px] tabular-nums text-[var(--ink-3)]">
                  {source.count ?? "—"}
                </span>
              </button>
            );
          })}
        </GlideMenu>

        {/* Connecting your own account is deliberately secondary: the demo works
            on the owner's data the moment you land, and this is for anyone who
            wants to point it at their own workspace instead. */}
        <div className="sidebar-copy mx-4 mt-2 flex flex-wrap gap-1">
          {(["notion", "linear"] as const).map((id) =>
            own[id] ? (
              <a
                key={id}
                href={`/api/oauth-disconnect?server=${id}`}
                className="rounded-full bg-[var(--accent-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-ink)] transition-opacity hover:opacity-75"
                title={`Stop using your own ${id} account`}
              >
                your {id} &times;
              </a>
            ) : (
              <a
                key={id}
                href={`/api/oauth-start?server=${id}`}
                className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-2)] shadow-[var(--shadow-btn)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                title={`Sign in and use your own ${id} workspace`}
              >
                connect {id}
              </a>
            ),
          )}
        </div>

        <div className="sidebar-copy mx-4 mt-6 min-h-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ink-3)]">
            <IconLayers size={14} />
            Layout
          </div>
          {layoutMeta ? (
            <div className="flex flex-col gap-1 rounded-[10px] bg-[var(--inset)] p-2.5 shadow-[var(--shadow-hairline)]">
              <MetaRow label="Composed in" value={`${(layoutMeta.ms / 1000).toFixed(1)}s`} />
              <MetaRow label="Panels" value={String(layoutMeta.panels)} />
              <MetaRow label="Sources" value={String(layoutMeta.sources)} />
            </div>
          ) : (
            <div className="rounded-[10px] bg-[var(--inset)] p-2.5 text-[12px] text-[var(--ink-3)] shadow-[var(--shadow-hairline)]">
              Nothing composed yet.
            </div>
          )}
        </div>

        <div className="sidebar-copy mx-2 mt-3 w-[224px] border-t border-[var(--line)] pt-3">
          <div className="flex items-center gap-1.5 px-1">
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={pinned}
              title={
                pinned
                  ? "Layout is frozen. New questions will not recompose it."
                  : "Freeze this layout so it stops recomposing."
              }
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] ${
                pinned
                  ? "bg-[var(--accent-tint)] text-[var(--accent-ink)] shadow-[var(--shadow-hairline)]"
                  : "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-btn)] hover:bg-[var(--hover)]"
              }`}
            >
              <IconPin size={14} />
              {pinned ? "Pinned" : "Pin"}
            </button>
            <button
              type="button"
              onClick={onReset}
              title="Drop the current layout and compose from scratch"
              className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--ink)] shadow-[var(--shadow-btn)] transition-[background-color,transform] duration-150 hover:bg-[var(--hover)] active:scale-[0.98]"
            >
              <IconRotate size={14} />
              Reset
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
