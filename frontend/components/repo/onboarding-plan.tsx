"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  FileCode2,
  HelpCircle,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, formatNumber, plural } from "@/lib/format";
import type { OnboardingResponse } from "@/lib/types";

export function OnboardingPlan({
  repositoryID,
  plan,
}: {
  repositoryID: string;
  plan: OnboardingResponse;
}) {
  const storageKey = `lk-onboarding-${repositoryID}`;
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setCompleted(new Set(JSON.parse(raw) as number[]));
    } catch {
      // Local progress is a convenience; the server plan is the source of truth.
    }
    setLoaded(true);
  }, [storageKey]);

  function toggle(order: number) {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Storage may be unavailable in private contexts.
      }
      return next;
    });
  }

  function reset() {
    setCompleted(new Set());
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures.
    }
  }

  const progress = plan.steps.length > 0 ? (completed.size / plan.steps.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-ink">Guided reading path</h2>
              <Badge>{plural(plan.steps.length, "step")}</Badge>
              <Badge tone="accent">~{plan.estimated_hours}h</Badge>
            </div>
            <p className="mt-1 text-[0.8125rem] text-muted">
              Progress is stored in this browser only. It is not written to the repository or shared with teammates.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40">
              <Progress value={progress} tone={progress === 100 ? "success" : "accent"} label="Onboarding progress" />
              <p className="mt-1 text-right font-mono text-[0.75rem] text-faint">
                {completed.size}/{plan.steps.length} complete
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={completed.size === 0}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-3">
          {plan.steps.map((step) => {
            const done = completed.has(step.order);
            return (
              <Card key={step.order} className={cn(done && "border-success/40")}>
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <button
                    type="button"
                    onClick={() => toggle(step.order)}
                    aria-pressed={done}
                    aria-label={`Mark step ${step.order} ${done ? "incomplete" : "complete"}`}
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                      done ? "border-success bg-success/20 text-success" : "border-line text-transparent hover:border-faint",
                    )}
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[0.75rem] text-faint">{String(step.order).padStart(2, "0")}</span>
                      <h3 className={cn("text-xs font-semibold", done ? "text-muted line-through" : "text-ink")}>{step.title}</h3>
                    </div>
                    <p className="mt-1 break-words text-[0.8125rem] leading-relaxed text-muted">{step.why}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {step.files.map((file) => (
                        <Link
                          key={file}
                          href={`/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(file)}`}
                          className="inline-flex max-w-full items-center gap-1 break-all rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[0.75rem] text-accent hover:border-accent"
                        >
                          <FileCode2 className="h-2.5 w-2.5" aria-hidden="true" /> {file}
                        </Link>
                      ))}
                    </div>
                    <p className="mt-2 break-words rounded border border-line bg-canvas px-2.5 py-2 text-[0.75rem] leading-relaxed text-muted">
                      <span className="font-semibold text-ink">Exercise:</span> {step.exercise}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="What this system is"
              description="Deterministic summary assembled from indexed structure."
              icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
            />
            <div className="space-y-2 px-4 py-4">
              {plan.overview.map((paragraph) => (
                <p key={paragraph} className="text-[0.8125rem] leading-relaxed text-muted">{paragraph}</p>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Architecture notes" icon={<BookOpen className="h-4 w-4" aria-hidden="true" />} />
            <div className="space-y-2 px-4 py-4">
              {plan.architecture.map((paragraph) => (
                <p key={paragraph} className="text-[0.8125rem] leading-relaxed text-muted">{paragraph}</p>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Key files"
              description="Ranked by graph connectivity, not by recency."
              icon={<FileCode2 className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="divide-y divide-line">
              {plan.key_files.map((file) => (
                <li key={file.path}>
                  <Link
                    href={`/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(file.path)}`}
                    className="block px-4 py-2.5 hover:bg-raised/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[0.75rem] text-ink">{file.path}</span>
                      <span className="shrink-0 font-mono text-[0.75rem] text-faint">
                        {file.in_degree} in / {file.out_degree} out
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[0.75rem] text-faint">
                      {file.role} · {formatNumber(file.lines)} lines
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="Questions to ask the codebase"
            description="Open a question in the assistant. Answers still depend on retrieved evidence."
            icon={<HelpCircle className="h-4 w-4" aria-hidden="true" />}
          />
          <ul className="divide-y divide-line">
            {plan.questions_to_ask_the_codebase.map((question) => (
              <li key={question}>
                <Link
                  href={`/app/repositories/${repositoryID}/assistant?q=${encodeURIComponent(question)}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] text-muted hover:bg-raised/40 hover:text-ink"
                >
                  <span>{question}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Indexed facts" description="Raw counts behind the plan." />
          <div className="grid grid-cols-2 gap-3 px-4 py-4 text-[0.8125rem]">
            <Fact label="Files" value={formatNumber(plan.facts.stats.files)} />
            <Fact label="Symbols" value={formatNumber(plan.facts.stats.symbols)} />
            <Fact label="Lines" value={formatNumber(plan.facts.stats.lines)} />
            <Fact label="APIs" value={formatNumber(plan.facts.stats.apis)} />
            <Fact label="Tests" value={formatNumber(plan.facts.stats.tests)} />
            <Fact label="Modules" value={formatNumber(plan.facts.modules.length)} />
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Entry points</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {plan.facts.entry_points.length === 0 ? (
                <span className="text-[0.75rem] text-faint">None detected.</span>
              ) : (
                plan.facts.entry_points.slice(0, 10).map((entry) => <Badge key={entry}>{entry}</Badge>)
              )}
            </div>
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-faint">Entities</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {plan.facts.entities.length === 0 ? (
                <span className="text-[0.75rem] text-faint">None detected.</span>
              ) : (
                plan.facts.entities.slice(0, 12).map((entity) => (
                  <Badge key={entity} tone="accent">{entity}</Badge>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.75rem] uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className="mt-0.5 font-mono text-[0.8125rem] text-ink">{value}</p>
    </div>
  );
}
