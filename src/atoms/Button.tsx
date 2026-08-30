import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "accent"
  | "primary"
  | "secondary"
  | "success"
  | "ghost"
  | "quiet";

type Size = "xs" | "sm" | "md";

const base =
  "inline-flex items-center justify-center font-medium select-none " +
  "transition-[transform,background-color,opacity] duration-150 ease-out " +
  "active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  accent:
    "bg-accent text-white hover:bg-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
  primary:
    "bg-ink text-canvas hover:opacity-90 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
  secondary:
    "bg-surface text-ink shadow-btn hover:bg-inset aria-expanded:bg-hover",
  success:
    "bg-green text-white hover:brightness-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
  ghost: "bg-hover-2 text-ink hover:bg-line-strong",
  quiet: "bg-transparent text-ink-2 hover:bg-hover hover:text-ink",
};

const sizes: Record<Size, string> = {
  xs: "h-6 px-2 text-[11.5px] rounded-full gap-1",
  sm: "px-3 py-[7px] text-[13px] leading-none rounded-full gap-1.5",
  md: "h-9 px-3.5 text-[13px] rounded-full gap-1.5",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: Size;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: Props) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...rest} />
  );
}

export default Button;
