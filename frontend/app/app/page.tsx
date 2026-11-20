import Link from "next/link";
import { Activity, ArrowRight, Boxes, FileCode2, Plus, Server } from "lucide-react";

import { ApiErrorNote } from "@/components/app/error-note";
import { DemoConnectButton } from "@/components/repo/demo-connect-button";
import { StatusBadge } from "@/components/repo/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui/card";
import { getDashboard, getWorkspaces } from "@/lib/app-data";
import { formatNumber, plural, relativeTime } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { MeResponse, MetaResponse } from "@/lib/types";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [dashboardResult, workspacesResult, meResult, metaResult] = await Promise.all([
    getDashboard(),
    getWorkspaces(),
    safeGet<MeResponse>("/auth/me"),
    safeGet<MetaResponse>("/meta"),
  ]);

  const me = meResult.data;
  const firstName = me?.user.name.split(" ")[0] ?? "there";
  const workspaces = workspacesResult.data?.workspaces ?? [];
  const primaryWorkspace = workspaces[0];
  const meta = metaResult.data;
  const dashboard = dashboardResult.data;
  const stats = dashboard?.stats;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[0.75rem] font-medium uppercase tracking-[0.14em] text-faint">
            Workspace overview
          </p>
          <h1 className="mt-1.5 font-display text-[1.625rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[1.75rem]">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
            {stats
              ? `${plural(stats.workspaces, "workspace")} · ${formatNumber(stats.ready_repositories)} of ${formatNumber(stats.repositories)} repositories indexed${
                  stats.active_jobs > 0 ? ` · ${plural(stats.active_jobs, "job")} running` : ""
                }`
              : "Everything you can reach, with computed structure kept separate from generated judgment."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/app/workspaces" className={buttonStyles("secondary", "sm")}>
            <Boxes className="h-3.5 w-3.5" aria-hidden="true" /> Workspaces
          </Link>
          <Link href="/app/repositories" className={buttonStyles("primary", "sm")}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add repository
          </Link>
        </div>
      </div>

      {!dashboard ? (
        <ApiErrorNote error={dashboardResult.error} retryHref="/app" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Stat
              label="Repositories"
              value={formatNumber(dashboard.stats.repositories)}
              hint={`${formatNumber(dashboard.stats.ready_repositories)} indexed and ready`}
            />
            <Stat
              label="Indexed files"
              value={formatNumber(dashboard.stats.files)}
              hint={`Across ${plural(dashboard.stats.workspaces, "workspace")}`}
            />
            <Stat
              label="Symbols"
              value={formatNumber(dashboard.stats.symbols)}
              hint="Functions, classes and types"
            />
            <Stat
              label="Findings"
              value={formatNumber(dashboard.stats.findings)}
              hint={`${formatNumber(dashboard.stats.critical_findings)} high or critical`}
              tone={dashboard.stats.critical_findings > 0 ? "warning" : "default"}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title="Repositories"
              description={
                dashboard.stats.active_jobs > 0
                  ? `${plural(dashboard.stats.active_jobs, "job")} running now. Ordered by last update.`
                  : "Most recently updated first. Status reflects the latest indexing job."
              }
              action={
                <Link
                  href="/app/repositories"
                  className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-accent transition-colors hover:text-ink"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
            {dashboard.recent_repositories.length === 0 ? (
              <EmptyState
                icon={<FileCode2 className="h-5 w-5" aria-hidden="true" />}
                title="No repositories yet"
                description="Connect the bundled demo dataset to run the full ingest, parse, graph and impact pipeline without external credentials."
                action={
                  primaryWorkspace ? (
                    <DemoConnectButton workspaceID={primaryWorkspace.id} />
                  ) : (
                    <Link href="/app/workspaces" className={buttonStyles("primary", "sm")}>
                      Create a workspace
                    </Link>
                  )
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-4 py-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-faint">
                        Repository
                      </th>
                      <th className="px-4 py-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-faint">
                        Status
                      </th>
                      <th className="w-20 px-4 py-2 text-right font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-faint">
                        Files
                      </th>
                      <th className="w-24 px-4 py-2 text-right font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-faint">
                        Symbols
                      </th>
                      <th className="w-28 px-4 py-2 text-right font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-faint">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dashboard.recent_repositories.slice(0, 6).map((repo) => (
                      <tr key={repo.id} className="group transition-colors duration-150 hover:bg-raised/40">
                        <td className="px-4 py-2.5">
                          <Link href={`/app/repositories/${repo.id}`} className="block min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-mono text-[0.8125rem] font-medium text-ink transition-colors group-hover:text-accent">
                                {repo.full_name}
                              </span>
                              {repo.is_demo ? <Badge tone="warning">demo</Badge> : null}
                            </span>
                            <span className="mt-0.5 block truncate text-[0.75rem] text-faint">
                              {repo.language || "Unknown language"} · {plural(repo.file_count, "file")}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={repo.status} />
                        </td>
                        <td className="tabular px-4 py-2.5 text-right font-mono text-[0.8125rem] text-muted">
                          {formatNumber(repo.file_count)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right font-mono text-[0.8125rem] text-muted">
                          {formatNumber(repo.symbol_count)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[0.75rem] text-faint">
                          {relativeTime(repo.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card className="overflow-hidden">
              <CardHeader
                title="Activity"
                action={
                  <Link
                    href="/app/notifications"
                    className="text-[0.8125rem] font-semibold text-accent transition-colors hover:text-ink"
                  >
                    All
                  </Link>
                }
              />
              {dashboard.notifications.length === 0 ? (
                <p className="px-4 py-10 text-center text-[0.875rem] text-faint">
                  Nothing has happened yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {dashboard.notifications.slice(0, 5).map((notification) => (
                    <li key={notification.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[0.875rem] font-medium text-ink">
                            {notification.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted">
                            {notification.body}
                          </p>
                        </div>
                        {!notification.read ? (
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                            aria-label="Unread"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
                        {notification.kind.replace(/_/g, " ")} · {relativeTime(notification.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                title="Runtime"
                description="Reported by the running API and AI service."
                icon={<Server className="h-4 w-4" aria-hidden="true" />}
              />
              <dl className="divide-y divide-line text-[0.875rem]">
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                  <dt className="text-muted">Parser</dt>
                  <dd>
                    <Badge tone="accent">{meta?.parser ?? "unknown"}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                  <dt className="text-muted">LLM generation</dt>
                  <dd>
                    <Badge tone={meta?.llm?.configured ? "success" : "warning"}>
                      {meta?.llm?.configured ? "configured" : "not configured"}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                  <dt className="text-muted">Embeddings</dt>
                  <dd>
                    <Badge>{meta?.embeddings?.mode ?? "unknown"}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                  <dt className="text-muted">AI service</dt>
                  <dd>
                    <Badge tone={meta?.ai_service?.status === "unavailable" ? "danger" : "success"}>
                      {meta?.ai_service?.status ?? "reachable"}
                    </Badge>
                  </dd>
                </div>
              </dl>
              {!meta?.llm?.configured ? (
                <p className="border-t border-line px-4 py-2.5 text-[0.8125rem] leading-relaxed text-faint">
                  Answers stay extractive until a provider key is set. Graph, impact, health and
                  documentation fallbacks keep working.
                </p>
              ) : null}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
