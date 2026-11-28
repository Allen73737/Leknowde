"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { ExternalLink, MousePointerClick } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/format";
import type { Graph } from "@/lib/types";

type SystemNodeData = {
  label: string;
  kind: string;
  filePath: string;
  degree: number;
  dimmed: boolean;
};

type SystemNode = Node<SystemNodeData, "system">;

function SystemNodeCard({ data, selected }: NodeProps<SystemNode>) {
  return (
    <div
      className={cn(
        "w-[220px] rounded-lg border bg-surface px-3 py-2.5 shadow-card transition-all duration-200",
        selected ? "border-accent-strong shadow-lift" : "border-line",
        data.dimmed ? "opacity-35" : "opacity-100",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.75rem] text-faint">
          {data.kind}
        </span>
        <span className="font-mono text-[0.75rem] text-faint">{data.degree}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[0.875rem] font-medium leading-snug text-ink">
        {data.label}
      </p>
      {data.filePath ? (
        <p className="mt-1.5 truncate font-mono text-[0.75rem] text-faint">{data.filePath}</p>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
    </div>
  );
}

const nodeTypes = { system: SystemNodeCard };

const kindRank = [
  "module",
  "service",
  "api",
  "entity",
  "file",
  "test",
  "interface",
  "class",
  "component",
  "function",
  "symbol",
];

export function SystemGraph({
  graph,
  height = 560,
  repositoryID,
}: {
  graph: Graph;
  height?: number;
  repositoryID?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const neighbors = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>([selected]);
    for (const edge of graph.edges) {
      if (edge.from === selected) set.add(edge.to);
      if (edge.to === selected) set.add(edge.from);
    }
    return set;
  }, [graph.edges, selected]);

  const { nodes, edges } = useMemo(() => {
    const groups = new Map<string, typeof graph.nodes>();
    for (const node of graph.nodes) {
      const list = groups.get(node.kind) ?? [];
      list.push(node);
      groups.set(node.kind, list);
    }
    const orderedKinds = [...groups.keys()].sort((a, b) => {
      const ai = kindRank.indexOf(a);
      const bi = kindRank.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    const positions = new Map<string, { x: number; y: number }>();
    let yCursor = 0;
    for (const kind of orderedKinds) {
      const group = groups.get(kind) ?? [];
      const columns = Math.min(5, Math.max(1, group.length));
      group.forEach((node, index) => {
        positions.set(node.key, {
          x: (index % columns) * 264,
          y: yCursor + Math.floor(index / columns) * 148,
        });
      });
      yCursor += Math.ceil(group.length / columns) * 148 + 52;
    }

    const flowNodes: SystemNode[] = graph.nodes.map((node) => {
      const position = positions.get(node.key) ?? { x: 0, y: 0 };
      return {
        id: node.key,
        type: "system",
        position,
        measured: { width: 220, height: 92 },
        data: {
          label: node.label || node.key,
          kind: node.kind,
          filePath: node.file_path,
          degree: node.in_degree + node.out_degree,
          dimmed: selected !== null && !neighbors.has(node.key),
        },
        selected: selected === node.key,
      };
    });

    const flowEdges: Edge[] = graph.edges
      .filter((edge) => positions.has(edge.from) && positions.has(edge.to))
      .map((edge, index) => {
        const active = selected !== null && (edge.from === selected || edge.to === selected);
        const dimmed = selected !== null && !active;
        return {
          id: `edge-${index}-${edge.from}-${edge.to}`,
          source: edge.from,
          target: edge.to,
          label: selected !== null && active ? edge.relation : undefined,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: active ? "var(--accent)" : "var(--line)" },
          style: {
            stroke: active ? "var(--accent)" : "var(--line)",
            strokeWidth: active ? 1.6 : 1,
            opacity: dimmed ? 0.25 : 1,
          },
          labelStyle: { fill: "var(--muted)", fontSize: 12, fontFamily: "var(--font-manrope)" },
          labelBgStyle: { fill: "var(--shell)" },
          labelBgPadding: [4, 3] as [number, number],
          labelBgBorderRadius: 2,
        };
      });

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, neighbors, selected]);

  const selectedNode = selected ? graph.nodes.find((node) => node.key === selected) : undefined;
  const selectedNeighbors = selectedNode
    ? graph.edges
        .filter((edge) => edge.from === selectedNode.key || edge.to === selectedNode.key)
        .slice(0, 10)
    : [];

  if (graph.nodes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-card border border-line bg-surface text-center"
        style={{ height }}
      >
        <MousePointerClick className="h-5 w-5 text-faint" aria-hidden="true" />
        <p className="mt-2 text-xs text-muted">No graph nodes for this view.</p>
        <p className="mt-1 max-w-sm text-[0.75rem] text-faint">
          The index may not contain resolvable edges for this projection. Try another view after indexing completes.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div style={{ height }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.14 }}
          minZoom={0.2}
          maxZoom={1.8}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => setSelected((current) => (current === node.id ? null : node.id))}
          onPaneClick={() => setSelected(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
          {graph.nodes.length > 30 ? <MiniMap pannable zoomable nodeStrokeWidth={2} /> : null}
        </ReactFlow>
      </div>
      <div className="border-t border-line px-4 py-2.5">
        {selectedNode ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{selectedNode.kind}</Badge>
                <span className="truncate font-mono text-[0.8125rem] text-ink">{selectedNode.label}</span>
                <span className="font-mono text-[0.75rem] text-faint">
                  in {selectedNode.in_degree} · out {selectedNode.out_degree}
                </span>
              </div>
              {selectedNode.file_path ? (
                <p className="mt-1 truncate font-mono text-[0.75rem] text-faint">{selectedNode.file_path}</p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {selectedNeighbors.map((edge, index) => (
                  <span key={`${edge.from}-${edge.to}-${index}`} className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[0.75rem] text-muted">
                    {edge.relation} · {edge.from === selectedNode.key ? edge.to : edge.from}
                  </span>
                ))}
              </div>
            </div>
            {repositoryID && selectedNode.file_path ? (
              <a
                href={`/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(selectedNode.file_path)}`}
                className="inline-flex items-center gap-1 text-[0.75rem] text-accent hover:underline"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" /> Open file
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-[0.75rem] text-faint">
            Click a node to isolate its immediate relationships. Drag to reposition; use the controls to fit the view.
          </p>
        )}
      </div>
    </div>
  );
}
