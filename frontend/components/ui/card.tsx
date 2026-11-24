import type { ReactNode } from "react";

import { cn } from "@/lib/format";

export function Card({
  children,
  className,
  as: Tag = "div",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "min-w-0 rounded-card border border-line bg-surface shadow-card",
        interactive && "card-hover",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4 sm:flex-nowrap",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-shell text-faint">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-[-0.015em] text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="eyebrow mb-2 flex items-center gap-2">
            <span aria-hidden="true" className="h-[3px] w-5 rounded-full bg-accent" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[1.875rem] font-semibold tracking-[-0.035em] text-ink text-balance sm:text-[2.125rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2.5 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pb-0.5">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-shell text-faint shadow-card">
          {icon}
          <span
            aria-hidden="true"
            className="absolute -inset-1 rounded-lg border border-line/50"
          />
        </div>
      ) : null}
      <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
  className?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-ink";
  return (
    <div
      className={cn(
        "min-w-0 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card transition-colors duration-200 ease-smooth hover:border-line-strong",
        className,
      )}
    >
      <p className="text-[0.75rem] font-medium text-muted">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1.5 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em]",
          toneClass,
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[0.75rem] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function MetricBand({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "danger" | "warning" | "success" }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line shadow-card lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => {
        const toneClass =
          item.tone === "danger"
            ? "text-danger"
            : item.tone === "warning"
              ? "text-warning"
              : item.tone === "success"
                ? "text-success"
                : "text-ink";
        return (
          <div key={item.label} className="min-w-0 bg-surface px-5 py-4">
            <p className="text-[0.75rem] font-medium text-muted">{item.label}</p>
            <p
              className={cn(
                "tabular mt-2 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em]",
                toneClass,
              )}
            >
              {item.value}
            </p>
            {item.hint ? (
              <p className="mt-1.5 text-[0.75rem] leading-snug text-faint">{item.hint}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function InlineNotice({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: "neutral" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const toneClass = {
    neutral: "border-line bg-shell text-muted",
    warning: "border-warning/40 bg-warning/5 text-warning",
    danger: "border-danger/40 bg-danger/5 text-danger",
    success: "border-success/40 bg-success/5 text-success",
  }[tone];
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3.5 text-sm leading-relaxed",
        toneClass,
        className,
      )}
    >
      {title ? <p className="mb-1.5 font-semibold text-ink">{title}</p> : null}
      {children}
    </div>
  );
}
