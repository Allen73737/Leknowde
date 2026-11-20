"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import {
  ArrowRight,
  Boxes,
  Braces,
  FileCode2,
  FolderGit2,
  LayoutDashboard,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LogoLoader } from "@/components/brand/logo-loader";
import { apiClient } from "@/lib/client-api";
import { cn } from "@/lib/format";
import { accountNav, repoNav, workspaceNav } from "@/lib/nav";
import type { DashboardResponse, Repository, SearchResponse, Workspace } from "@/lib/types";

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: "Navigate" | "Repositories" | "Files" | "Symbols";
  href: string;
};

const staticItems: Item[] = [
  ...workspaceNav.map((item) => ({
    id: `nav-${item.href}`,
    label: item.href === "/app/repositories" ? "All repositories" : item.label,
    icon: item.icon,
    group: "Navigate" as const,
    href: item.href,
  })),
  ...accountNav.map((item) => ({
    id: `nav-${item.href}`,
    label: item.label,
    icon: item.icon,
    group: "Navigate" as const,
    href: item.href,
  })),
];

export function CommandPalette({
  workspaces,
  open,
  onOpenChange,
}: {
  workspaces: Workspace[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotionSafe();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [searching, setSearching] = useState(false);
  const [remote, setRemote] = useState<Item[]>([]);
  const [active, setActive] = useState(0);

  const repoMatch = pathname.match(/^\/app\/repositories\/([^/]+)/);
  const repositoryID = repoMatch?.[1];

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  /* Load the repositories the account can see, once per open. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingRepos(true);
    (async () => {
      try {
        if (workspaces.length > 0) {
          const bundles = await Promise.all(
            workspaces.map((workspace) =>
              apiClient<{ repositories: Repository[] }>(
                `/workspaces/${workspace.id}/repositories`,
              ).then((response) => response.repositories ?? []),
            ),
          );
          if (!cancelled) setRepos(bundles.flat());
        } else {
          const dashboard = await apiClient<DashboardResponse>("/dashboard");
          if (!cancelled) setRepos(dashboard.recent_repositories ?? []);
        }
      } catch {
        /* Navigation still works when the list cannot be loaded. */
      } finally {
        if (!cancelled) setLoadingRepos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workspaces]);

  /* Focus the field and reset the query each time the palette opens. */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  /* Debounced repository search for files and symbols. */
  useEffect(() => {
    if (!open || !repositoryID || query.trim().length < 2) {
      setRemote([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiClient<SearchResponse>(
          `/repositories/${repositoryID}/search?q=${encodeURIComponent(query.trim())}`,
        );
        if (cancelled) return;
        const files: Item[] = (response.files ?? []).slice(0, 6).map((file) => ({
          id: `file-${file.path}`,
          label: file.path,
          hint: file.line ? `line ${file.line}` : `${file.matches} matches`,
          icon: FileCode2,
          group: "Files",
          href: `/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(file.path)}`,
        }));
        const symbols: Item[] = (response.symbols ?? []).slice(0, 6).map((symbol) => ({
          id: `symbol-${symbol.id}`,
          label: symbol.name,
          hint: `${symbol.kind} · ${symbol.file_path}`,
          icon: Braces,
          group: "Symbols",
          href: `/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(symbol.file_path)}&line=${symbol.start_line}`,
        }));
        setRemote([...files, ...symbols]);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, repositoryID]);

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (value: string) => value.toLowerCase().includes(term);
    const navigate = staticItems.filter((item) => term === "" || matches(item.label));
    const repositories = repos
      .filter((repo) => term === "" || matches(repo.full_name))
      .slice(0, term === "" ? 5 : 8)
      .map<Item>((repo) => ({
        id: `repo-${repo.id}`,
        label: repo.full_name,
        hint: repo.status === "ready" ? "indexed" : repo.status,
        icon: FolderGit2,
        group: "Repositories",
        href: `/app/repositories/${repo.id}`,
      }));
    return [...navigate.slice(0, term === "" ? staticItems.length : 5), ...repositories, ...remote];
  }, [query, repos, remote]);

  const repoItems = useMemo(
    () =>
      repoNav.map<Item>((item) => ({
        id: `repo-nav-${item.segment}`,
        label: item.label,
        hint: item.description,
        icon: item.icon,
        group: "Navigate",
        href: `/app/repositories/${repositoryID}${item.segment ? `/${item.segment}` : ""}`,
      })),
    [repositoryID],
  );

  /* While inside a repository, surface its own views first for an empty query. */
  const visible = useMemo(() => {
    if (query.trim() === "" && repositoryID) {
      const shortcut: Item = {
        id: "repo-dashboard",
        label: "Repository overview",
        hint: "current repository",
        icon: LayoutDashboard,
        group: "Navigate",
        href: `/app/repositories/${repositoryID}`,
      };
      return [shortcut, ...repoItems, ...items];
    }
    return items;
  }, [items, query, repositoryID, repoItems]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (visible.length === 0 ? 0 : (value + 1) % visible.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (visible.length === 0 ? 0 : (value - 1 + visible.length) % visible.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = visible[active];
      if (item) go(item.href);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const groups = useMemo(() => {
    const order: Item["group"][] = ["Navigate", "Repositories", "Files", "Symbols"];
    return order
      .map((group) => ({ group, entries: visible.filter((item) => item.group === group) }))
      .filter((entry) => entry.entries.length > 0);
  }, [visible]);

  let runningIndex = -1;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[60]">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-3 top-[8vh] mx-auto w-auto max-w-2xl overflow-hidden rounded-card border border-line-strong bg-surface shadow-lift sm:inset-x-6"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <Search className="h-[1.125rem] w-[1.125rem] shrink-0 text-faint" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  repositoryID
                    ? "Search this repository, or jump to a surface…"
                    : "Jump to a repository, workspace or surface…"
                }
                aria-label="Search"
                className="w-full bg-transparent text-base text-ink placeholder:text-faint focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              {searching || loadingRepos ? (
                <LogoLoader size={16} decorative className="shrink-0" />
              ) : (
                <span className="hidden shrink-0 rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[0.75rem] text-faint sm:block">
                  esc
                </span>
              )}
            </div>

            <div
              ref={listRef}
              role="listbox"
              aria-label="Results"
              className="max-h-[60vh] overflow-y-auto py-2"
            >
              {visible.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-base text-muted">
                    {searching
                      ? "Searching files and symbols…"
                      : loadingRepos
                        ? "Loading repositories…"
                        : query.trim().length < 2 && repositoryID
                          ? "Type at least two characters to search files and symbols."
                          : "No matches in this workspace."}
                  </p>
                  {!repositoryID ? (
                    <p className="mt-1.5 text-[0.8125rem] text-faint">
                      Open a repository to search its files and symbols here.
                    </p>
                  ) : null}
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.group} className="mb-1">
                    <p className="px-4 py-2 font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-faint">
                      {group.group}
                    </p>
                    {group.entries.map((item) => {
                      runningIndex += 1;
                      const index = runningIndex;
                      const isActive = index === active;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-index={index}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(item.href)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150",
                            isActive ? "bg-raised text-ink" : "text-muted hover:bg-raised/60",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive ? "text-accent" : "text-faint",
                            )}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-medium">
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="mt-0.5 block truncate font-mono text-[0.75rem] text-faint">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                          <ArrowRight
                            className={cn(
                              "h-4 w-4 shrink-0 transition-opacity",
                              isActive ? "text-accent opacity-100" : "opacity-0",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-shell px-4 py-2.5 font-mono text-[0.75rem] text-faint">
              <span className="flex items-center gap-3">
                <span>↑↓ navigate</span>
                <span>↵ open</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
                {repositoryID ? "repository scope" : "workspace scope"}
              </span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function PaletteHint({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group hidden items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-[0.8125rem] text-faint transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:text-muted hover:shadow-card lg:flex"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="max-w-[9rem] truncate">Search</span>
      <span className="ml-auto flex items-center gap-0.5 rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[0.75rem]">
        ⌘K
      </span>
    </button>
  );
}
