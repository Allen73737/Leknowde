"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { cn, formatNumber } from "@/lib/format";
import type { Symbol } from "@/lib/types";

export function SymbolTable({
  repositoryID,
  symbols,
  total,
}: {
  repositoryID: string;
  symbols: Symbol[];
  total: number;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [onlyExported, setOnlyExported] = useState(false);

  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const symbol of symbols) counts.set(symbol.kind, (counts.get(symbol.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [symbols]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return symbols.filter((symbol) => {
      if (kind !== "all" && symbol.kind !== kind) return false;
      if (onlyExported && !symbol.exported) return false;
      if (!needle) return true;
      return (
        symbol.name.toLowerCase().includes(needle) ||
        symbol.qualified_name.toLowerCase().includes(needle) ||
        symbol.file_path.toLowerCase().includes(needle) ||
        symbol.signature.toLowerCase().includes(needle)
      );
    });
  }, [symbols, query, kind, onlyExported]);

  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search symbols</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, signature or path"
              className="h-8 w-64 pl-8 text-xs"
            />
          </label>
          <Select
            aria-label="Symbol kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-8 w-auto text-xs"
          >
            <option value="all">All kinds ({symbols.length})</option>
            {kinds.map(([value, count]) => (
              <option key={value} value={value}>
                {value} ({count})
              </option>
            ))}
          </Select>
          <label className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted">
            <input
              type="checkbox"
              checked={onlyExported}
              onChange={(event) => setOnlyExported(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Exported only
          </label>
        </div>
        <p className="font-mono text-[0.75rem] text-faint">
          {formatNumber(filtered.length)} shown · {formatNumber(total)} indexed
          {total >= 1000 ? " (capped at 1,000)" : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs text-faint">No symbols match this filter.</p>
      ) : (
        <div className="max-h-[680px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-shell">
              <tr className="border-b border-line text-[0.75rem] uppercase tracking-[0.1em] text-faint">
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 text-right font-medium">Lines</th>
                <th className="px-3 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((symbol) => (
                <tr key={symbol.id} className="border-b border-line/70 last:border-0 hover:bg-raised/40">
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <Badge>{symbol.kind}</Badge>
                  </td>
                  <td className="max-w-sm px-3 py-2 align-top">
                    <p className="truncate font-mono text-[0.8125rem] text-ink">{symbol.qualified_name || symbol.name}</p>
                    {symbol.signature ? (
                      <p className="mt-0.5 truncate font-mono text-[0.75rem] text-faint">{symbol.signature}</p>
                    ) : null}
                    {symbol.doc_comment ? (
                      <p className="mt-1 line-clamp-2 text-[0.75rem] leading-relaxed text-muted">{symbol.doc_comment}</p>
                    ) : null}
                  </td>
                  <td className="max-w-xs px-3 py-2 align-top">
                    <Link
                      href={`/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(symbol.file_path)}`}
                      className={cn("block truncate font-mono text-[0.75rem] text-accent hover:underline")}
                    >
                      {symbol.file_path}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono text-[0.75rem] text-faint">
                    {symbol.start_line}–{symbol.end_line}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    {symbol.exported ? <Badge tone="accent">exported</Badge> : <span className="text-[0.75rem] text-faint">internal</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 ? (
            <p className="border-t border-line px-3 py-2 text-[0.75rem] text-faint">
              Showing the first 500 matching symbols. Narrow the filter or use search to reach the rest.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
