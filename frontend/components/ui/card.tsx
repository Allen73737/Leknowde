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
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <div className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-line bg-shell text-faint">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="truncate text-[0.9375rem] font-semibold tracking-[-0.015em] text-ink">
              {title}
            </h2>
            {meta ? <div className="shrink-0">{meta}</div> : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="ml-auto shrink-0 pt-0.5">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-3.5", className)}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-line px-4 py-2.5", className)}>{children}</div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  meta,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: { label: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="meta-label mb-2 flex items-center gap-2">
            <span aria-hidden="true" className="h-px w-6 bg-accent" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.08] tracking-[-0.04em] text-ink text-balance sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-muted">{description}</p>
        ) : null}
        {meta && meta.length > 0 ? (
          <dl className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {meta.map((item) => (
              <div key={item.label} className="flex min-w-0 items-baseline gap-1.5">
                <dt className="meta-label">{item.label}</dt>
                <dd className="tabular truncate font-mono text-[0.75rem] text-muted">{item.value}</dd>
              </div>
            ))}
          </dl>
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
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="relative mb-4 flex h-10 w-10 items-center justify-center rounded-[7px] border border-line bg-shell text-faint">
          {icon}
          <span aria-hidden="true" className="absolute -inset-[3px] rounded-[9px] border border-line/40" />
        </div>
      ) : null}
      <h3 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
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
      <span aria-hidden="true" className="tick mb-2.5" />
      <p className="meta-label">{label}</p>
      <p
        className={cn(
          "tabular mt-1.5 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.035em]",
          toneClass,
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[0.75rem] leading-snug text-faint">{hint}</p> : null}
    </div>
  );
}

export function MetricBand({
  items,
  className,
}: {
  items: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    tone?: "default" | "danger" | "warning" | "success";
  }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line shadow-card lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => {
        const toneClass =
          item.tone === "danger"
            ? "text-danger"
            : item.tone === "warning"
              ? "text-warning"
              : item.tone === "success"
                ? "text-success"
                : "text-ink";
        return (
          <div key={item.label} className="relative min-w-0 bg-surface px-4 py-3.5">
            <span
              aria-hidden="true"
              className={cn("absolute inset-x-0 top-0 h-px", index === 0 ? "bg-accent/45" : "bg-transparent")}
            />
            <span aria-hidden="true" className="tick mb-2.5" />
            <p className="meta-label">{item.label}</p>
            <p
              className={cn(
                "tabular mt-1.5 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.035em]",
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
        "rounded-[7px] border px-3.5 py-3 text-[0.8125rem] leading-relaxed",
        toneClass,
        className,
      )}
    >
      {title ? <p className="mb-1 font-semibold text-ink">{title}</p> : null}
      {children}
    </div>
  );
}
