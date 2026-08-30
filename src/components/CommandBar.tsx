import { useEffect, useRef } from "react";
import { IconArrowUp, IconSparkle } from "./icons";

/* Top of the column, not the bottom. That one placement is the difference
   between a command surface and a chat composer. */

export type CommandBarProps = {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  suggestions: string[];
};

export function CommandBar({
  value,
  busy,
  onChange,
  onSubmit,
  suggestions,
}: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function focusOnSlash(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusOnSlash);
    return () => window.removeEventListener("keydown", focusOnSlash);
  }, []);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex h-11 w-full items-center gap-2 rounded-full bg-[var(--surface)] py-2 pr-2 pl-3.5 shadow-[var(--shadow-card)]"
      >
        <span
          className={`flex size-5 shrink-0 items-center justify-center ${
            busy ? "text-[var(--accent)]" : "text-[var(--ink-3)]"
          }`}
          style={busy ? { animation: "spin 1.4s linear infinite" } : undefined}
        >
          <IconSparkle size={16} />
        </span>
        <input
          ref={inputRef}
          value={value}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask what needs you today, or name any repo…"
          aria-label="Compose a layout"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] disabled:opacity-60"
        />
        <span className="hidden shrink-0 font-mono text-[11px] text-[var(--ink-3)] sm:block">
          {busy ? "composing" : "/"}
        </span>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          aria-label="Compose"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--page)] transition-opacity disabled:opacity-20"
        >
          <IconArrowUp size={13} />
        </button>
      </form>

      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => {
              onChange(s);
              onSubmit(s);
            }}
            className="shrink-0 rounded-full bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--ink-2)] shadow-[var(--shadow-btn)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
