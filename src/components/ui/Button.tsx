import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:   "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "bg-surface text-text border border-border hover:bg-surface-sunken",
  ghost:     "bg-transparent text-text-muted hover:bg-surface-sunken hover:text-text",
  danger:    "bg-status-danger-bg text-status-danger-fg hover:brightness-95",
};

/** lg exists for the counter: staff tap these on a touchscreen, fast,
 *  sometimes without looking. Anything below 44px fails on a shop floor. */
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  fullWidth,
  className,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium",
        "transition-colors disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}
