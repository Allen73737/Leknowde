"use client";

import dynamic from "next/dynamic";

import type { Graph } from "@/lib/types";

const SystemGraph = dynamic(() => import("@/components/graph/system-graph").then((mod) => mod.SystemGraph), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center rounded-card border border-line bg-surface font-mono text-[0.8125rem] text-faint">
      Loading graph renderer…
    </div>
  ),
});

export function GraphCanvas({
  graph,
  height = 560,
  repositoryID,
}: {
  graph: Graph;
  height?: number;
  repositoryID?: string;
}) {
  return <SystemGraph graph={graph} height={height} repositoryID={repositoryID} />;
}
