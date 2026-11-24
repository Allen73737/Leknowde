import Link from "next/link";
import { ArrowRight, Clock, FileCode2, GitCommitHorizontal, Info, Server, ShieldCheck } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, MetricBand } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatDate, formatDateTime, formatNumber, languageColor } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { DependenciesResponse, HealthResponse, OverviewResponse } from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function RepositoryOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [bundle, overview, health, dependencies] = await Promise.all([
    getRepositoryBundle(id),
    safeGet<OverviewResponse>(`/repositories/${id}/overview`),
    safeGet<HealthResponse>(`/repositories/${id}/health`),
    safeGet<DependenciesResponse>(`/repositories/${id}/dependencies`),
  ]);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}`} />;
  }

  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  if (!overview.data) {
    return <ApiErrorNote error={overview.error} retryHref={`/app/repositories/${id}`} title="Overview unavailable" />;
  }

  const { repository, stats, branch, commits, endpoints } = overview.data;
  const languages = Object.entries(stats.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const maxLanguage = Math.max(1, ...languages.map(([, count]) => count));
  const summary = health.data?.summary;
  const scoreTone =
    summary && summary.score < 60 ? "text-danger" : summary && summary.score < 80 ? "text-warning" : "text-success";
  const fanIn = (dependencies.data?.summary.top_files ?? []).filter((file) => file.in_degree > 0).slice(0, 5);

  return (
    <div className="space-y-6">
      <MetricBand
        items={[
          {
            label: "Files",
            value: formatNumber(stats.files),
            hint: `${formatNumber(stats.lines)} source lines on ${branch}`,
          },
          {
            label: "Symbols",
            value: formatNumber(stats.symbols),
            hint: `${formatNumber(stats.functions)} functions · ${formatNumber(stats.classes)} classes`,
          },
          {
            label: "Graph",
            value: formatNumber(stats.edges),
            hint: `${formatNumber(stats.nodes)} nodes · ${formatNumber(stats.chunks)} evidence chunks`,
          },
          {
            label: "Health",
            value: summary ? `${summary.score}/100` : "—",
            hint: summary ? `${summary.findings} findings · grade ${summary.grade}` : "Health analysis unavailable",
            tone: summary && summary.score < 80 ? "warning" : "default",
          },
        ]}
      />

      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader
            title="Composition"
            description="Languages detected in the index."
            icon={<FileCode2 className="h-4 w-4" aria-hidden="true" />}
            action={<Badge>{branch}</Badge>}
          />
          <div className="space-y-3 px-5 py-4">
            {languages.length === 0 ? (
              <p className="text-[0.875rem] text-faint">No language metadata was recorded.</p>
            ) : (
              languages.slice(0, 6).map(([language, count]) => (
                <div key={language}>
                  <div className="mb-1 flex items-center justify-between text-[0.8125rem]">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: languageColor(language) }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{language}</span>
                    </span>
                    <span className="tabular shrink-0 text-[0.75rem] text-faint">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                    <div
                      className="bar-in h-full rounded-full"
                      style={{ width: `${(count / maxLanguage) * 100}%`, backgroundColor: languageColor(language) }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          {fanIn.length > 0 ? (
            <div className="mt-auto border-t border-line px-5 py-3">
              <p className="text-[0.75rem] font-medium text-faint">
                Most imported files
              </p>
              <ul className="mt-1.5">
                {fanIn.map((file) => (
                  <li key={file.path} className="flex items-baseline justify-between gap-3 py-1">
                    <Link
                      href={`/app/repositories/${id}/explorer?path=${encodeURIComponent(file.path)}`}
                      className="min-w-0 truncate font-mono text-[0.75rem] text-muted transition-colors hover:text-accent"
                    >
                      {file.path}
                    </Link>
                    <span className="tabular shrink-0 text-[0.75rem] text-faint">{file.in_degree}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Detected surface"
            description="Route declarations and client call sites."
            icon={<Server className="h-4 w-4" aria-hidden="true" />}
            action={<Badge>{stats.apis}</Badge>}
          />
          {endpoints.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              No HTTP endpoints were detected. This may be a library rather than a service.
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto">
              {endpoints.map((endpoint) => (
                <li
                  key={endpoint}
                  className="break-all px-5 py-2 font-mono text-[0.75rem] leading-relaxed text-muted transition-colors hover:bg-raised/30"
                >
                  {endpoint}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-auto border-t border-line px-5 py-2.5 text-[0.75rem] leading-relaxed text-faint">
            Resolved from declarations and client call sites. No traffic, latency or runtime behaviour is
            inferred.
          </p>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Health signals"
            description="Deductions from the latest deterministic scan."
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            action={summary ? <Badge>{summary.grade}</Badge> : null}
          />
          {summary ? (
            <>
              <div className="px-5 py-4">
                <Progress
                  value={summary.score}
                  tone={summary.score < 60 ? "danger" : summary.score < 80 ? "warning" : "success"}
                  label="Health score"
                />
                <p className={`tabular mt-2 font-mono text-[0.75rem] ${scoreTone}`}>
                  {summary.score} / 100 · {summary.findings} {summary.findings === 1 ? "finding" : "findings"}
                </p>
                {summary.penalties?.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {summary.penalties.slice(0, 3).map((penalty) => (
                      <li key={penalty.label} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                        <span className="min-w-0 truncate text-muted">{penalty.label.replace(/_/g, " ")}</span>
                        <span className="tabular shrink-0 font-mono text-[0.75rem] text-warning">
                          −{penalty.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[0.8125rem] text-faint">No deductions were recorded.</p>
                )}
              </div>
              <div className="mt-auto border-t border-line px-5 py-3">
                <p className="flex items-center gap-1.5 text-[0.75rem] text-faint">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {repository.last_indexed_at ? formatDateTime(repository.last_indexed_at) : "never indexed"}
                  </span>
                </p>
                <Link
                  href={`/app/repositories/${id}/health`}
                  className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-accent transition-colors hover:text-ink"
                >
                  Open health report
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </>
          ) : (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              Health analysis is unavailable for this repository.
            </p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Recent commits"
          description={
            repository.is_demo
              ? "Bundled fixtures. History is illustrative, not fetched from a live provider."
              : "Fetched from the connected provider for this branch."
          }
          icon={<GitCommitHorizontal className="h-4 w-4" aria-hidden="true" />}
        />
        {commits.length === 0 ? (
          <p className="px-5 py-10 text-center text-[0.875rem] text-faint">No commits were recorded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {commits.slice(0, 8).map((commit) => (
              <li
                key={commit.sha}
                className="grid gap-1.5 px-5 py-3.5 transition-colors duration-150 hover:bg-raised/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className="shrink-0 font-mono text-[0.75rem] text-faint">
                    {commit.sha.slice(0, 8)}
                  </span>
                  <span className="truncate text-[0.875rem] text-ink">{commit.message}</span>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <span className="truncate text-[0.8125rem] text-muted">{commit.author_name}</span>
                  <span className="tabular shrink-0 text-[0.75rem] text-faint">
                    {formatDate(commit.committed_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {repository.is_demo ? (
        <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-faint">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Demo dataset. Commit history and pull-request metadata are bundled fixtures, not live provider
            data. The source files themselves are real.
          </span>
        </p>
      ) : null}
    </div>
  );
}
