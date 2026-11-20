"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { cn, formatNumber, severityTone } from "@/lib/format";
import type { Finding } from "@/lib/types";

export function HealthFindings({
  repositoryID,
  findings,
}: {
  repositoryID: string;
  findings: Finding[];
}) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [kind, setKind] = useState("all");
  const [openID, setOpenID] = useState<string | null>(null);

  const kinds = useMemo(() => {
    const map = new Map<string, number>();
    for (const finding of findings) map.set(finding.kind, (map.get(finding.kind) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [findings]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return findings.filter((finding) => {
      if (severity !== "all" && finding.severity !== severity) return false;
      if (kind !== "all" && finding.kind !== kind) return false;
      if (!needle) return true;
      return (
        finding.title.toLowerCase().includes(needle) ||
        finding.description.toLowerCase().includes(needle) ||
        finding.file_path.toLowerCase().includes(needle) ||
        finding.kind.toLowerCase().includes(needle)
      );
    });
  }, [findings, query, severity, kind]);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-col gap-3 border-b border-line p-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search findings</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, path or kind"
              className="h-10 w-full pl-9 text-[0.875rem] sm:w-64"
            />
          </label>
          <Select
            aria-label="Severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className="h-10 w-auto text-[0.875rem]"
          >
            <option value="all">All severities</option>
            {["critical", "high", "medium", "low", "info"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Finding kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-10 w-auto text-[0.875rem]"
          >
            <option value="all">All kinds</option>
            {kinds.map(([value, count]) => (
              <option key={value} value={value}>
                {value} ({count})
              </option>
            ))}
          </Select>
        </div>
        <p className="flex items-center gap-1.5 font-mono text-[0.75rem] text-faint">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {formatNumber(filtered.length)} of {formatNumber(findings.length)} shown
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-12 text-center text-[0.9375rem] text-faint">No findings match.</p>
      ) : (
        <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
          {filtered.map((finding) => {
            const open = openID === finding.id;
            return (
              <li key={finding.id} className="transition-colors duration-200 hover:bg-raised/30">
                <button
                  type="button"
                  onClick={() => setOpenID(open ? null : finding.id)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                  aria-expanded={open}
                >
                  <ChevronDown
                    className={cn(
                      "mt-1 h-4 w-4 shrink-0 text-faint transition-transform duration-200 ease-smooth",
                      open ? "rotate-0" : "-rotate-90",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge className={cn(severityTone(finding.severity))}>
                        {finding.severity}
                      </Badge>
                      <Badge>{finding.kind}</Badge>
                      <span className="text-[0.9375rem] font-medium leading-snug text-ink">
                        {finding.title}
                      </span>
                    </span>
                    <span className="mt-1.5 block truncate font-mono text-[0.75rem] text-faint">
                      {finding.file_path}:{finding.start_line}–{finding.end_line} · {finding.status}
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-line/70 bg-canvas px-4 py-4 sm:px-11">
                    <p className="text-[0.9375rem] leading-relaxed text-muted">
                      {finding.description}
                    </p>
                    {finding.evidence ? (
                      <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-line bg-shell px-3 py-2.5 font-mono text-[0.75rem] leading-relaxed text-muted">
                        <code className="whitespace-pre-wrap break-words">{finding.evidence}</code>
                      </pre>
                    ) : null}
                    <Link
                      href={`/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(finding.file_path)}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-[0.875rem] font-medium text-accent transition-colors hover:text-ink"
                    >
                      Open source file
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
