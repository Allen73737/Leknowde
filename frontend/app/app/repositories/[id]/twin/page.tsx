import Link from "next/link";
import { Boxes, GitBranch, Info, Layers, Network, Share2 } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { SystemGraph } from "@/components/graph/system-graph";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatNumber } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { TwinResponse } from "@/lib/types";

export const metadata = { title: "Digital twin" };

const kindDescriptions: Record<string, string> = {
  module: "Top-level directory or package treated as a responsibility boundary.",
  service: "Detected service or singleton wiring unit.",
  api: "HTTP route or exported endpoint.",
  entity: "Struct, class or model used as stored data.",
  interface: "TypeScript interface, protocol or abstract contract.",
  component: "UI component.",
  class: "Class definition.",
  function: "Standalone function.",
  symbol: "Indexed symbol without a more specific kind.",
  file: "Source file connected through imports.",
  test: "Test file.",
};

export default async function TwinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/twin`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<TwinResponse>(`/repositories/${id}/twin?limit=600`);
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/twin`} title="Twin unavailable" />;
  }

  const twin = result.data;
  const totalKindNodes = twin.kinds.reduce((sum, kind) => sum + kind.count, 0);
  const averageDegree = twin.nodes > 0 ? (twin.edges * 2) / twin.nodes : 0;
  const repository = twin.repository;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Digital twin"
        description="A queryable, static projection of the repository graph. It models structure and declared relationships only; it is not a running simulation and it carries no runtime telemetry."
        action={<Badge>{repository.parser || "parser unknown"}</Badge>}
      />

      <MetricBand
        items={[
          { label: "Nodes", value: formatNumber(twin.nodes), hint: `${twin.kinds.length} node kinds` },
          { label: "Edges", value: formatNumber(twin.edges), hint: "Declared relationships" },
          {
            label: "Average degree",
            value: averageDegree.toFixed(2),
            hint: "Edges counted from both ends",
          },
          {
            label: "Branch",
            value: <span className="font-mono text-sm">{repository.branch || "default"}</span>,
            hint: repository.full_name,
          },
        ]}
      />

      <Card>
        <CardHeader
          title="System graph"
          description={
            twin.graph.truncated
              ? `Showing a bounded sample of ${formatNumber(twin.graph.nodes.length)} nodes from ${formatNumber(twin.nodes)}. The view is truncated to keep the browser responsive.`
              : "Every indexed graph node is shown. Layout is deterministic; it is not a force-directed guess."
          }
          icon={<Network className="h-4 w-4" aria-hidden="true" />}
          action={<Badge tone="accent">{formatNumber(twin.graph.nodes.length)} rendered</Badge>}
        />
        {twin.graph.truncated ? (
          <p className="border-b border-warning/30 bg-warning/5 px-5 py-2.5 text-[0.75rem] text-warning">
            Truncated view. Counts below describe the full indexed graph, not this sample.
          </p>
        ) : null}
        <div className="p-2">
          <SystemGraph graph={twin.graph} height={620} repositoryID={id} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-[0.75rem] text-faint">
          <span className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" aria-hidden="true" /> {repository.branch || "default branch"}
          </span>
          <span aria-hidden="true">·</span>
          <span>Click a node to isolate its neighbourhood</span>
          <span aria-hidden="true">·</span>
          <Link href={`/app/repositories/${id}/architecture`} className="text-accent hover:underline">
            Open architecture views
          </Link>
          <span aria-hidden="true">·</span>
          <Link href={`/app/repositories/${id}/dependencies`} className="text-accent hover:underline">
            Inspect dependency edges
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader
            title="Node kinds"
            description="Counts and incident edge totals across the full graph."
            icon={<Layers className="h-4 w-4" aria-hidden="true" />}
            action={<Badge>{formatNumber(totalKindNodes)} nodes</Badge>}
          />
          {twin.kinds.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">No graph nodes have been indexed.</p>
          ) : (
            <ul className="divide-y divide-line">
              {twin.kinds.map((kind) => {
                const share = totalKindNodes > 0 ? (kind.count / totalKindNodes) * 100 : 0;
                return (
                  <li key={kind.kind} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[0.8125rem] text-ink">{kind.kind}</span>
                      <span className="tabular shrink-0 text-[0.75rem] text-faint">
                        {formatNumber(kind.count)} nodes · {formatNumber(kind.edges)} edges
                      </span>
                    </div>
                    <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
                      {kindDescriptions[kind.kind] ?? "Indexed graph node kind."}
                    </p>
                    <Progress value={share} tone="accent" className="mt-2 h-1" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="What this twin can answer"
              description="Deterministic questions, answered by traversal."
              icon={<Boxes className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="space-y-2 px-5 py-4 text-[0.8125rem] leading-relaxed text-muted">
              <li>Which modules import a given file, directly and transitively?</li>
              <li>Which APIs and entities sit at the highest-connectivity nodes?</li>
              <li>Which files depend on a change, and how far does the blast radius reach?</li>
              <li>Which symbols or files have no inbound or outbound edges?</li>
            </ul>
            <div className="border-t border-line px-5 py-3">
              <Link href={`/app/repositories/${id}/impact`} className="text-[0.8125rem] text-accent hover:underline">
                Run a change-impact query →
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Limitations"
              description="Stated so the model is not over-read."
              icon={<Info className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="space-y-2 px-5 py-4 text-[0.75rem] leading-relaxed text-muted">
              <li>Edges come from static imports, symbol references and detected route wiring. Dynamic requires and runtime lookup are not resolved.</li>
              <li>The graph is relational (<span className="font-mono">graph_nodes</span> / <span className="font-mono">graph_edges</span>) with recursive traversal. An optional Neo4j adapter is not configured in this deployment.</li>
              <li>It describes one indexed branch at one commit. It does not observe live traffic, memory or deployment state.</li>
              <li>Node samples are truncated by the requested limit; totals always refer to the full indexed set.</li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Share" icon={<Share2 className="h-4 w-4" aria-hidden="true" />} />
            <div className="px-5 py-4">
              <p className="text-[0.75rem] leading-relaxed text-muted">
                The twin is scoped to this repository and workspace. There is no public share link; access follows the
                workspace membership check on every request.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
