"use client";

import { useState } from "react";
import { Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { apiPost } from "@/lib/client-api";
import type { ArchitectureSnapshot } from "@/lib/types";

interface CreateSnapshotButtonProps {
  repositoryID: string;
  branch: string;
}

export function CreateSnapshotButton({ repositoryID, branch }: CreateSnapshotButtonProps) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost<{ snapshot: ArchitectureSnapshot }>(`/repositories/${repositoryID}/snapshots`, {
        branch,
        label: label.trim() || undefined,
      });
      setLabel("");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Snapshot could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Create architecture snapshot" description="Captures the current graph, module coupling, APIs and cycles at this commit." />
      <form onSubmit={create} className="px-5 py-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[0.75rem] font-medium text-muted">Label</label>
          <Textarea
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. pre-release-2026-01 or post-refactor"
            rows={2}
            className="text-[0.8125rem]"
          />
        </div>
        {error && <p className="px-2 text-[0.75rem] text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : <><Play className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Create snapshot</>}
          </Button>
          <p className="text-[0.75rem] text-faint">Snapshots older than 40 per branch are pruned automatically.</p>
        </div>
      </form>
    </Card>
  );
}

