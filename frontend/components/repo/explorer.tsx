"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  MessageSquare,
  Search,
} from "lucide-react";

import { LogoLoader } from "@/components/brand/logo-loader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { apiClient } from "@/lib/client-api";
import { cn, formatBytes, formatNumber, plural } from "@/lib/format";
import type { CodeFile, FileResponse, Symbol, TreeNode } from "@/lib/types";

const MonacoCode = dynamic(() => import("@/components/code/monaco-code").then((mod) => mod.MonacoCode), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center bg-shell font-mono text-[0.8125rem] text-faint">
      Loading source viewer…
    </div>
  ),
});

type Pane = "symbols" | "imports";

export function Explorer({
  repositoryID,
  tree,
  files,
  initialPath,
  initialLine,
}: {
  repositoryID: string;
  tree: TreeNode[];
  files: CodeFile[];
  initialPath?: string;
  initialLine?: number;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.filter((node) => node.type === "dir").map((node) => node.path)));
  const [selectedPath, setSelectedPath] = useState(initialPath ?? "");
  const [file, setFile] = useState<FileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusLine, setFocusLine] = useState<number | undefined>();
  const [pane, setPane] = useState<Pane>("symbols");

  const filteredFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return files.filter((candidate) => candidate.path.toLowerCase().includes(needle)).slice(0, 120);
  }, [files, query]);

  useEffect(() => {
    const target = initialPath && files.some((candidate) => candidate.path === initialPath)
      ? initialPath
      : files.find((candidate) => !candidate.is_binary)?.path;
    if (target) void loadFile(target, target === initialPath ? initialLine : undefined);
    // The initial file is loaded once; later loads are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFile(path: string, line?: number) {
    setSelectedPath(path);
    setLoading(true);
    setError("");
    setFile(null);
    setFocusLine(line);
    try {
      const result = await apiClient<FileResponse>(
        `/repositories/${repositoryID}/file?path=${encodeURIComponent(path)}`,
      );
      setFile(result);
      if (line) setFocusLine(line);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this file.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    if (node.type === "dir") {
      const open = expanded.has(node.path);
      return (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => toggle(node.path)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.875rem] text-muted transition-colors hover:bg-raised/60 hover:text-ink"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
            )}
            {open ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {open && node.children ? <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
        </li>
      );
    }
    return (
      <li key={node.path}>
        <button
          type="button"
          onClick={() => loadFile(node.path)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.875rem] transition-colors hover:bg-raised/60 hover:text-ink",
            selectedPath === node.path ? "bg-raised text-ink" : "text-muted",
          )}
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
        >
          <FileCode2 className={cn("h-3.5 w-3.5 shrink-0", selectedPath === node.path ? "text-accent" : "text-faint")} aria-hidden="true" />
          <span className="truncate">{node.name}</span>
        </button>
      </li>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-card border border-line bg-surface shadow-card lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100vh-7rem)] lg:flex-col lg:self-start">
        <div className="shrink-0 border-b border-line p-2.5">
          <label className="relative block">
            <span className="sr-only">Filter files</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter ${plural(files.length, "file")}`}
              className="h-10 pl-9 text-[0.875rem]"
            />
          </label>
        </div>
        <div className="max-h-[520px] overflow-y-auto p-1.5 lg:max-h-none lg:min-h-0 lg:flex-1">
          {query.trim() ? (
            filteredFiles.length === 0 ? (
              <p className="px-2 py-6 text-center text-[0.875rem] text-faint">No paths match.</p>
            ) : (
              <ul>
                {filteredFiles.map((candidate) => (
                  <li key={candidate.path}>
                    <button
                      type="button"
                      onClick={() => loadFile(candidate.path)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-[0.8125rem] transition-colors hover:bg-raised/60",
                        selectedPath === candidate.path ? "bg-raised text-ink" : "text-muted",
                      )}
                    >
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                      <span className="truncate">{candidate.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : tree.length === 0 ? (
            <p className="px-2 py-6 text-center text-[0.875rem] text-faint">No indexed files.</p>
          ) : (
            <ul>{tree.map((node) => renderNode(node, 0))}</ul>
          )}
        </div>
        <div className="shrink-0 border-t border-line px-3.5 py-2.5 font-mono text-[0.75rem] text-faint">
          {files.length} {files.length === 1 ? "file" : "files"} · read-only
        </div>
      </aside>

      <div className="min-w-0 space-y-3">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-[0.9375rem] text-ink">{selectedPath || "Select a file"}</p>
              {file ? (
                <p className="mt-1 font-mono text-[0.8125rem] text-faint">
                  {file.file.language || "plain text"} · {formatNumber(file.file.line_count)} lines ·{" "}
                  {formatBytes(file.file.size)}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              {selectedPath ? (
                <Link
                  href={`/app/repositories/${repositoryID}/assistant?q=${encodeURIComponent(`Explain ${selectedPath} and what depends on it.`)}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 py-1 text-[0.8125rem] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                  Ask about this file
                </Link>
              ) : null}
              {file?.symbols.length ? (
                <Badge tone="accent">
                  {file.symbols.length} {file.symbols.length === 1 ? "symbol" : "symbols"}
                </Badge>
              ) : null}
              {file?.dependencies.length ? (
                <Badge>
                  {file.dependencies.length} {file.dependencies.length === 1 ? "edge" : "edges"}
                </Badge>
              ) : null}
            </div>
          </div>
          {loading ? (
            <div className="flex h-[560px] items-center justify-center gap-2.5 bg-shell text-[0.875rem] text-faint">
              <LogoLoader size={18} decorative /> Loading file…
            </div>
          ) : error ? (
            <div className="flex h-[560px] flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" />
              <p className="text-[0.875rem] text-danger">{error}</p>
            </div>
          ) : file ? (
            <MonacoCode
              value={file.file.content ?? ""}
              language={file.file.language}
              path={`${repositoryID}/${file.file.path}`}
              height="560px"
              focusLine={focusLine}
            />
          ) : (
            <div className="flex h-[560px] items-center justify-center text-[0.875rem] text-faint">
              Choose a file from the tree.
            </div>
          )}
        </div>

        {file ? (
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center gap-1 border-b border-line px-2 py-2">
              {(["symbols", "imports"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPane(value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[0.875rem] font-medium capitalize transition-colors",
                    pane === value ? "bg-raised text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {value}
                  <span className="ml-1.5 font-mono text-[0.75rem] text-faint">
                    {value === "symbols" ? file.symbols.length : file.dependencies.length}
                  </span>
                </button>
              ))}
            </div>
            {pane === "symbols" ? (
              file.symbols.length === 0 ? (
                <p className="px-4 py-6 text-[0.875rem] text-faint">No symbols were extracted from this file.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {file.symbols.map((symbol: Symbol) => (
                    <li key={symbol.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusLine(symbol.start_line);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-raised/50"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Badge tone={symbol.exported ? "accent" : "neutral"}>{symbol.kind}</Badge>
                          <span className="truncate font-mono text-[0.875rem] text-ink">{symbol.qualified_name || symbol.name}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[0.75rem] text-faint">
                          {symbol.start_line}–{symbol.end_line}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : file.dependencies.length === 0 ? (
              <p className="px-4 py-6 text-[0.875rem] text-faint">
                No resolved import edges for this file. External packages are not represented as graph nodes.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {file.dependencies.map((dependency, index) => (
                  <li key={`${dependency.counterpart}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge>{dependency.relation}</Badge>
                        <span className="text-[0.75rem] text-faint">{dependency.direction}</span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[0.75rem] text-muted">{dependency.counterpart_label || dependency.counterpart}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (dependency.is_file) void loadFile(dependency.counterpart.replace(/^file:/, ""), dependency.line || undefined);
                      }}
                      disabled={!dependency.is_file}
                      className="shrink-0 text-[0.75rem] text-accent hover:underline disabled:text-faint disabled:no-underline"
                    >
                      {dependency.is_file ? "Open file" : "Not a file"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
