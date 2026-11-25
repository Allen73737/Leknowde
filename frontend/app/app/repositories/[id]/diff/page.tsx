import { Activity, Clock, Info } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { SnapshotSelector } from "@/components/repo/snapshot-selector";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { SnapshotRef, TemporalDiff } from "@/lib/types";

export const metadata = { title: "Architecture diff" };

function driftTone(level: string) {
  switch ((level ?? "").toLowerCase()) {
    case "high":
      return "text-danger";
    case "medium":
      return "text-warning";
    case "low":
      return "text-muted";
    default:
      return "text-success";
  }
}

export default async function ArchitectureDiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const asString = (v: string | string[] | undefined) =>
    Array.isArray(v) ? (v[0] ?? "") : v ?? "";
  const baseParam = asString(search.base);
  const headParam = asString(search.head);
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/diff`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  let diff: TemporalDiff | null = null;
  let loadError: string | null = null;
  let snapshots: SnapshotRef[] = [];

  if (baseParam && headParam) {
    const result = await safeGet<TemporalDiff>(
      `/repositories/${id}/diff?base=${encodeURIComponent(baseParam)}&head=${encodeURIComponent(headParam)}`,
    );
    if (result.data) {
      diff = result.data;
    } else {
      loadError = result.error?.message || "Diff could not be computed.";
    }
  }

  const snapshotsResult = await safeGet<{ snapshots: SnapshotRef[] }>(
    `/repositories/${id}/snapshots?limit=40`,
  );
  if (snapshotsResult.data) {
    snapshots = snapshotsResult.data.snapshots;
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Temporal architecture diff"
        description="Compares two architecture snapshots captured at index time. Reports added/removed files, module coupling changes, new and resolved cycles, API additions and removals, and an explicit drift score."
      />

      <SnapshotSelector
        snapshots={snapshots}
        base={baseParam}
        head={headParam}
        repositoryID={id}
      />

      {!baseParam || !headParam ? null : <>
        {loadError ? (
            <Card>
              <CardHeader title="Diff unavailable" />
              <p className="px-5 py-3 text-[0.8125rem] text-muted">{loadError}</p>
            </Card>
          ) : null}

          {diff ? <>
              <MetricBand
                items={[
                  {
                    label: "Drift score",
                    value: formatNumber(diff.drift_score),
                    hint: driftTone(diff.drift_level) === "text-success" ? "low drift" : "review drift",
                    tone: diff.drift_level === "high" ? "danger" : diff.drift_level === "medium" ? "warning" : "default",
                  },
                  { label: "Level", value: diff.drift_level, hint: "Explicit additive score" },
                  { label: "Files", value: `${diff.file_delta >= 0 ? "+" : ""}${formatNumber(diff.file_delta)}`, hint: "added / removed" },
                  { label: "Coupling", value: `${diff.coupling_delta >= 0 ? "+" : ""}${formatNumber(diff.coupling_delta)}`, hint: "module import delta" },
                ]}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Files"
                    icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                  />
                  <div className="space-y-3 px-5 py-4">
                    <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
                      <span className="text-muted">Added</span>
                      <Badge>{formatNumber(diff.added_files.length)}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
                      <span className="text-muted">Removed</span>
                      <Badge>{formatNumber(diff.removed_files.length)}</Badge>
                    </div>
                    {diff.added_files.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[0.7rem] font-medium text-faint">Added</p>
                        {diff.added_files.slice(0, 10).map((f) => (
                          <p key={f} className="font-mono text-[0.75rem] text-muted truncate">
                            {f}
                          </p>
                        ))}
                      </div>
                    )}
                    {diff.removed_files.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[0.7rem] font-medium text-faint">Removed</p>
                        {diff.removed_files.slice(0, 10).map((f) => (
                          <p key={f} className="font-mono text-[0.75rem] text-muted truncate">
                            {f}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title="Cycles"
                    icon={<Clock className="h-4 w-4" aria-hidden="true" />}
                  />
                  <div className="space-y-3 px-5 py-4">
                    <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
                      <span className="text-muted">New cycles</span>
                      <Badge tone={diff.new_cycles.length > 0 ? "warning" : "neutral"}>{formatNumber(diff.new_cycles.length)}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
                      <span className="text-muted">Resolved cycles</span>
                      <Badge>{formatNumber(diff.resolved_cycles.length)}</Badge>
                    </div>
                    {[...diff.new_cycles, ...diff.resolved_cycles].slice(0, 6).map((cycle, index) => (
                      <div key={index} className="px-5 py-2 border-b border-line/50 last:border-0">
                        <p className="font-mono text-[0.75rem] text-muted truncate">{cycle.join(" → ")}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card>
                <CardHeader title="Module coupling changes" description="Dependencies added, removed or changed between modules." />
                <div className="space-y-3 px-5 py-4">
                  <div className="grid gap-2 text-[0.75rem]">
                    <div className="flex justify-between">
                      <span className="text-muted">Added</span>
                      <span className="text-muted tabular">{formatNumber(diff.added_module_edges.length)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Removed</span>
                      <span className="text-muted tabular">{formatNumber(diff.removed_module_edges.length)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Changed weight</span>
                      <span className="text-muted tabular">{formatNumber(diff.changed_module_edges.length)}</span>
                    </div>
                  </div>
                  {[...diff.added_module_edges, ...diff.removed_module_edges, ...diff.changed_module_edges]
                    .slice(0, 12)
                    .map((change) => (
                      <div key={`${change.from}->${change.to}`} className="px-5 py-2 border-b border-line/50 last:border-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-[0.75rem] text-ink truncate">{change.from} → {change.to}</span>
                          <span className="tabular text-[0.75rem] text-muted">
                            {change.before} → {change.after}
                          </span>
                        </div>
                      </div>
                    ))}
                  {diff.added_module_edges.length === 0 && diff.removed_module_edges.length === 0 && diff.changed_module_edges.length === 0 && (
                    <p className="px-5 py-3 text-center text-[0.8125rem] text-faint">No module coupling changes.</p>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="API changes" description="Endpoints added or removed between the two snapshots." />
                <div className="grid gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-medium text-faint">Added ({formatNumber(diff.added_apis.length)})</p>
                    <ul className="space-y-1 mt-1">
                      {diff.added_apis.slice(0, 12).map((api) => (
                        <li key={api} className="font-mono text-[0.75rem] text-muted truncate">{api}</li>
                      ))}
                      {diff.added_apis.length === 0 && <p className="text-[0.75rem] text-faint">None.</p>}
                    </ul>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-medium text-faint">Removed ({formatNumber(diff.removed_apis.length)})</p>
                    <ul className="space-y-1 mt-1">
                      {diff.removed_apis.slice(0, 12).map((api) => (
                        <li key={api} className="font-mono text-[0.75rem] text-muted truncate">{api}</li>
                      ))}
                      {diff.removed_apis.length === 0 && <p className="text-[0.75rem] text-faint">None.</p>}
                    </ul>
                  </div>
                </div>
              </Card>

              {diff.drift_factors.length > 0 && (
                <Card>
                  <CardHeader title="Drift factors" description="Each factor adds points to the drift score. Zero-point factors are omitted." />
                  <div className="space-y-2 px-5 py-4">
                    {diff.drift_factors.map((factor) => (
                      <div key={factor.label} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                        <span className="min-w-0 truncate">{factor.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`tabular font-mono ${driftTone(factor.points > 0 ? "warning" : "default")}`}>
                            {factor.points > 0 ? "+" : ""}{factor.points}
                          </span>
                          <span className="text-[0.75rem] text-muted truncate">{factor.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <div className="space-y-3 px-5 py-4 border-t border-line">
                <p className="text-[0.75rem] font-medium text-muted">Summary</p>
                <ul className="space-y-1.5">
                  {diff.summary.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <Card>
                <CardHeader title="Limitations" icon={<Info className="h-4 w-4" aria-hidden="true" />} />
                <ul className="space-y-2 px-5 py-4">
                  {diff.limitations.map((limitation) => (
                    <li key={limitation} className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-muted">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                      {limitation}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          : null
          }
        </>
      }

      <p className="text-[0.75rem] text-faint">
        Snapshots are captured at index time. Changes between indexes are not represented. Compare snapshots
        from the same branch to see how the architecture evolved across commits.
      </p>
    </div>
  );
}
