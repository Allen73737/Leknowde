import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  return new Intl.NumberFormat("en-US").format(value);
}

/** "1 file" / "3 files" — the count is formatted, the noun is not pluralised blindly. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = count === 1 ? singular : pluralForm ?? `${singular}s`;
  return `${formatNumber(count)} ${word}`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) return `${Math.round(abs / minute)}m ago`;
  if (abs < day) return `${Math.round(abs / hour)}h ago`;
  if (abs < 30 * day) return `${Math.round(abs / day)}d ago`;
  return formatDate(iso);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(value: string, length = 80): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

export function riskTone(level: string | undefined): string {
  switch ((level ?? "").toLowerCase()) {
    case "critical":
      return "border-danger/50 bg-danger/10 text-danger";
    case "high":
      return "border-warning/60 bg-warning/10 text-warning";
    case "medium":
      return "border-warning/40 bg-warning/5 text-warning";
    case "low":
      return "border-success/50 bg-success/10 text-success";
    default:
      return "border-line bg-raised text-muted";
  }
}

export function severityTone(severity: string | undefined): string {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "border-danger/60 bg-danger/10 text-danger";
    case "high":
      return "border-warning/60 bg-warning/10 text-warning";
    case "medium":
      return "border-warning/40 bg-warning/5 text-warning";
    case "low":
      return "border-line bg-raised text-muted";
    default:
      return "border-line bg-shell text-faint";
  }
}

export function languageColor(language: string): string {
  // Mineral Signal ramp: low-saturation sage and stone only. Language hues are
  // deliberately not mirrored from vendor brand colours — the identity forbids
  // cyan, blue, violet, neon and terracotta.
  const known: Record<string, string> = {
    TypeScript: "#9fbfa8",
    JavaScript: "#c3c6a4",
    Python: "#7fa98c",
    Go: "#8fb3ae",
    SQL: "#b3b89a",
    Markdown: "#a5b0a6",
    Rust: "#a8b79a",
    Java: "#b7c2a9",
    "C#": "#93a89b",
    CSS: "#adb8a4",
    HTML: "#a9b39e",
    JSON: "#a5b0a6",
    YAML: "#b0b8a2",
  };
  return known[language] ?? "#77847b";
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function statusTone(status: string): string {
  switch (status) {
    case "ready":
    case "completed":
    case "published":
      return "border-success/50 bg-success/10 text-success";
    case "indexing":
    case "running":
      return "border-warning/50 bg-warning/10 text-warning";
    case "failed":
    case "error":
      return "border-danger/50 bg-danger/10 text-danger";
    case "queued":
    case "pending":
      return "border-line bg-raised text-muted";
    default:
      return "border-line bg-raised text-muted";
  }
}

export function parseMaybeJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
