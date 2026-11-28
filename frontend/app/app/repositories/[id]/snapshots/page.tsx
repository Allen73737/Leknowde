import { Database, RefreshCw } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { CreateSnapshotButton } from "@/components/repo/create-snapshot-button";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { SnapshotRef } from "@/lib/types";

export default async function SnapshotsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const branch = Array.isArray(search.branch) ? search.branch[0] : search.branch;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/snapshots`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<{ snapshots: SnapshotRef[] }>(
    `/repositories/${id}/snapshots?branch=${encodeURIComponent(branch ?? bundle.data.repository.default_branch)}`,
  );
  const snapshots = result.data?.snapshots ?? [];
  const loadError = result.error;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Change intelligence"
        title="Architecture snapshots"
        description="A deterministic summary of the graph captured at the end of each index: files, modules, coupling, APIs, cycles. Compare any two snapshots to see drift over time."
        action={
          <a href={`/app/repositories/${id}/snapshots?branch=${encodeURIComponent(bundle.data.repository.default_branch)}`} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-3 py-2 text-[0.8125rem] text-muted hover:border-accent hover:text-accent">
            <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
            Refresh
          </a>
        }
      />

      {loadError && (
        <Card>
          <CardHeader title="Snapshots unavailable" />
          <p className="px-5 py-3 text-[0.8125rem] text-muted">{loadError.message}</p>
        </Card>
      )}

      <CreateSnapshotButton repositoryID={id} branch={bundle.data.repository.default_branch} />

      <MetricBand
        items={[
          { label: "Snapshots", value: formatNumber(snapshots.length), hint: "Stored for this repository" },
          { label: "Branch", value: bundle.data.repository.default_branch, hint: "Indexed branch" },
        ]}
      />

      {snapshots.length === 0 ? (
        <Card>
          <CardHeader title="No snapshots yet" icon={<Database className="h-4 w-4" aria-hidden="true" />} />
          <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
            Create a snapshot above, or wait for the next index to capture one automatically.
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Snapshot history"
            icon={<Database className="h-4 w-4" aria-hidden="true" />}
            action={
              <a href={`/app/repositories/${id}/snapshots?branch=${encodeURIComponent(bundle.data.repository.default_branch)}`} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-3 py-2 text-[0.8125rem] text-muted hover:border-accent hover:text-accent">
                All branches
              </a>
            }
          />
          <table className="w-full text-left border-collapse border border-line">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted">Label</th>
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted">Commit</th>
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted text-right">Nodes</th>
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted text-right">Edges</th>
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted text-right">Files</th>
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted text-right">Cycles</th>
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted text-right">APIs</th>
                <th className="px-5 py-3 text-[0.75rem] font-medium text-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap) => (
                <tr key={snap.id} className="border-b border-line/50 hover:bg-raised/30 transition-colors duration-150">
                  <td className="px-5 py-3">
                    <a href={`/app/repositories/${id}/snapshots/${snap.id}`} className="text-accent hover:text-ink">
                      {snap.label || "(unlabeled)"}
                    </a>
                  </td>
                  <td className="px-5 py-3 font-mono text-[0.75rem] text-muted">{snap.commit_sha.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-[0.75rem] tabular text-muted text-right">{formatNumber(snap.nodes)}</td>
                  <td className="px-5 py-3 text-[0.75rem] tabular text-muted text-right">{formatNumber(snap.edges)}</td>
                  <td className="px-5 py-3 text-[0.75rem] tabular text-muted text-right">{formatNumber(snap.files)}</td>
                  <td className="px-5 py-3 text-[0.75rem] tabular text-muted text-right">{formatNumber(snap.cycles)}</td>
                  <td className="px-5 py-3 text-[0.75rem] tabular text-muted text-right">{formatNumber(snap.api_producers)}</td>
                  <td className="px-5 py-3 text-[0.75rem] text-muted">{formatDateTime(snap.created_at)}</td>
                </tr>
              ))}
              {snapshots.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[0.8125rem] text-faint">
                    No snapshots were found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-[0.75rem] text-faint">
        Snapshots are captured at index time. Comparing two snapshots shows added/removed files, module
        coupling changes, new and resolved cycles, and API additions or removals.
      </p>
    </div>
  );
}
