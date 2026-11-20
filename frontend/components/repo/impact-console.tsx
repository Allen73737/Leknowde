"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Radar, ScanSearch } from "lucide-react";

import { LogoLoader } from "@/components/brand/logo-loader";
import { ImpactReportView } from "@/components/repo/impact-report-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { apiClient, apiPost } from "@/lib/client-api";
import { formatDate, riskTone } from "@/lib/format";
import type {
  CreateImpactResponse,
  ImpactAnalysis,
  ImpactDetailResponse,
  ImpactReport,
} from "@/lib/types";

export function ImpactConsole({
  repositoryID,
  initialReports,
}: {
  repositoryID: string;
  initialReports: ImpactReport[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [request, setRequest] = useState("");
  const [analysis, setAnalysis] = useState<ImpactAnalysis | null>(null);
  const [selected, setSelected] = useState<ImpactReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (request.trim().length < 6) {
      setError("Describe the proposed change in a few more words.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiPost<CreateImpactResponse>(`/repositories/${repositoryID}/impact`, {
        request: request.trim(),
      });
      setAnalysis(result.analysis);
      setSelected(result.report);
      setReports((current) => [result.report, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impact analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function open(report: ImpactReport) {
    setBusy(true);
    setError("");
    try {
      const result = await apiClient<ImpactDetailResponse>(`/impact/${report.id}`);
      setAnalysis(result.analysis);
      setSelected(result.report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={create} className="p-5">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">Describe a proposed change</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
            Analysis matches symbols and files, traverses reverse dependencies, finds correlated tests and scores risk
            with exposed weights. It does not run code or predict runtime behaviour.
          </p>
          <Textarea
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Example: change refresh-token rotation to revoke the entire token family when replay is detected."
            className="mt-3 min-h-[84px]"
            maxLength={600}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.75rem] text-faint">{request.trim().length}/600 characters · minimum 6</p>
            <Button type="submit" loading={busy} disabled={request.trim().length < 6 || busy}>
              <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" /> Analyse impact
            </Button>
          </div>
          {error ? <p className="mt-3 text-[0.8125rem] text-danger">{error}</p> : null}
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-faint">Saved reports</p>
          <Badge>{reports.length}</Badge>
        </div>
        {reports.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-faint">
            No analyses yet. Each run is persisted and can be reopened.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {reports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => open(report)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-raised/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.8125rem] text-ink">{report.title}</span>
                    <span className="mt-0.5 block font-mono text-[0.75rem] text-faint">
                      {formatDate(report.created_at)} · {report.confidence}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[0.75rem] ${riskTone(report.risk_level)}`}>
                      {report.risk_level}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {busy && !analysis ? (
        <div className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface px-4 py-10 text-[0.8125rem] text-faint">
          <LogoLoader size={18} decorative /> Loading analysis…
        </div>
      ) : null}

      {analysis && selected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="accent">report</Badge>
              <p className="truncate font-mono text-[0.75rem] text-faint">{selected.id}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAnalysis(null);
                setSelected(null);
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Close report
            </Button>
          </div>
          <ImpactReportView analysis={analysis} repositoryID={repositoryID} />
        </div>
      ) : null}
    </div>
  );
}
