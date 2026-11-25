"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import type { SnapshotRef } from "@/lib/types";

interface SnapshotSelectorProps {
  snapshots: SnapshotRef[];
  base: string;
  head: string;
  repositoryID: string;
}

export function SnapshotSelector({
  snapshots,
  base,
  head,
  repositoryID,
}: SnapshotSelectorProps) {
  const [baseValue, setBaseValue] = useState(base);
  const [headValue, setHeadValue] = useState(head);

  const hasSelection = baseValue !== "" && headValue !== "";

  return (
    <div className="space-y-2 p-5 rounded border border-line bg-surface">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[0.75rem] font-medium text-muted">Base snapshot</p>
          <select
            value={baseValue}
            onChange={(event) => setBaseValue(event.target.value)}
            className="block w-full rounded border border-line bg-surface px-3 py-2 text-[0.8125rem] text-ink focus:border-accent outline-none"
          >
            <option value="">— select base —</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label || "(unlabeled)"} @ {s.commit_sha.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <p className="text-[0.75rem] font-medium text-muted">Head snapshot</p>
          <select
            value={headValue}
            onChange={(event) => setHeadValue(event.target.value)}
            className="block w-full rounded border border-line bg-surface px-3 py-2 text-[0.8125rem] text-ink focus:border-accent outline-none"
          >
            <option value="">— select head —</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label || "(unlabeled)"} @ {s.commit_sha.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasSelection}
          onClick={() => {
            if (hasSelection) {
              window.location.href = `/app/repositories/${repositoryID}/diff?base=${encodeURIComponent(baseValue)}&head=${encodeURIComponent(headValue)}`;
            }
          }}
        >
          <GitBranch className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Compare
        </Button>
        <p className="text-[0.75rem] text-faint">
          Select two snapshots to see the drift between them.
        </p>
      </div>
    </div>
  );
}
