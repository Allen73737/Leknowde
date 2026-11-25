"use client";

import { useState } from "react";
import { Play, RefreshCw, ScanSearch, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { apiPost } from "@/lib/client-api";
import { formatNumber } from "@/lib/format";
import type { TestSelection, TestReason } from "@/lib/types";

export function TestSelectionForm({ repositoryID }: { repositoryID: string }) {
  const [changed, setChanged] = useState("");
  const [selection, setSelection] = useState<TestSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSelection(null);
    const paths = changed
      .split(/[,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.length === 0) {
      setError("Enter one or more repository-relative paths.");
      setBusy(false);
      return;
    }
    try {
      const result = await apiPost<TestSelection>(
        `/repositories/${repositoryID}/test-select`,
        { changed: paths },
      );
      setSelection(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Test selection failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!selection) {
    return (
      <div className="space-y-6">
        <SectionHeading
          title="Test impact selection"
          description="Enter repository-relative paths of changed files. LeKnowde walks the static import graph to find the tests that cover them, and returns the exact command to run."
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
          }
        />
        <Card>
          <CardHeader title="Changed files" icon={<Terminal className="h-4 w-4" aria-hidden="true" />} />
          <form onSubmit={run} className="px-5 py-4 space-y-3">
            <div className="space-y-2">
              <label className="text-[0.75rem] font-medium text-muted">
                Paths (comma or newline separated)
              </label>
              <Textarea
                value={changed}
                onChange={(event) => setChanged(event.target.value)}
                placeholder="server/src/routes/notes.ts\nweb/src/hooks/useAuth.ts"
                rows={4}
                className="text-[0.8125rem]"
              />
            </div>
            {error && <p className="px-2 text-[0.75rem] text-danger">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "Analysing…" : <><Play className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Select tests</>}
            </Button>
            <p className="text-[0.75rem] text-faint">
              LeKnowde does not execute tests. It returns the command and reasoning paths for you to run.
            </p>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Test impact selection"
        description={`${formatNumber(selection.selected_tests.length)} test(s) selected for ${formatNumber(selection.changed_files.length)} changed file(s).`}
        action={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          </div>
        }
      />

      <MetricBand
        items={[
          { label: "Changed", value: formatNumber(selection.changed_files.length), hint: "Files you supplied" },
          { label: "Selected tests", value: formatNumber(selection.selected_tests.length), hint: "Direct + transitive" },
          { label: "Runner", value: selection.runner || "—", hint: "Inferred from manifests" },
          {
            label: "Confidence",
            value: selection.confidence,
            hint: `${selection.confidence_score}/100`,
            tone: selection.confidence === "high" ? "success" : selection.confidence === "medium" ? "warning" : "danger",
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader title="Command to run" icon={<Play className="h-4 w-4" aria-hidden="true" />} />
          <div className="px-5 py-4">
            <div className="mb-2 text-[0.75rem] font-medium text-faint">{selection.command_rationale}</div>
            <pre className="p-3 rounded border border-line bg-shell text-[0.75rem] font-mono text-ink overflow-x-auto">
              {selection.command || selection.full_suite_command}
            </pre>
            <p className="mt-3 text-[0.75rem] text-faint">
              Full suite fallback: <span className="font-mono text-[0.75rem] text-muted">{selection.full_suite_command}</span>
            </p>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Selected tests" icon={<ScanSearch className="h-4 w-4" aria-hidden="true" />} />
          <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
            {selection.selected_tests.length === 0 ? (
              <p className="text-[0.875rem] text-faint">No tests mapped. Run the full suite.</p>
            ) : (
              <ul className="space-y-2">
                {selection.selected_tests.map((test) => (
                  <li key={test} className="px-3 py-2 rounded border border-line bg-surface text-[0.8125rem] font-mono text-ink truncate">
                    {test}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Reasoning" description="Each selected test and what it covers, with dependency hops." />
          <div className="space-y-3 px-5 py-4">
            {selection.reasons.length === 0 ? (
              <p className="text-[0.875rem] text-faint">No reasoning paths recorded.</p>
            ) : (
              selection.reasons.slice(0, 15).map((reason: TestReason) => (
                <div key={`${reason.test}->${reason.covers}`} className="px-3 py-2 border-b border-line/50 last:border-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="font-mono text-[0.8125rem] text-ink truncate">{reason.test}</span>
                    <Badge>{reason.confidence}</Badge>
                  </div>
                  <p className="text-[0.75rem] text-muted">{reason.covers} ({reason.hops} hop(s))</p>
                </div>
              ))
            )}
            {selection.reasons.length > 15 && (
              <p className="px-3 py-2 text-[0.75rem] text-faint">{selection.reasons.length - 15} more reasons not shown.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Unmapped source files" description="Changed source files with no direct test reference." />
          <div className="space-y-2 px-5 py-4">
            {selection.unmapped_files.length === 0 ? (
              <p className="text-[0.875rem] text-faint">Every changed source file maps to at least one test.</p>
            ) : (
              <ul className="divide-y divide-line">
                {selection.unmapped_files.map((path) => (
                  <li key={path} className="px-5 py-3">
                    <p className="font-mono text-[0.8125rem] text-muted truncate">{path}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Caveats" />
        <ul className="space-y-2 px-5 py-4">
          {selection.caveats.map((caveat) => (
            <li key={caveat} className="flex items-start gap-2 text-[0.875rem] leading-relaxed text-muted">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
              {caveat}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
