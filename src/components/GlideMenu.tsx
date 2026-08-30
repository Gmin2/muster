import { useRef, useState, type ReactNode } from "react";

/* The hover highlight that glides between rows instead of appearing under each
   one. It only animates position once it is already visible, so the first hover
   fades in where the cursor is rather than sliding in from a stale spot. */

type Props = {
  children: ReactNode;
  className?: string;
  rowSelector?: string;
  highlightClassName?: string;
};

export function GlideMenu({
  children,
  className = "",
  rowSelector = "[data-row]",
  highlightClassName = "",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);

  function track(event: React.PointerEvent | React.FocusEvent) {
    const host = hostRef.current;
    if (!host) return;
    const row = (event.target as Element).closest(rowSelector);
    if (!row || !host.contains(row)) return;
    const hostBox = host.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    setRect({ top: rowBox.top - hostBox.top, height: rowBox.height });
    setVisible(true);
  }

  return (
    <div
      ref={hostRef}
      className={`relative ${className}`}
      onPointerMove={track}
      onFocusCapture={track}
      onPointerLeave={() => setVisible(false)}
      onBlurCapture={() => setVisible(false)}
    >
      {rect && (
        <span
          aria-hidden
          className={`pointer-events-none absolute z-0 ${highlightClassName}`}
          style={{
            top: rect.top,
            height: rect.height,
            opacity: visible ? 1 : 0,
            transition: visible
              ? "top 180ms cubic-bezier(0.16,1,0.3,1), height 180ms cubic-bezier(0.16,1,0.3,1), opacity 120ms ease-out"
              : "opacity 120ms ease-out",
          }}
        />
      )}
      {children}
    </div>
  );
}

export default GlideMenu;
