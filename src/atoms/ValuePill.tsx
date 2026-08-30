import type { ReactNode } from "react";

type Tone = "green" | "orange" | "red" | "accent";

const tones: Record<Tone, { cls: string; ring: string }> = {
  green: { cls: "bg-green-tint text-green", ring: "var(--color-green)" },
  orange: { cls: "bg-orange-tint text-orange", ring: "var(--color-orange)" },
  red: { cls: "bg-red-tint text-red", ring: "var(--color-red)" },
  accent: { cls: "bg-accent-tint text-accent-ink", ring: "var(--color-accent)" },
};

export function ValuePill({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const t = tone ? tones[tone] : null;
  return (
    <span
      className={`mx-0.5 inline-flex items-center rounded-full px-1.5 py-0
        align-middle text-[12px] font-medium ${t ? t.cls : "bg-field text-ink-2"} `}
      style={{
        boxShadow: t
          ? `0 0 0 1px color-mix(in oklch, ${t.ring} 28%, transparent)`
          : "var(--shadow-hairline)",
      }}
    >
      {children}
    </span>
  );
}

export default ValuePill;
