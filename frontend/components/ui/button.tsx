import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg border border-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] hover:brightness-[1.05] active:brightness-95 disabled:opacity-50",
  secondary:
    "bg-raised text-ink border border-line hover:border-line-strong hover:bg-raised/75 disabled:opacity-50",
  ghost:
    "bg-transparent text-muted border border-transparent hover:bg-raised hover:text-ink disabled:opacity-50",
  danger:
    "bg-danger/10 text-danger border border-danger/35 hover:bg-danger/15 disabled:opacity-50",
  outline:
    "bg-transparent text-ink border border-line hover:border-line-strong hover:bg-raised/50 hover:text-ink disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[0.8125rem] gap-1.5 rounded-[6px]",
  md: "h-9 px-3.5 text-[0.8125rem] gap-2 rounded-[7px]",
  lg: "h-11 px-5 text-[0.875rem] gap-2 rounded-[8px]",
};

export function buttonStyles(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex select-none items-center justify-center font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,filter,box-shadow,opacity] duration-150 focus-ring disabled:pointer-events-none disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonStyles(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
