"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  GitBranch,
  RefreshCw,
} from "lucide-react";

import { LogoLoader } from "@/components/brand/logo-loader";
import { RepoNav } from "@/components/repo/repo-nav";
import { StatusBadge } from "@/components/repo/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiClient, apiPost } from "@/lib/client-api";
import { formatNumber, plural, relativeTime } from "@/lib/format";
import type { Job, RepoStats, Repository } from "@/lib/types";

/**
 * RepoHeader — a compact identity band, not a card.
 *
 * One line of identity, one line of facts, one live job strip only while it
 * matters, then the section tabs. No decorative badges competing for weight.
 */
export function RepoHeader({
  repository,
  stats,
  latestJob,
}: {
  repository: Repository;
  stats: RepoStats;
  latestJob?: Job;
}) {
  const router = useRouter();
  const reduce = useReducedMotionSafe();
  const [job, setJob] = useState<Job | undefined>(latestJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = Boolean(job && ["queued", "running"].includes(job.status));
  const visibleJob = Boolean(job && (active || job.status === "failed"));

  useEffect(() => {
    if (!active || !job) return;
    let cancelled = false;

    async function poll() {
      try {
        const next = await apiClient<Job>(`/jobs/${job!.id}`);
        if (cancelled) return;
        setJob(next);
        if (next.status === "completed") {
          router.refresh();
        } else if (next.status === "failed") {
          setError(next.error || "Indexing failed.");
        } else {
          timer.current = setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) timer.current = setTimeout(poll, 3000);
      }
    }

    timer.current = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, job, router]);

  async function reindex() {
    setBusy(true);
    setError("");
    try {
      const result = await apiPost<{ job: Job }>(`/repositories/${repository.id}/index`, {});
      setJob(result.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not queue indexing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/app/repositories"
            className="group inline-flex items-center gap-1.5 text-[0.75rem] text-faint transition-colors duration-150 hover:text-ink"
          >
            <ArrowLeft
              className="h-3 w-3 transition-transform duration-150 group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            Repositories
            <span className="text-line-strong">/</span>
            <span className="font-mono text-[0.75rem] text-muted">{repository.owner}</span>
          </Link>

          <div className="mt-2 flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[7px] border border-line bg-surface text-faint shadow-card"
            >
              <GitBranch className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h1 className="min-w-0 truncate font-display text-[1.5rem] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[1.75rem]">
                  {repository.full_name}
                </h1>
                <StatusBadge status={repository.status} />
                {repository.is_demo ? <Badge tone="warning">demo dataset</Badge> : null}
                {repository.visibility === "private" ? <Badge>private</Badge> : null}
              </div>

              {repository.description ? (
                <p className="mt-1 line-clamp-1 max-w-3xl text-[0.8125rem] leading-relaxed text-muted">
                  {repository.description}
                </p>
              ) : null}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-muted">
                <span className="inline-flex items-center gap-1 rounded-[4px] border border-line bg-shell px-1.5 py-0.5 font-mono text-[0.75rem] leading-none text-ink">
                  <GitBranch className="h-2.5 w-2.5 text-faint" aria-hidden="true" />
                  {repository.default_branch}
                </span>
                <span className="tabular">{plural(stats.files, "file")}</span>
                <span className="text-line-strong" aria-hidden="true">
                  /
                </span>
                <span className="tabular">{plural(stats.symbols, "symbol")}</span>
                <span className="text-line-strong" aria-hidden="true">
                  /
                </span>
                <span className="tabular">{formatNumber(stats.edges)} edges</span>
                <span className="text-line-strong" aria-hidden="true">
                  /
                </span>
                <span className="font-mono text-[0.75rem] text-faint">
                  {repository.provider}
                  {repository.parser_mode ? ` · ${repository.parser_mode}` : ""}
                </span>
                <span className="text-faint">
                  {repository.last_indexed_at
                    ? `indexed ${relativeTime(repository.last_indexed_at)}`
                    : "never indexed"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {repository.html_url ? (
            <a
              href={repository.html_url}
              target="_blank"
              rel="noreferrer noopener"
              className="press inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-line px-2.5 text-[0.8125rem] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              Provider
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={reindex}
            loading={busy}
            disabled={active || busy}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${active ? "animate-spin" : ""}`} aria-hidden="true" />
            {active ? "Indexing…" : "Re-index"}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {visibleJob || error ? (
          <motion.div
            key="job-strip"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-[7px] border border-line bg-shell px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
                  {active ? (
                    <LogoLoader size={14} decorative />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
                  )}
                  <span className="font-medium text-ink">Indexing</span>
                  <span className="truncate text-muted">
                    {job?.current_step || (active ? "Queued" : "Failed")}
                  </span>
                </span>
                <span className="tabular shrink-0 font-mono text-[0.75rem] text-faint">
                  {job
                    ? `${job.files_processed}/${job.files_total} files · ${job.progress}%`
                    : "request failed"}
                </span>
              </div>
              {job ? (
                <Progress
                  value={job.progress}
                  className="mt-2"
                  tone={job.status === "failed" ? "danger" : "accent"}
                  label="Indexing progress"
                />
              ) : null}
              {job?.error || error ? (
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-danger">
                  {job?.error || error}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <RepoNav repositoryID={repository.id} />
    </div>
  );
}
