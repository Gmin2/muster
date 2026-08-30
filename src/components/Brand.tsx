/* The mark: a solid badge with a layout knocked out of it — a rail, a filled
   block, and one accent block. The accent is the piece the model draws, which is
   the product in a glyph. Knockout rather than outline, so it holds at 20px. */
export function Mark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-label="Muster">
      <rect width="38" height="38" rx="11" fill="var(--ink)" />
      <rect x="9" y="10.5" width="6" height="17" rx="2" fill="var(--surface)" opacity="0.92" />
      <rect x="17.5" y="10.5" width="11.5" height="7" rx="2" fill="var(--surface)" opacity="0.45" />
      <rect x="17.5" y="20.5" width="11.5" height="7" rx="2" fill="var(--accent)" />
    </svg>
  );
}

export function ThemeToggle({
  dark,
  onChange,
}: {
  dark: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="relative flex items-center rounded-full bg-[var(--field)] p-[3px]">
      {/* the knob travels rather than each half restyling, so the switch reads
          as one object moving instead of two buttons blinking */}
      <span
        aria-hidden
        className="absolute top-[3px] left-[3px] size-[26px] rounded-full bg-[var(--surface)] shadow-[var(--shadow-btn)] transition-transform duration-[220ms]"
        style={{
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          transform: dark ? "translateX(26px)" : "translateX(0)",
        }}
      />
      {[false, true].map((isDark) => (
        <button
          key={String(isDark)}
          type="button"
          aria-label={isDark ? "Dark mode" : "Light mode"}
          aria-pressed={dark === isDark}
          onClick={() => onChange(isDark)}
          className={`relative z-10 grid size-[26px] place-items-center rounded-full transition-colors duration-150 ${
            dark === isDark
              ? "text-[var(--ink)]"
              : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
          }`}
        >
          {isDark ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.5v1.8M12 19.7v1.8M4.6 4.6l1.3 1.3M18.1 18.1l1.3 1.3M2.5 12h1.8M19.7 12h1.8M4.6 19.4l1.3-1.3M18.1 5.9l1.3-1.3" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
