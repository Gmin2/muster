import { useCallback, useEffect, useState } from "react";
import { SourceRail } from "./components/SourceRail";
import { CommandBar } from "./components/CommandBar";
import { PanelGrid } from "./components/PanelGrid";
import { compose, fetchStatus } from "./lib/compose";
import { executeAction } from "./lib/sources/actions";
import { SOURCE_IDS } from "./lib/constants";
import type {
  AppStatus,
  LayoutSpec,
  PanelAction,
  SourceId,
  SourceState,
  WriteAction,
} from "./lib/types";

const OPENING_QUERY = "what needs me today?";

/* The third one is doing real work: it teaches, in one glance, that you can
   name any repository in the question and the dashboard will go and read it. */
const SUGGESTIONS = [
  "what needs me today?",
  "which pull requests are going stale?",
  "what is happening in vercel/next.js?",
  "what is blocked across engineering?",
];

const INITIAL_SOURCES: SourceState[] = SOURCE_IDS.map((id) => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  status: "disconnected",
  count: null,
}));

export default function App() {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState(OPENING_QUERY);
  const [status, setStatus] = useState<AppStatus>("idle");
  const [layout, setLayout] = useState<LayoutSpec | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceState[]>(INITIAL_SOURCES);
  const [ms, setMs] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [focus, setFocus] = useState<SourceId | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [model, setModel] = useState("connecting");
  const [own, setOwn] = useState<Partial<Record<"notion" | "linear", boolean>>>({});
  const [repos, setRepos] = useState<string[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    void fetchStatus().then((s) => {
      setModel(s.model);
      setOwn(s.own ?? {});
    });
  }, []);

  /* The OAuth callback comes back as a redirect with a query flag, so report it
     and then strip it, otherwise a refresh replays the toast forever. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");
    if (!connect) return;
    setToast(
      connect === "error"
        ? { ok: false, text: params.get("reason") ?? "Could not connect" }
        : { ok: true, text: connect === "removed" ? "Disconnected" : `Connected ${connect}` },
    );
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const runCompose = useCallback(async (text: string, scope: SourceId | null) => {
    setStatus("composing");
    setNote(null);

    const connected = scope ? [scope] : [...SOURCE_IDS];
    const res = await compose({ query: text, connected });

    setLayout(res.layout);
    if (res.ok) {
      setSources(res.meta.sources);
      setMs(res.meta.ms);
      setRepos(res.meta.repos ?? []);
      setStatus("ready");
      const dropped = res.meta.droppedPanels.length;
      setNote(
        [
          `${res.layout.panels.length} panels`,
          `${new Set(res.layout.panels.flatMap((p) => p.sources)).size} sources`,
          `${(res.meta.ms / 1000).toFixed(1)}s`,
          dropped ? `${dropped} dropped` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } else {
      setSources(res.sources);
      setMs(res.ms);
      setStatus("error");
      setNote(`fallback layout · ${res.error.slice(0, 60)}`);
    }
  }, []);

  useEffect(() => {
    void runCompose(OPENING_QUERY, null);
  }, [runCompose]);

  function onSubmit(text: string) {
    if (pinned) {
      setToast({ ok: false, text: "Layout is pinned. Unpin it to recompose." });
      return;
    }
    setQuery(text);
    void runCompose(text, focus);
  }

  /* Focusing a source recomposes immediately against the same question. Asking
     the user to retype it would hide the whole point, which is that the layout
     reorganises when the inputs change. */
  function onFocus(next: SourceId | null) {
    setFocus(next);
    if (pinned) {
      setToast({ ok: false, text: "Layout is pinned. Unpin it to recompose." });
      return;
    }
    void runCompose(query, next);
  }

  async function onAction(panelId: string, action: PanelAction) {
    if (action.kind !== "approve") return;

    const panel = layout?.panels.find((p) => p.id === panelId);
    const write = (panel?.props as { action?: WriteAction } | undefined)?.action;
    if (!write) {
      setToast({ ok: true, text: "Recorded. This panel proposes no write." });
      return;
    }

    const result = await executeAction(write);
    setToast({ ok: result.ok, text: result.applied });
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const activeSources = sources.filter(
    (s) => s.status === "live" || s.status === "fixture",
  ).length;

  return (
    <div className="hatch flex h-dvh w-full justify-center overflow-hidden">
      <div className="flex w-full max-w-[1360px] bg-[var(--page)] shadow-[var(--shadow-hairline)]">
        <div className="hidden md:flex">
          <SourceRail
            sources={sources}
            layoutMeta={
              layout && ms !== null
                ? { panels: layout.panels.length, sources: activeSources, ms }
                : null
            }
            focus={focus}
            own={own}
            pinned={pinned}
            dark={dark}
            onThemeChange={setDark}
            onFocus={onFocus}
            onTogglePin={() => setPinned((p) => !p)}
            onReset={() => {
              setPinned(false);
              setFocus(null);
              setQuery(OPENING_QUERY);
              void runCompose(OPENING_QUERY, null);
            }}
          />
        </div>

        <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[13px] font-semibold text-[var(--ink)]">Muster</span>
              <span className="ml-2 font-mono text-[11px] text-[var(--ink-3)]">
                {model}
              </span>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-[var(--ink-3)]">
              {repos.length > 0 ? repos.join("  ") : null}
              {repos.length > 0 && "  ·  "}
              {focus ? `scoped to ${focus}` : `${activeSources} of ${sources.length} servers`}
            </span>
          </div>

          <CommandBar
            value={query}
            busy={status === "composing"}
            onChange={setQuery}
            onSubmit={onSubmit}
            suggestions={SUGGESTIONS}
          />

          <div className="mt-6 pb-8">
            <PanelGrid
              layout={layout}
              status={status}
              note={note}
              onAction={onAction}
            />
          </div>

          {toast && (
            <div
              role="status"
              className="pointer-events-none fixed bottom-5 left-1/2 z-50 w-fit -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium shadow-[var(--shadow-overlay)]"
              style={{
                background: toast.ok ? "var(--green-tint)" : "var(--red-tint)",
                color: toast.ok ? "var(--green)" : "var(--red)",
                animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both",
              }}
            >
              {toast.text}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
