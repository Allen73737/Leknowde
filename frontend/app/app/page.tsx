import Link from "next/link";
import { ArrowRight, Boxes, ChevronRight, FileCode2, Plus, Server } from "lucide-react";

import { ApiErrorNote } from "@/components/app/error-note";
import { DemoConnectButton } from "@/components/repo/demo-connect-button";
import { StatusBadge } from "@/components/repo/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, MetricBand, SectionHeading } from "@/components/ui/card";
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
    <div className="space-y-7">
      <SectionHeading
        title={`Welcome back, ${firstName}`}
        description={
          stats
            ? `${plural(stats.workspaces, "workspace")} · ${formatNumber(stats.ready_repositories)} of ${formatNumber(stats.repositories)} repositories indexed${
                stats.active_jobs > 0 ? ` · ${plural(stats.active_jobs, "job")} running` : ""
              }`
            : "Everything you can reach, with computed structure kept separate from generated judgment."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/app/workspaces" className={buttonStyles("ghost", "sm")}>
              <Boxes className="h-3.5 w-3.5" aria-hidden="true" /> Workspaces
            </Link>
            <Link href="/app/repositories" className={buttonStyles("primary", "sm")}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add repository
            </Link>
          </div>
        }
      />

      {!dashboard ? (
        <ApiErrorNote error={dashboardResult.error} retryHref="/app" />
      ) : (
        <>
          <MetricBand
            items={[
              {
                label: "Repositories",
                value: formatNumber(dashboard.stats.repositories),
                hint: `${formatNumber(dashboard.stats.ready_repositories)} indexed and ready`,
              },
              {
                label: "Indexed files",
                value: formatNumber(dashboard.stats.files),
                hint: `Across ${plural(dashboard.stats.workspaces, "workspace")}`,
              },
              {
                label: "Symbols",
                value: formatNumber(dashboard.stats.symbols),
                hint: "Functions, classes and types",
              },
              {
                label: "Findings",
                value: formatNumber(dashboard.stats.findings),
                hint: `${formatNumber(dashboard.stats.critical_findings)} high or critical`,
                tone: dashboard.stats.critical_findings > 0 ? "warning" : "default",
              },
            ]}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
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
                <ul className="divide-y divide-line">
                  {dashboard.recent_repositories.slice(0, 6).map((repo) => (
                    <li key={repo.id}>
                      <Link
                        href={`/app/repositories/${repo.id}`}
                        className="group grid gap-3 px-5 py-4 transition-colors duration-150 hover:bg-raised/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-mono text-[0.875rem] font-medium text-ink transition-colors group-hover:text-accent">
                              {repo.full_name}
                            </span>
                            {repo.is_demo ? <Badge tone="warning">demo</Badge> : null}
                          </div>
                          <p className="mt-1 line-clamp-1 text-[0.8125rem] leading-relaxed text-muted">
                            {repo.description || `${repo.language || "Unknown language"} repository`}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 sm:justify-end">
                          <div className="hidden text-right sm:block">
                            <p className="tabular text-[0.8125rem] text-ink">
                              {plural(repo.file_count, "file")} · {plural(repo.symbol_count, "symbol")}
                            </p>
                            <p className="mt-0.5 text-[0.75rem] text-faint">
                              Updated {relativeTime(repo.updated_at)}
                            </p>
                          </div>
                          <StatusBadge status={repo.status} />
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
                            aria-hidden="true"
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                title="Activity"
                description="Platform events, not model output."
                action={
                  <Link
                    href="/app/notifications"
                    className="text-[0.8125rem] font-semibold text-accent transition-colors hover:text-ink"
                  >
                    View all
                  </Link>
                }
              />
              {dashboard.notifications.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-[0.875rem] text-faint">Nothing has happened yet.</p>
                  <p className="mt-1 text-[0.8125rem] text-faint">
                    Indexing results and membership changes appear here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {dashboard.notifications.slice(0, 5).map((notification) => (
                    <li key={notification.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[0.875rem] font-medium text-ink">
                            {notification.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted">
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
                      <p className="mt-2 text-[0.75rem] text-faint">
                        {notification.kind.replace(/_/g, " ")} · {relativeTime(notification.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-shell text-faint">
                  <Server className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[0.8125rem] font-medium text-ink">Runtime</p>
                  <p className="text-[0.75rem] text-faint">
                    Reported by the running API and AI service.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-faint">
                  Parser
                  <Badge tone="accent">{meta?.parser || "not reported"}</Badge>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-faint">
                  LLM
                  <Badge tone={meta?.llm?.configured ? "success" : "warning"}>
                    {meta?.llm?.configured ? "configured" : "not configured"}
                  </Badge>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-faint">
                  Embeddings
                  <Badge>{meta?.embeddings?.mode || "not reported"}</Badge>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-faint">
                  AI service
                  <Badge tone={meta?.ai_service?.status === "unavailable" ? "danger" : meta ? "success" : "neutral"}>
                    {meta?.ai_service?.status ?? "not reported"}
                  </Badge>
                </span>
              </div>
            </div>
            {!meta?.llm?.configured ? (
              <p className="border-t border-line px-5 py-2.5 text-[0.8125rem] leading-relaxed text-faint">
                Answers stay extractive until a provider key is set. Graph, impact, health and
                documentation fallbacks keep working.
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
