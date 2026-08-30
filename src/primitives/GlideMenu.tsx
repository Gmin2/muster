import { useRef, useState, type ReactNode } from "react";

type Rect = { top: number; height: number };

export default function GlideMenu({
  children,
  className = "",
  highlightClassName = "inset-x-0 rounded-control bg-hover",
  rowSelector = "[data-menu-row]",
}: {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
  rowSelector?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [on, setOn] = useState(false);

  const track = (event: React.PointerEvent | React.FocusEvent) => {
    const row = (event.target as HTMLElement).closest(rowSelector);
    if (!row || !wrap.current) return;
    const a = row.getBoundingClientRect();
    const b = wrap.current.getBoundingClientRect();
    setRect({ top: a.top - b.top, height: a.height });
    setOn(true);
  };

  return (
    <div
      ref={wrap}
      className={`group/glide-menu relative ${className}`}
      onPointerMove={track}
      onFocusCapture={track}
      onPointerLeave={() => setOn(false)}
      onBlurCapture={() => setOn(false)}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute ${highlightClassName}`}
        style={{
          top: rect?.top ?? 0,
          height: rect?.height ?? 0,
          opacity: on && rect ? 1 : 0,
          transition:
            "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms",
        }}
      />
      {children}
    </div>
  );
}
