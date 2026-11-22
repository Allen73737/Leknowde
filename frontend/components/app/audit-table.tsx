"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import type { AuditLog } from "@/lib/types";

function actionTone(action: string): "accent" | "danger" | "warning" | "success" | "neutral" {
  if (action.startsWith("integration.disconnect") || action.startsWith("user.delete") || action.startsWith("repository.delete")) {
    return "danger";
  }
  if (action.startsWith("integration") || action.startsWith("user.password") || action.startsWith("auth")) {
    return "warning";
  }
  if (action.startsWith("repository.index") || action.startsWith("document.publish")) return "success";
  if (action.startsWith("workspace")) return "accent";
  return "neutral";
}

function prettyMetadata(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length === 0) return "—";
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw || "—";
  }
}

export function AuditTable({ logs }: { logs: AuditLog[] }) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("all");

  const targets = useMemo(() => {
    const unique = [...new Set(logs.map((log) => log.target_type).filter(Boolean))];
    return unique.sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (target !== "all" && log.target_type !== target) return false;
      if (!needle) return true;
      return (
        log.action.toLowerCase().includes(needle) ||
        log.actor_email.toLowerCase().includes(needle) ||
        log.target_id.toLowerCase().includes(needle) ||
        log.ip.toLowerCase().includes(needle)
      );
    });
  }, [logs, query, target]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by action, actor, target ID or IP"
            aria-label="Filter audit events"
            className="h-10 pl-9 text-[0.875rem]"
          />
        </div>
        <Select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          aria-label="Filter by target type"
          className="h-10 text-[0.875rem] sm:w-52"
        >
          <option value="all">All target types</option>
          {targets.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <span className="shrink-0 font-mono text-[0.75rem] text-faint">
          {filtered.length}/{logs.length}
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={<Search className="h-5 w-5" aria-hidden="true" />}
            title="No audit events recorded"
            description="Sign-ins, workspace changes, repository actions and integration changes are written here with the acting account."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-shell/60">
                  {["Action", "Actor", "Target", "IP", "When"].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-[0.75rem] font-medium text-faint"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((log) => {
                  const metadata = prettyMetadata(log.metadata);
                  return (
                    <tr key={log.id} className="align-top transition-colors duration-150 hover:bg-raised/40">
                      <td className="px-4 py-3.5">
                        <Badge tone={actionTone(log.action)}>{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block max-w-[220px] truncate font-mono text-[0.8125rem] text-ink">
                          {log.actor_email || "system"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block font-mono text-[0.8125rem] text-muted">{log.target_type || "—"}</span>
                        <span className="mt-1 block max-w-[240px] truncate font-mono text-[0.75rem] text-faint">
                          {log.target_id || "—"}
                        </span>
                        {metadata !== "—" ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[0.8125rem] font-medium text-accent hover:underline">metadata</summary>
                            <pre className="mt-1 max-w-[280px] overflow-x-auto rounded border border-line bg-canvas p-1.5 font-mono text-[0.75rem] leading-relaxed text-muted">
                              {metadata}
                            </pre>
                          </details>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[0.8125rem] text-faint">{log.ip || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[0.8125rem] text-faint">
                        {formatDateTime(log.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-[0.875rem] text-faint">No events match this filter.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
