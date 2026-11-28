import { cn } from "@/lib/format";

export function Progress({
  value,
  className,
  tone = "accent",
  label,
}: {
  value: number;
  className?: string;
  tone?: "accent" | "success" | "warning" | "danger";
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const toneClass = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-[2px] bg-raised", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          "bar-in h-full rounded-[2px] transition-[width] duration-700 ease-smooth",
          toneClass,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
