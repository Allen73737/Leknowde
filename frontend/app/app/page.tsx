import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ChevronRight,
  FileCode2,
  Plus,
  Server,
} from "lucide-react";

import { ApiErrorNote } from "@/components/app/error-note";
import { DemoConnectButton } from "@/components/repo/demo-connect-button";
import { StatusBadge } from "@/components/repo/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  EmptyState,
  MetricBand,
  SectionHeading,
} from "@/components/ui/card";
import { getDashboard, getWorkspaces } from "@/lib/app-data";
import { formatNumber, initials, languageColor, plural, relativeTime } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { MeResponse, MetaResponse } from "@/lib/types";

export const metadata = { title: "Dashboard" };

const repoGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1fr)_4rem_6.5rem_6.5rem] 2xl:grid-cols-[minmax(0,1fr)_4rem_5.5rem_6.5rem_6.5rem]";

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
  const workspaceName = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
  const aiOnline = Boolean(meta?.ai_service?.status && meta.ai_service.status !== "unavailable");

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Control room"
        title={`Welcome back, ${firstName}`}
        description={
          stats
            ? `${plural(stats.ready_repositories, "repository", "repositories")} indexed and ready across ${plural(stats.workspaces, "workspace")}. Structure, risk and activity in one place.`
            : "Everything you can reach, with computed structure kept separate from generated judgment."
        }
        meta={
          stats
            ? [
                { label: "Workspaces", value: String(stats.workspaces).padStart(2, "0") },
                { label: "Repositories", value: String(stats.repositories).padStart(2, "0") },
                { label: "Symbols", value: formatNumber(stats.symbols) },
                { label: "Active jobs", value: String(stats.active_jobs).padStart(2, "0") },
              ]
            : undefined
        }
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/app/workspaces" className={buttonStyles("outline", "sm")}>
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

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <Card className="overflow-hidden">
              <CardHeader
                title="Repository index"
                description="Most recently updated first. Status reflects the latest indexing job."
                meta={<Badge mono>{String(dashboard.recent_repositories.length).padStart(2, "0")}</Badge>}
                action={
                  <Link
                    href="/app/repositories"
                    className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted transition-colors hover:text-ink"
                  >
                    View all
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                }
              />
              {dashboard.recent_repositories.length === 0 ? (
                <EmptyState
                  icon={<FileCode2 className="h-4 w-4" aria-hidden="true" />}
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
                <>
                  <div
                    className={`hidden border-b border-line bg-shell/50 px-4 py-2 lg:grid ${repoGrid}`}
                    aria-hidden="true"
                  >
                    <span className="meta-label">Repository</span>
                    <span className="meta-label text-right">Files</span>
                    <span className="meta-label hidden text-right 2xl:block">Symbols</span>
                    <span className="meta-label">Updated</span>
                    <span className="meta-label">Status</span>
                  </div>
                  <ul className="divide-y divide-line/70">
                    {dashboard.recent_repositories.slice(0, 6).map((repo) => (
                      <li key={repo.id}>
                        <Link
                          href={`/app/repositories/${repo.id}`}
                          className={`group ${repoGrid} px-4 py-3 transition-colors duration-150 hover:bg-raised/40`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              aria-hidden="true"
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-[5px] border border-line bg-shell text-[0.75rem] font-semibold text-faint"
                            >
                              {initials(repo.name)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-mono text-[0.8125rem] font-medium text-ink transition-colors group-hover:text-accent">
                                  {repo.full_name}
                                </span>
                                {repo.is_demo ? <Badge tone="warning">demo</Badge> : null}
                              </div>
                              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.75rem] text-faint">
                                <span className="shrink-0">
                                  {workspaceName.get(repo.workspace_id) ?? "Workspace"}
                                </span>
                                <span aria-hidden="true" className="shrink-0 text-line-strong">·</span>
                                <span
                                  aria-hidden="true"
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: languageColor(repo.language) }}
                                />
                                <span className="shrink-0">{repo.language || "unknown"}</span>
                              </p>
                            </div>
                          </div>

                          <span className="tabular hidden text-right font-mono text-[0.75rem] text-muted lg:block">
                            {formatNumber(repo.file_count)}
                          </span>

                          <span className="tabular hidden text-right font-mono text-[0.75rem] text-faint 2xl:block">
                            {formatNumber(repo.symbol_count)}
                          </span>

                          <span className="hidden text-[0.75rem] text-faint lg:block">
                            {relativeTime(repo.updated_at)}
                          </span>

                          <span className="flex items-center justify-end gap-2">
                            <span className="hidden sm:block">
                              <StatusBadge status={repo.status} />
                            </span>
                            <ChevronRight
                              className="h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted"
                              aria-hidden="true"
                            />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

              <Card className="overflow-hidden">
                <CardHeader
                  title="Workspaces"
                  description="Access boundaries, repository counts and membership."
                  action={
                    <Link
                      href="/app/workspaces"
                      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-muted transition-colors hover:text-ink"
                    >
                      Manage
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  }
                />
                {workspaces.length === 0 ? (
                  <EmptyState
                    icon={<Server className="h-4 w-4" aria-hidden="true" />}
                    title="No workspace"
                    description="Create a workspace to define repository access, members and audit scope."
                    action={
                      <Link href="/app/workspaces" className={buttonStyles("primary", "sm")}>
                        Create workspace
                      </Link>
                    }
                    className="py-9"
                  />
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-px bg-line">
                    {workspaces.slice(0, 4).map((workspace) => (
                      <Link
                        key={workspace.id}
                        href={`/app/repositories?workspace=${workspace.id}`}
                        className="group flex min-w-0 flex-col gap-2 bg-surface px-4 py-3 transition-colors duration-150 hover:bg-raised/40 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-[5px] border border-line bg-shell font-mono text-[0.75rem] font-semibold text-faint"
                          >
                            {initials(workspace.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[0.875rem] font-medium text-ink transition-colors group-hover:text-accent">
                              {workspace.name}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[0.75rem] text-faint">
                              {workspace.slug}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pl-[2.125rem] text-[0.75rem] text-muted sm:pl-0">
                          <span className="tabular whitespace-nowrap">
                            {plural(workspace.repository_count, "repository", "repositories")}
                          </span>
                          <span aria-hidden="true" className="text-line-strong">·</span>
                          <span className="tabular whitespace-nowrap">
                            {plural(workspace.member_count, "member")}
                          </span>
                          <Badge tone={workspace.role === "owner" ? "accent" : "neutral"}>
                            {workspace.role}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <Card className="flex flex-col overflow-hidden">
                <CardHeader
                  title="Activity"
                  description="Platform events, not model output."
                  meta={
                    dashboard.notifications.length > 0 ? (
                      <Badge mono>{String(dashboard.notifications.length).padStart(2, "0")}</Badge>
                    ) : undefined
                  }
                  action={
                    <Link
                      href="/app/notifications"
                      className="text-[0.8125rem] font-medium text-muted transition-colors hover:text-ink"
                    >
                      View all
                    </Link>
                  }
                />
                {dashboard.notifications.length === 0 ? (
                  <div className="px-4 py-9 text-center">
                    <p className="text-[0.8125rem] text-faint">Nothing has happened yet.</p>
                    <p className="mt-1 text-[0.75rem] leading-relaxed text-faint">
                      Indexing results and membership changes appear here.
                    </p>
                  </div>
                ) : (
                  <ul className="px-4 py-1">
                    {dashboard.notifications.slice(0, 4).map((notification, index, list) => (
                      <li key={notification.id} className="relative flex gap-3 py-2.5">
                        {index < list.length - 1 ? (
                          <span
                            aria-hidden="true"
                            className="absolute left-[3px] top-5 h-full w-px bg-line"
                          />
                        ) : null}
                        <span
                          aria-hidden="true"
                          className={`relative mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full border ${
                            notification.read
                              ? "border-line-strong bg-surface"
                              : "border-accent bg-accent"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[0.8125rem] font-medium text-ink">
                              {notification.title}
                            </p>
                            <span className="shrink-0 font-mono text-[0.75rem] text-faint">
                              {relativeTime(notification.created_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[0.75rem] leading-relaxed text-muted">
                            {notification.body}
                          </p>
                          <p className="mt-1 font-mono text-[0.75rem] text-faint">
                            {notification.kind.replace(/_/g, " ")}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="overflow-hidden">
                <CardHeader
                  title="Runtime"
                  description="Reported by the running API and AI service."
                  meta={
                    <span className="inline-flex items-center gap-1.5 font-mono text-[0.75rem] text-faint">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${aiOnline ? "bg-success" : "bg-warning"}`}
                      />
                      {aiOnline ? "linked" : "offline"}
                    </span>
                  }
                />
                <dl className="divide-y divide-line/70">
                  {[
                    {
                      label: "Parser",
                      value: <Badge mono>{meta?.parser || "not reported"}</Badge>,
                    },
                    {
                      label: "LLM",
                      value: (
                        <Badge tone={meta?.llm?.configured ? "success" : "warning"}>
                          {meta?.llm?.configured ? "configured" : "not configured"}
                        </Badge>
                      ),
                    },
                    {
                      label: "Embeddings",
                      value: <Badge mono>{meta?.embeddings?.mode || "not reported"}</Badge>,
                    },
                    {
                      label: "AI service",
                      value: (
                        <Badge
                          tone={
                            meta?.ai_service?.status === "unavailable"
                              ? "danger"
                              : meta
                                ? "success"
                                : "neutral"
                          }
                        >
                          {meta?.ai_service?.status ?? "not reported"}
                        </Badge>
                      ),
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2">
                      <dt className="text-[0.8125rem] text-muted">{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
                {!meta?.llm?.configured ? (
                  <p className="border-t border-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-faint">
                    Answers stay extractive until a provider key is set. Graph, impact, health and
                    documentation fallbacks keep working.
                  </p>
                ) : null}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
