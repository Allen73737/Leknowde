"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  FileDiff,
  GitPullRequest,
  ScanSearch,
} from "lucide-react";

import { LogoLoader } from "@/components/brand/logo-loader";
import { EvidencePanel } from "@/components/evidence/evidence-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { apiClient, apiPost } from "@/lib/client-api";
import { cn, formatDate, formatNumber, plural, riskTone } from "@/lib/format";
import type { PullRequest, PullRequestAnalysis, PullRequestsResponse } from "@/lib/types";

const stateFilters = ["open", "closed", "all"] as const;

export function PullRequestConsole({
  repositoryID,
  initial,
}: {
  repositoryID: string;
  initial: PullRequestsResponse;
}) {
  const [prs, setPrs] = useState(initial.pull_requests);
  const [state, setState] = useState<string>("open");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<PullRequestAnalysis | null>(null);
  const [selected, setSelected] = useState<PullRequest | null>(null);

  async function changeState(next: string) {
    if (next === state) return;
    setLoading(`state-${next}`);
    setError("");
    try {
      const result = await apiClient<PullRequestsResponse>(
        `/repositories/${repositoryID}/pull-requests?state=${encodeURIComponent(next)}`,
      );
      setPrs(result.pull_requests);
      setState(next);
      setAnalysis(null);
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load pull requests.");
    } finally {
      setLoading("");
    }
  }

  async function analyze(pr: PullRequest) {
    setLoading(`analyze-${pr.number}`);
    setError("");
    setAnalysis(null);
    setSelected(pr);
    try {
      const result = await apiPost<PullRequestAnalysis>(
        `/repositories/${repositoryID}/pull-requests/${pr.number}/analyze?number=${pr.number}`,
        {},
      );
      setAnalysis(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pull request analysis failed.");
    } finally {
      setLoading("");
    }
  }

  if (analysis) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAnalysis(null);
              setSelected(null);
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to pull requests
          </Button>
          <div className="flex items-center gap-2">
            <Badge>#{analysis.number}</Badge>
            {selected ? <Badge>{selected.author}</Badge> : null}
          </div>
        </div>

        <Card>
          <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="eyebrow">Pull request analysis</p>
              <h2 className="mt-1.5 font-display text-base font-semibold text-ink">{analysis.title}</h2>
              <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">{analysis.risk.rationale}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge>{plural(analysis.files.length, "file")}</Badge>
                <Badge>{analysis.modules.length} modules</Badge>
                <Badge>{formatNumber(analysis.impact.length)} dependent files</Badge>
                <Badge>{analysis.missing_tests.length} missing tests</Badge>
              </div>
            </div>
            <div className={cn("shrink-0 rounded-md border px-4 py-3 text-center", riskTone(analysis.risk.level))}>
              <p className="text-[0.75rem] opacity-80">Risk</p>
              <p className="mt-0.5 font-display text-3xl font-semibold">{analysis.risk.score}</p>
              <p className="text-[0.75rem]">{analysis.risk.level}</p>
            </div>
          </div>
          <p className="border-t border-line px-4 py-2.5 font-mono text-[0.75rem] text-faint">{analysis.risk.formula}</p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader
              title="Changed files"
              description="Diff metadata from the provider. Patch text is untrusted data."
              icon={<FileDiff className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="divide-y divide-line">
              {analysis.files.map((file) => (
                <li key={file.path} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate font-mono text-[0.75rem] text-ink">{file.path}</span>
                    <span className="font-mono text-[0.75rem] text-faint">
                      +{file.additions} −{file.deletions} · {file.status}
                    </span>
                  </div>
                  {file.patch ? (
                    <pre className="mt-2 max-h-40 overflow-auto rounded border border-line bg-shell px-2.5 py-2 font-mono text-[0.75rem] leading-relaxed text-muted">
                      <code>{file.patch}</code>
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Review recommendations"
                icon={<GitPullRequest className="h-4 w-4" aria-hidden="true" />}
              />
              <ul className="space-y-2 px-4 py-4">
                {analysis.review_recommendations.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
                    <CheckSquare className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader
                title="Risk factors"
                description="Same additive model as change impact."
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              />
              <ul className="divide-y divide-line">
                {analysis.risk.factors.map((factor) => (
                  <li key={factor.label} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.8125rem] text-ink">{factor.label}</span>
                      <Badge tone="warning">+{factor.weight}</Badge>
                    </div>
                    <p className="mt-0.5 text-[0.75rem] text-faint">{factor.evidence}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader title="Impact and tests" icon={<ScanSearch className="h-4 w-4" aria-hidden="true" />} />
            <div className="space-y-3 px-4 py-4">
              <div>
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Dependent files</p>
                <ul className="mt-1 space-y-1">
                  {analysis.impact.slice(0, 12).map((item) => (
                    <li key={item.path} className="truncate font-mono text-[0.75rem] text-muted">
                      {item.path} <span className="text-faint">· depth {item.depth}</span>
                    </li>
                  ))}
                  {analysis.impact.length === 0 ? <li className="text-[0.75rem] text-faint">None resolved.</li> : null}
                </ul>
              </div>
              <div>
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Missing tests</p>
                <ul className="mt-1 space-y-1">
                  {analysis.missing_tests.map((item) => (
                    <li key={item} className="truncate font-mono text-[0.75rem] text-warning">{item}</li>
                  ))}
                  {analysis.missing_tests.length === 0 ? <li className="text-[0.75rem] text-faint">No gaps detected.</li> : null}
                </ul>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Evidence and limits" />
            <div className="space-y-3 p-4">
              <EvidencePanel evidence={analysis.evidence} repositoryID={repositoryID} title="Diff evidence" />
              <ul className="space-y-1.5">
                {analysis.uncertainty.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          {stateFilters.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeState(value)}
              className={cn(
                "rounded px-2.5 py-1.5 text-[0.8125rem] capitalize transition-colors",
                state === value ? "bg-raised text-ink" : "text-muted hover:text-ink",
              )}
            >
              {value}
              {loading === `state-${value}` ? <LogoLoader size={14} decorative /> : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Badge>{initial.provider}</Badge>
          {initial.demo ? <Badge tone="warning">demo fixture metadata</Badge> : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[0.8125rem] text-danger">{error}</p>
      ) : null}

      {prs.length === 0 ? (
        <Card className="px-4 py-12 text-center">
          <GitPullRequest className="mx-auto h-5 w-5 text-faint" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink">No pull requests in this state</p>
          <p className="mt-1 text-[0.8125rem] text-muted">Switch the state filter or connect a provider with open pull requests.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {prs.map((pr) => (
            <Card key={pr.number}>
              <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>#{pr.number}</Badge>
                    <span className="truncate text-xs font-medium text-ink">{pr.title}</span>
                    <Badge tone={pr.state === "open" ? "success" : "neutral"}>{pr.state}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[0.75rem] text-faint">
                    {pr.author} · {pr.branch} → {pr.base} · +{pr.additions} −{pr.deletions} ·{" "}
                    {plural(pr.changed_files, "file")} · {formatDate(pr.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {pr.url ? (
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-8 items-center rounded-md border border-line bg-raised px-2.5 text-[0.8125rem] text-ink hover:border-faint"
                    >
                      Open
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={loading === `analyze-${pr.number}`}
                    onClick={() => analyze(pr)}
                  >
                    <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" /> Analyse
                  </Button>
                </div>
              </div>
              {pr.body ? (
                <p className="line-clamp-2 border-t border-line px-4 py-2 text-[0.75rem] leading-relaxed text-muted">{pr.body}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
