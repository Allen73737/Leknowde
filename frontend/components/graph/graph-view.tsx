"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { LogoLoader } from "@/components/brand/logo-loader";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/client-api";
import { cn, formatNumber, plural } from "@/lib/format";
import type { Graph, GraphResponse } from "@/lib/types";

const defaultViews = [
  { value: "architecture", label: "Architecture", note: "Modules, services, APIs, entities" },
  { value: "module", label: "Modules", note: "Module dependency projection" },
  { value: "file", label: "Files", note: "File import relationships" },
  { value: "symbol", label: "Symbols", note: "Call, inheritance and interface edges" },
  { value: "test", label: "Tests", note: "Test-to-source relationships" },
];

export function GraphView({
  repositoryID,
  initialGraph,
  initialView,
  height = 580,
}: {
  repositoryID: string;
  initialGraph: Graph;
  initialView: string;
  height?: number;
}) {
  const [graph, setGraph] = useState(initialGraph);
  const [view, setView] = useState(initialView);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function load(nextView: string) {
    if (nextView === view) return;
    setLoading(nextView);
    setError("");
    try {
      const result = await apiClient<GraphResponse>(
        `/repositories/${repositoryID}/graph?view=${encodeURIComponent(nextView)}&limit=500`,
      );
      setGraph(result.graph);
      setView(nextView);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this graph view.");
    } finally {
      setLoading("");
    }
  }

  async function refresh() {
    setLoading(view);
    setError("");
    try {
      const result = await apiClient<GraphResponse>(
        `/repositories/${repositoryID}/graph?view=${encodeURIComponent(view)}&limit=500`,
      );
      setGraph(result.graph);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the graph.");
    } finally {
      setLoading("");
    }
  }

  const current = defaultViews.find((item) => item.value === view);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2.5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Graph projection">
          {defaultViews.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={view === item.value}
              onClick={() => load(item.value)}
              title={item.note}
              className={cn(
                "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.875rem] font-medium transition-colors duration-200",
                view === item.value ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {view === item.value ? (
                <motion.span
                  layoutId="graph-tab-active"
                  transition={{ type: "spring", stiffness: 480, damping: 42 }}
                  className="absolute inset-0 rounded-lg border border-line bg-raised"
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative">{item.label}</span>
              {loading === item.value ? (
                <LogoLoader size={14} decorative className="relative" />
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Badge>{plural(graph.nodes.length, "node")}</Badge>
          <Badge>
            {formatNumber(graph.edges.length)} {graph.edges.length === 1 ? "edge" : "edges"}
          </Badge>
          {graph.truncated ? <Badge tone="warning">truncated</Badge> : null}
          <Button type="button" size="sm" variant="ghost" onClick={refresh} disabled={Boolean(loading)}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading === view && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[0.8125rem] text-danger">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {error}
        </p>
      ) : null}

      <GraphCanvas graph={graph} height={height} repositoryID={repositoryID} />

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[0.75rem] text-faint">
        <p>{current?.note}</p>
        <p>
          Edges are resolved from static declarations. The view is capped at 500 nodes and says so when truncated.
        </p>
      </div>
    </div>
  );
}
