import Link from "next/link";
import { AlertTriangle, ArrowRight, GitBranch, Network, Repeat2, Workflow } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatNumber } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { DependenciesResponse } from "@/lib/types";

export const metadata = { title: "Dependencies" };

export default async function DependenciesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/dependencies`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<DependenciesResponse>(`/repositories/${id}/dependencies`);
  if (!result.data) {
    return (
      <ApiErrorNote
        error={result.error}
        retryHref={`/app/repositories/${id}/dependencies`}
        title="Dependencies unavailable"
      />
    );
  }

  const { summary, modules, unused_imports } = result.data;
  const cycles = result.data.cycles ?? [];
  const maxModuleCount = Math.max(1, ...modules.map((edge) => edge.count));
  const moduleList = [...modules].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Dependencies"
        description="Resolved file imports aggregated into module edges. External packages are recorded in source but are not graph nodes, so this view does not audit them."
        action={
          <Link
            href={`/app/repositories/${id}/architecture`}
            className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-accent transition-colors hover:text-ink"
          >
            Open architecture <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      <MetricBand
        items={[
          { label: "Dependency edges", value: formatNumber(summary.total), hint: "All graph relations" },
          { label: "Module edges", value: formatNumber(modules.length), hint: "Aggregated file imports" },
          {
            label: "Circular groups",
            value: formatNumber(cycles.length),
            hint: "Detected import cycles",
            tone: cycles.length > 0 ? "warning" : "default",
          },
          {
            label: "Unused candidates",
            value: formatNumber(unused_imports.length),
            hint: "Heuristic, not proof",
          },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Module coupling"
            description="Directional import counts between module boundaries."
            icon={<Workflow className="h-4 w-4" aria-hidden="true" />}
            action={
              <Badge>
                {moduleList.length} {moduleList.length === 1 ? "edge" : "edges"}
              </Badge>
            }
          />
          {moduleList.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              No module-level imports were resolved.
            </p>
          ) : (
            <div className="max-h-[352px] overflow-auto">
              <table className="data-table w-full text-left">
                <thead>
                  <tr>
                    <th className="px-5">From</th>
                    <th className="px-1" />
                    <th className="px-1">To</th>
                    <th className="px-5 text-right">Imports</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleList.map((edge) => (
                    <tr key={`${edge.from}-${edge.to}`}>
                      <td className="px-5 font-mono text-[0.75rem] text-ink">{edge.from}</td>
                      <td className="px-1 py-2.5 text-faint">→</td>
                      <td className="px-1 font-mono text-[0.75rem] text-muted">{edge.to}</td>
                      <td className="px-5">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={(edge.count / maxModuleCount) * 100} className="h-1 w-16" />
                          <span className="tabular w-5 text-right font-mono text-[0.75rem] text-faint">
                            {edge.count}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader
              title="Fan-in leaders"
              description="Files imported by the most other files."
              icon={<Network className="h-4 w-4" aria-hidden="true" />}
            />
            {summary.top_files.length === 0 ? (
              <p className="px-5 py-10 text-center text-[0.875rem] text-faint">No fan-in data.</p>
            ) : (
              <ul className="divide-y divide-line">
                {summary.top_files.slice(0, 6).map((file) => (
                  <li key={file.path} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link
                      href={`/app/repositories/${id}/explorer?path=${encodeURIComponent(file.path)}`}
                      className="min-w-0 truncate font-mono text-[0.75rem] text-ink transition-colors hover:text-accent"
                    >
                      {file.path}
                    </Link>
                    <span className="tabular shrink-0 text-[0.75rem] text-faint">
                      {file.in_degree} in
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Relation mix"
              icon={<GitBranch className="h-4 w-4" aria-hidden="true" />}
              action={<Badge>{summary.relations.length} types</Badge>}
            />
            <div className="space-y-1.5 px-5 py-3.5">
              {summary.relations.length === 0 ? (
                <p className="text-[0.875rem] text-faint">No graph relations recorded.</p>
              ) : (
                summary.relations.map((relation) => (
                  <div key={relation.relation} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[0.75rem] text-muted">{relation.relation}</span>
                    <span className="tabular text-[0.75rem] text-faint">
                      {formatNumber(relation.count)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Circular groups"
            icon={<Repeat2 className="h-4 w-4" aria-hidden="true" />}
            action={<Badge tone={cycles.length > 0 ? "warning" : "success"}>{cycles.length}</Badge>}
          />
          {cycles.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              No circular import groups were detected.
            </p>
          ) : (
            <ul className="max-h-[300px] divide-y divide-line overflow-y-auto">
              {cycles.map((cycle, index) => (
                <li key={`cycle-${index}`} className="px-5 py-3">
                  <p className="font-mono text-[0.75rem] leading-relaxed text-muted">{cycle.join(" → ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Unused-import candidates"
            description="Static heuristic with calibrated confidence. Re-exports and side-effect imports can produce false positives."
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            action={
              <Badge tone={unused_imports.length > 0 ? "warning" : "success"}>{unused_imports.length}</Badge>
            }
          />
          {unused_imports.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              No unused-import candidates were found.
            </p>
          ) : (
            <>
              <ul className="max-h-[300px] divide-y divide-line overflow-y-auto">
                {unused_imports.map((item, index) => (
                  <li key={`${item.file}-${item.line}-${index}`} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/app/repositories/${id}/explorer?path=${encodeURIComponent(item.file)}`}
                        className="truncate font-mono text-[0.75rem] text-accent transition-colors hover:text-ink"
                      >
                        {item.file}:{item.line}
                      </Link>
                      <Badge tone="warning">{Math.round(item.confidence * 100)}% confidence</Badge>
                    </div>
                    <p className="mt-1 break-all font-mono text-[0.75rem] text-ink">{item.imports}</p>
                    <p className="mt-0.5 text-[0.75rem] leading-relaxed text-faint">{item.reason}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
