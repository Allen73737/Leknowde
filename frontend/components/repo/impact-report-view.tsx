import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Braces,
  CheckSquare,
  Database,
  FileCode2,
  GitCommitHorizontal,
  ListOrdered,
  RotateCcw,
  Server,
  ShieldAlert,
  TestTube2,
} from "lucide-react";

import { EvidencePanel } from "@/components/evidence/evidence-panel";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn, formatDate, formatNumber, riskTone } from "@/lib/format";
import type { ImpactAnalysis } from "@/lib/types";

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function ImpactReportView({
  analysis,
  repositoryID,
}: {
  analysis: ImpactAnalysis;
  repositoryID: string;
}) {
  const narrative = analysis.ai_narrative ?? {};
  const narrativeSummary = asString(narrative.summary);
  const narrativePlan = asStrings(narrative.implementation_plan);
  const narrativeTests = asStrings(narrative.test_recommendations);
  const narrativeRollback = asStrings(narrative.rollback_considerations);
  const narrativeDocs = asStrings(narrative.documentation_updates);
  const narrativeUncertainty = asStrings(narrative.uncertainty);
  const narrativeGenerated = analysis.ai_narrative_status === "generated";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Deterministic analysis</p>
            <h2 className="mt-1.5 font-display text-base font-semibold text-ink">{analysis.request}</h2>
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">{analysis.risk.rationale}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge>{analysis.strategy}</Badge>
              <Badge>{analysis.parser || "parser unknown"}</Badge>
              <Badge>{formatNumber(analysis.affected_files.length)} affected files</Badge>
              <Badge>{formatNumber(analysis.seeds.length)} seeds</Badge>
            </div>
          </div>
          <div className={cn("shrink-0 rounded-md border px-4 py-3 text-center", riskTone(analysis.risk.level))}>
            <p className="font-mono text-[0.75rem] uppercase tracking-[0.14em] opacity-80">Risk</p>
            <p className="mt-0.5 font-display text-3xl font-semibold">{analysis.risk.score}</p>
            <p className="font-mono text-[0.75rem] uppercase tracking-[0.12em]">{analysis.risk.level}</p>
          </div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <p className="font-mono text-[0.75rem] leading-relaxed text-faint">{analysis.risk.formula}</p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="Risk factors"
            description="Additive weights. Nothing is hidden behind an opaque model score."
            icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
            action={<Badge tone={analysis.risk.level === "low" ? "success" : "warning"}>{analysis.risk.level}</Badge>}
          />
          {analysis.risk.factors.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-faint">No risk factors were triggered.</p>
          ) : (
            <ul className="divide-y divide-line">
              {analysis.risk.factors.map((factor) => (
                <li key={factor.label} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-ink">{factor.label}</p>
                    <Badge tone="warning">+{factor.weight}</Badge>
                  </div>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{factor.evidence}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Blast radius"
            description="Files reached through reverse dependency traversal, with depth from the seeds."
            icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            action={<Badge>{analysis.affected_files.length}</Badge>}
          />
          {analysis.affected_files.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-faint">No dependent files were resolved.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {analysis.affected_files.map((file) => (
                <li key={file.path} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link
                    href={`/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(file.path)}`}
                    className="min-w-0 truncate font-mono text-[0.75rem] text-ink hover:text-accent"
                  >
                    {file.path}
                  </Link>
                  <span className="shrink-0 font-mono text-[0.75rem] text-faint">
                    depth {file.depth} · {file.relation}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Seeds"
            description="The symbols and files matched from the change request."
            icon={<Braces className="h-4 w-4" aria-hidden="true" />}
          />
          {analysis.seeds.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-faint">
              No seeds matched. The request may be too abstract or reference behaviour not present in indexed source.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {analysis.seeds.map((seed) => (
                <li key={seed.key} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[0.75rem] text-ink">{seed.label}</span>
                    <Badge>{seed.kind}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[0.75rem] text-faint">
                    {seed.file_path} · {seed.why}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Affected contracts"
            description="APIs, entities and services reached by the change."
            icon={<Server className="h-4 w-4" aria-hidden="true" />}
          />
          <div className="space-y-3 px-4 py-4">
            {[
              { label: "APIs", items: analysis.affected_apis, icon: Server },
              { label: "Entities", items: analysis.affected_entities, icon: Database },
              { label: "Services", items: analysis.affected_services, icon: Braces },
            ].map((group) => (
              <div key={group.label}>
                <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">
                  <group.icon className="h-3 w-3" aria-hidden="true" /> {group.label}
                </p>
                {group.items.length === 0 ? (
                  <p className="mt-1 text-[0.75rem] text-faint">None detected.</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {group.items.map((item) => (
                      <Badge key={item} tone="accent">
                        {item}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="Tests"
            description="Existing tests that import affected files, plus recommended coverage."
            icon={<TestTube2 className="h-4 w-4" aria-hidden="true" />}
          />
          <div className="space-y-3 px-4 py-4">
            <div>
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Existing tests</p>
              {analysis.existing_tests.length === 0 ? (
                <p className="mt-1 text-[0.75rem] text-warning">No indexed test imports the affected modules.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {analysis.existing_tests.map((test) => (
                    <li key={test} className="font-mono text-[0.75rem] text-muted">{test}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Recommended tests</p>
              <ul className="mt-1 space-y-1">
                {analysis.recommended_tests.map((test) => (
                  <li key={test} className="flex items-start gap-1.5 text-[0.75rem] leading-relaxed text-muted">
                    <CheckSquare className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                    {test}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Execution plan"
            description="A deterministic sequence derived from graph order."
            icon={<ListOrdered className="h-4 w-4" aria-hidden="true" />}
          />
          <ol className="divide-y divide-line">
            {analysis.implementation_sequence.map((step, index) => (
              <li key={`${step}-${index}`} className="flex gap-3 px-4 py-2.5">
                <span className="font-mono text-[0.75rem] text-faint">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-[0.8125rem] leading-relaxed text-muted">{step}</span>
              </li>
            ))}
          </ol>
          <div className="border-t border-line px-4 py-3">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">
              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Rollback
            </p>
            <ul className="mt-1.5 space-y-1">
              {analysis.rollback_considerations.map((item) => (
                <li key={item} className="text-[0.75rem] leading-relaxed text-muted">{item}</li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader
            title="Test plan and documentation"
            icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
          />
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <div>
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Test plan</p>
              <ul className="mt-1.5 space-y-1">
                {analysis.test_plan.map((item) => (
                  <li key={item} className="text-[0.75rem] leading-relaxed text-muted">• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Documentation updates</p>
              <ul className="mt-1.5 space-y-1">
                {analysis.documentation_updates.map((item) => (
                  <li key={item} className="text-[0.75rem] leading-relaxed text-muted">• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Uncertainty"
            description="What this analysis cannot see."
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          />
          <ul className="space-y-2 px-4 py-4">
            {analysis.uncertainty.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {narrativeGenerated ? (
        <Card>
          <CardHeader
            title="Model narrative"
            description="Additive prose generated from the deterministic payload. It does not change the score or the facts."
            icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
            action={<Badge tone="accent">{asString(narrative.provider) || "model"}</Badge>}
          />
          <div className="space-y-3 px-4 py-4">
            {narrativeSummary ? <p className="text-xs leading-relaxed text-muted">{narrativeSummary}</p> : null}
            {narrativePlan.length > 0 ? (
              <div>
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Suggested sequence</p>
                <ol className="mt-1 space-y-1">
                  {narrativePlan.map((item, index) => (
                    <li key={`${item}-${index}`} className="text-[0.75rem] leading-relaxed text-muted">
                      {index + 1}. {item}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Tests", items: narrativeTests },
                { label: "Rollback", items: narrativeRollback },
                { label: "Docs", items: narrativeDocs },
                { label: "Uncertainty", items: narrativeUncertainty },
              ].map((group) => (
                <div key={group.label}>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">{group.label}</p>
                  {group.items.length === 0 ? (
                    <p className="mt-1 text-[0.75rem] text-faint">Not supplied.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {group.items.map((item, index) => (
                        <li key={`${item}-${index}`} className="text-[0.75rem] leading-relaxed text-muted">• {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <p className="rounded-md border border-line bg-shell px-4 py-3 text-[0.75rem] leading-relaxed text-faint">
          Model narrative status: {analysis.ai_narrative_status || "unavailable"}. The deterministic report above is
          complete without it. Configure an AI provider to add prose, not to compute the analysis.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Evidence"
            description="Citations used to derive seeds and reachability."
            icon={<FileCode2 className="h-4 w-4" aria-hidden="true" />}
          />
          <div className="p-4">
            <EvidencePanel evidence={analysis.evidence} repositoryID={repositoryID} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Recent history"
            description="Commits near the affected area. Demo history is a labelled fixture."
            icon={<GitCommitHorizontal className="h-4 w-4" aria-hidden="true" />}
          />
          {analysis.recent_commits.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-faint">No recent commits.</p>
          ) : (
            <ul className="divide-y divide-line">
              {analysis.recent_commits.slice(0, 8).map((commit) => (
                <li key={commit.sha} className="px-4 py-2.5">
                  <p className="truncate text-[0.8125rem] text-ink">{commit.message}</p>
                  <p className="mt-0.5 font-mono text-[0.75rem] text-faint">
                    {commit.sha.slice(0, 8)} · {formatDate(commit.committed_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {analysis.graph.nodes.length > 0 ? (
        <div>
          <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-faint">Impact subgraph</p>
          <GraphCanvas graph={analysis.graph} height={420} repositoryID={repositoryID} />
        </div>
      ) : null}
    </div>
  );
}
