import type { ReactNode } from "react";

import { cn } from "@/lib/format";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-raised text-muted",
  accent: "border-accent/40 bg-accent/10 text-accent",
  success: "border-success/50 bg-success/10 text-success",
  warning: "border-warning/50 bg-warning/10 text-warning",
  danger: "border-danger/50 bg-danger/10 text-danger",
  outline: "border-line bg-transparent text-muted",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  mono = false,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.75rem] leading-none tracking-[0.01em]",
        mono ? "font-mono" : "font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
