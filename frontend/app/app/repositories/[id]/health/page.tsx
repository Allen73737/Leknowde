import Link from "next/link";
import { Activity, AlertTriangle, ClipboardList, Gauge, Info } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { SeverityChart } from "@/components/charts/severity-chart";
import { HealthFindings } from "@/components/repo/health-findings";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { HealthResponse } from "@/lib/types";

export const metadata = { title: "Health" };

function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export default async function HealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/health`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<HealthResponse>(`/repositories/${id}/health`);
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/health`} title="Health report unavailable" />;
  }

  const { summary, findings, metrics, limitations, unused_import_candidates, parser, analyzed_at } = {
    ...result.data,
    limitations: result.data.summary.limitations,
    metrics: result.data.summary.metrics,
    summary: result.data.summary,
  };

  const severityRows = ["critical", "high", "medium", "low", "info"].map((severity) => ({
    severity,
    count: summary.by_severity?.[severity] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Software health"
        description="Pattern-based findings, complexity metrics and test signals. This is not a vulnerability scan and it does not execute code."
        action={<Badge>{parser || "parser unknown"}</Badge>}
      />

      <MetricBand
        items={[
          {
            label: "Health score",
            value: summary.score,
            hint: `Grade ${summary.grade} · ${summary.findings} findings`,
            tone: scoreTone(summary.score),
          },
          {
            label: "Functions",
            value: formatNumber(metrics.functions),
            hint: `Max complexity ${metrics.max_cyclomatic_complexity}`,
          },
          {
            label: "Untested files",
            value: formatNumber(metrics.untested_files),
            hint: "Static import absence only",
            tone: metrics.untested_files > 0 ? "warning" : "default",
          },
          {
            label: "Circular groups",
            value: formatNumber(metrics.circular_groups),
            hint: "Import cycles",
            tone: metrics.circular_groups > 0 ? "warning" : "default",
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader
            title="Findings by severity"
            description="Penalties are additive and capped; see the breakdown below."
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            action={<Badge tone={scoreTone(summary.score)}>{summary.score}/100</Badge>}
          />
          <SeverityChart data={severityRows} />
          <div className="border-t border-line px-5 py-4">
            <p className="text-[0.75rem] font-medium text-faint">
              Penalty breakdown
            </p>
            {summary.penalties.length === 0 ? (
              <p className="mt-2 text-[0.875rem] text-faint">No penalties were applied.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {summary.penalties.map((penalty) => (
                  <li key={penalty.label}>
                    <div className="flex items-center justify-between gap-3 text-[0.9375rem]">
                      <span className="text-muted">
                        {penalty.label}{" "}
                        <span className="tabular text-[0.75rem] text-faint">({penalty.count})</span>
                      </span>
                      <span className="tabular text-[0.8125rem] text-warning">-{penalty.points}</span>
                    </div>
                    <Progress value={Math.min(100, penalty.points * 2)} tone="warning" className="mt-1.5 h-1.5" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Metrics"
            description="Computed from indexed files, not estimated."
            icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
          />
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 px-5 py-4">
            {[
              ["Files", formatNumber(metrics.files)],
              ["Lines", formatNumber(metrics.lines)],
              ["Functions", formatNumber(metrics.functions)],
              ["Avg function length", `${metrics.average_function_length.toFixed(1)} lines`],
              ["Avg complexity", metrics.average_cyclomatic_complexity.toFixed(1)],
              ["Max complexity", String(metrics.max_cyclomatic_complexity)],
              ["Duplicate blocks", String(metrics.duplicate_blocks)],
              ["Comment ratio", `${Math.round(metrics.comment_ratio * 100)}%`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[0.75rem] text-faint">{label}</dt>
                <dd className="tabular mt-1 text-[0.9375rem] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line px-5 py-3.5">
            <p className="text-[0.8125rem] text-faint">Analyzed {formatDateTime(analyzed_at)}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">Findings</h2>
            <span className="tabular text-[0.75rem] text-faint">{findings.length} records</span>
          </div>
          <HealthFindings repositoryID={id} findings={findings} />
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="By kind"
              icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
            />
            <div className="space-y-2 px-5 py-4">
              {Object.keys(summary.by_kind ?? {}).length === 0 ? (
                <p className="text-[0.875rem] text-faint">No findings.</p>
              ) : (
                Object.entries(summary.by_kind)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between gap-3 py-0.5">
                      <span className="truncate font-mono text-[0.8125rem] text-muted">{key}</span>
                      <Badge>{count}</Badge>
                    </div>
                  ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Unused-import candidates"
              description="Confidence is shown because this is a heuristic."
              icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            />
            {unused_import_candidates.length === 0 ? (
              <p className="px-5 py-10 text-center text-[0.875rem] text-faint">None found.</p>
            ) : (
              <ul className="divide-y divide-line">
                {unused_import_candidates.slice(0, 8).map((item, index) => (
                  <li key={`${item.file}-${index}`} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/app/repositories/${id}/explorer?path=${encodeURIComponent(item.file)}`}
                        className="min-w-0 truncate font-mono text-[0.8125rem] text-accent transition-colors hover:text-ink"
                      >
                        {item.file}:{item.line}
                      </Link>
                      <Badge tone="warning">{Math.round(item.confidence * 100)}%</Badge>
                    </div>
                    <p className="mt-1 break-all font-mono text-[0.75rem] text-muted">{item.imports}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Limitations"
              description="Stated explicitly so the score is not over-read."
              icon={<Info className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="space-y-2.5 px-5 py-4">
              {limitations.map((limitation) => (
                <li key={limitation} className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-muted">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                  {limitation}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
