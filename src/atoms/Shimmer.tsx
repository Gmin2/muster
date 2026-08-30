import type { ReactNode } from "react";

export function Shimmer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        backgroundImage:
          "linear-gradient(90deg, var(--color-ink-3) 0%, var(--color-ink-3) 40%, var(--color-ink) 50%, var(--color-ink-3) 60%, var(--color-ink-3) 100%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        animation: "shimmer-text 2.2s linear infinite",
      }}
    >
      {children}
    </span>
  );
}

export default Shimmer;
