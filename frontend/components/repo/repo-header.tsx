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
 * RepoHeader — a flat identity band, not a card.
 *
 * The previous version stacked four badges, a description, a demo disclaimer
 * and a progress readout above the tabs, which pushed the actual page below
 * the fold. Here the band keeps: name, state, one meta line, two actions, a
 * live job strip only while it matters, then the section tabs.
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
  const showPanel = visibleJob || Boolean(error);

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
    <div className="space-y-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/app/repositories"
            className="group inline-flex items-center gap-1.5 font-mono text-[0.75rem] uppercase tracking-[0.14em] text-faint transition-colors duration-200 hover:text-ink"
          >
            <ArrowLeft
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            All repositories
          </Link>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 truncate font-display text-[1.5rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[1.75rem]">
              {repository.full_name}
            </h1>
            <StatusBadge status={repository.status} />
            {repository.is_demo ? <Badge tone="warning">demo dataset</Badge> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.8125rem] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
              <span className="font-mono text-[0.75rem]">{repository.default_branch}</span>
            </span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-line sm:block" />
            <span className="tabular">{plural(stats.files, "file")}</span>
            <span className="tabular">{plural(stats.symbols, "symbol")}</span>
            <span className="tabular">{formatNumber(stats.edges)} edges</span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-line sm:block" />
            <span className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-faint">
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

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {repository.html_url ? (
            <a
              href={repository.html_url}
              target="_blank"
              rel="noreferrer noopener"
              className="press group inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[0.8125rem] font-medium text-muted transition-colors duration-200 hover:border-line-strong hover:text-ink"
            >
              Provider
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
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
            <RefreshCw className={`h-4 w-4 ${active ? "animate-spin" : ""}`} aria-hidden="true" />
            {active ? "Indexing…" : "Re-index"}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showPanel ? (
          <motion.div
            key="job-strip"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-line bg-shell/60 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                <span className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
                  {active ? (
                    <LogoLoader size={16} decorative />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
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
                  className="mt-2.5"
                  tone={job.status === "failed" ? "danger" : "accent"}
                  label="Indexing progress"
                />
              ) : null}
              {job?.error || error ? (
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-danger">
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
