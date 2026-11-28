import type { ReactNode } from "react";

import { cn } from "@/lib/format";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-shell text-muted",
  accent: "border-accent/35 bg-accent/10 text-accent",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
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
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[3px] text-[0.75rem] font-medium leading-none tracking-[0.02em]",
        mono ? "font-mono" : "",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
