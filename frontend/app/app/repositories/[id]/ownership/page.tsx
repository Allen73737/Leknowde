import { Activity, ShieldCheck, Users } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { OwnershipReport } from "@/lib/types";

export const metadata = { title: "Ownership" };

function busTone(factor: number) {
  if (factor === 0) return "text-faint";
  if (factor <= 2) return "text-warning";
  return "text-success";
}

export default async function OwnershipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const branch = Array.isArray(search.branch) ? search.branch[0] : search.branch;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/ownership`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<OwnershipReport>(
    `/repositories/${id}/ownership?branch=${encodeURIComponent(branch ?? bundle.data.repository.default_branch)}`,
  );
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/ownership`} title="Ownership unavailable" />;
  }

  const { authors, files, modules, hotspots, unowned_hotspots, codeowners, repo_bus_factor, top_author_share, total_touches, commits_with_file_evidence, total_stored_commits, limitations } = result.data;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Ownership, hotspots and bus factor"
        description="Commit-file evidence from the index, combined with graph fan-in and stored findings. Bus factor is the number of people who hold 50% of the change knowledge. CODEOWNERS entries are suggestions only — verify handles before committing."
        action={<Badge>{commits_with_file_evidence} / {total_stored_commits} commits indexed</Badge>}
      />

      <MetricBand
        items={[
          { label: "Authors", value: formatNumber(authors.length), hint: "With commit-file evidence" },
          { label: "Touches", value: formatNumber(total_touches), hint: "Commit-file changes" },
          { label: "Bus factor", value: formatNumber(repo_bus_factor), hint: "People holding 50% of knowledge", tone: repo_bus_factor <= 2 ? "warning" : "default" },
          { label: "Top share", value: `${(top_author_share * 100).toFixed(0)}%`, hint: "Of all changes" },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader
            title="Top authors"
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
          />
          <div className="space-y-3 px-5 py-4">
            {authors.length === 0 ? (
              <p className="text-[0.875rem] text-faint">No authors have commit-file evidence yet.</p>
            ) : (
              authors.slice(0, 8).map((author) => (
                <div key={author.email || author.name} className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.8125rem] text-ink truncate">{author.name}</p>
                    <p className="text-[0.75rem] text-muted truncate">{author.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-[0.8125rem] text-ink">{author.touches}</p>
                    <p className="text-[0.7rem] text-muted">{author.commits} commits</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Hotspots"
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            description="Additive score over change frequency, churn, import fan-in, findings and file size."
          />
          <div className="space-y-2 px-5 py-4">
            {hotspots.length === 0 ? (
              <p className="text-[0.875rem] text-faint">No hotspots detected.</p>
            ) : (
              hotspots.slice(0, 10).map((hotspot) => (
                <div key={hotspot.path} className="flex items-baseline justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.8125rem] text-ink truncate">{hotspot.path}</p>
                    <p className="text-[0.7rem] text-muted">{hotspot.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className={`tabular text-[0.8125rem] text-ink ${busTone(hotspot.bus_factor)}`}>{hotspot.score}</p>
                    <p className="text-[0.7rem] text-muted">bus {hotspot.bus_factor}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Modules"
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            description="Suggested CODEOWNERS entries derived from module ownership."
          />
          <div className="space-y-2 px-5 py-4">
            {codeowners.length === 0 ? (
              <p className="text-[0.875rem] text-faint">No confident module ownership detected.</p>
            ) : (
              codeowners.slice(0, 10).map((rule) => (
                <div key={rule.pattern} className="flex items-baseline justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.8125rem] text-ink truncate">{rule.pattern}</p>
                    <p className="text-[0.7rem] text-muted">{rule.handle} · {rule.owner}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-[0.8125rem] text-ink">{rule.touches}</p>
                    <p className="text-[0.7rem] text-muted">{Math.round(rule.share * 100)}% share</p>
                  </div>
                </div>
              ))
            )}
          </div>
          {codeowners.length > 0 && (
            <div className="mt-auto border-t border-line px-5 py-3">
              <p className="text-[0.75rem] font-medium text-faint">CODEOWNERS</p>
              <pre className="mt-1.5 p-2 rounded border border-line bg-shell text-[0.75rem] font-mono text-muted overflow-x-auto">
                {codeowners.map((rule) => rule.line).join("\n")}
              </pre>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="File ownership"
            description="Touches, churn, fan-in and findings per file. Top author share is shown per file."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-line">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-[0.75rem] font-medium text-muted">Path</th>
                  <th className="px-5 py-2 text-[0.75rem] font-medium text-muted text-right">Touches</th>
                  <th className="px-5 py-2 text-[0.75rem] font-medium text-muted text-right">Churn</th>
                  <th className="px-5 py-2 text-[0.75rem] font-medium text-muted text-right">Fan-in</th>
                  <th className="px-5 py-2 text-[0.75rem] font-medium text-muted text-right">Findings</th>
                  <th className="px-5 py-2 text-[0.75rem] font-medium text-muted text-right">Top share</th>
                </tr>
              </thead>
              <tbody>
                {files.slice(0, 20).map((file) => (
                  <tr key={file.path} className="border-b border-line/50 hover:bg-raised/30 transition-colors duration-150">
                    <td className="px-5 py-2 font-mono text-[0.75rem] text-ink truncate" style={{ maxWidth: 260 }}>{file.path}</td>
                    <td className="px-5 py-2 text-[0.75rem] tabular text-muted text-right">{formatNumber(file.touches)}</td>
                    <td className="px-5 py-2 text-[0.75rem] tabular text-muted text-right">{formatNumber(file.additions + file.deletions)}</td>
                    <td className="px-5 py-2 text-[0.75rem] tabular text-muted text-right">{formatNumber(file.fan_in)}</td>
                    <td className="px-5 py-2 text-[0.75rem] tabular text-muted text-right">{formatNumber(file.findings)}</td>
                    <td className="px-5 py-2 text-[0.75rem] tabular text-muted text-right">${(file.top_share * 100).toFixed(0)}%</td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[0.8125rem] text-faint">
                      No files with commit-file evidence.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Unowned hotspots" description="Files with import fan-in but no commit-file evidence — no owner detected." />
          <div className="space-y-2 px-5 py-4">
            {unowned_hotspots.length === 0 ? (
              <p className="text-[0.875rem] text-faint">None detected.</p>
            ) : (
              <ul className="divide-y divide-line">
                {unowned_hotspots.map((path) => (
                  <li key={path} className="px-5 py-3">
                    <p className="font-mono text-[0.8125rem] text-muted truncate">{path}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {limitations.length > 0 && (
        <Card>
          <CardHeader title="Limitations" description="Stated explicitly so ownership is not over-read." />
          <ul className="space-y-2.5 px-5 py-4">
            {limitations.map((limitation) => (
              <li key={limitation} className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-muted">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                {limitation}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-[0.75rem] text-faint">
        Computed from commit-file evidence at {formatDateTime(bundle.data.repository.last_indexed_at)}.
      </p>
    </div>
  );
}
