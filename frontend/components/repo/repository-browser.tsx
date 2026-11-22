"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileCode2,
  GitBranch,
  GitFork,
  Search,
  Server,
  X,
} from "lucide-react";

import { DemoConnectButton } from "@/components/repo/demo-connect-button";
import { StatusBadge } from "@/components/repo/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { apiClient, apiPost } from "@/lib/client-api";
import { cn, formatNumber, relativeTime } from "@/lib/format";
import type {
  Integration,
  Job,
  ProviderRepositoriesResponse,
  ProviderRepository,
  Repository,
  Workspace,
} from "@/lib/types";

type Filter = "all" | "ready" | "indexing" | "failed";

export function RepositoryBrowser({
  workspaces,
  repositories,
  integrations,
  githubOAuthEnabled,
  initialWorkspace,
}: {
  workspaces: Workspace[];
  repositories: { repository: Repository; workspaceName: string }[];
  integrations: Integration[];
  githubOAuthEnabled: boolean;
  initialWorkspace?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [workspaceFilter, setWorkspaceFilter] = useState(initialWorkspace ?? "all");
  const [showConnect, setShowConnect] = useState(repositories.length === 0);
  const reduce = useReducedMotionSafe();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return repositories.filter(({ repository }) => {
      if (workspaceFilter !== "all" && repository.workspace_id !== workspaceFilter) return false;
      if (filter === "ready" && repository.status !== "ready") return false;
      if (filter === "indexing" && !["indexing", "queued", "running", "pending"].includes(repository.status)) return false;
      if (filter === "failed" && repository.status !== "failed") return false;
      if (!needle) return true;
      return (
        repository.full_name.toLowerCase().includes(needle) ||
        repository.description.toLowerCase().includes(needle) ||
        repository.language.toLowerCase().includes(needle)
      );
    });
  }, [repositories, query, filter, workspaceFilter]);

  const counts = {
    all: repositories.length,
    ready: repositories.filter((item) => item.repository.status === "ready").length,
    indexing: repositories.filter((item) => ["indexing", "queued", "running", "pending"].includes(item.repository.status)).length,
    failed: repositories.filter((item) => item.repository.status === "failed").length,
  };

  return (
    <div className="space-y-5">
      <Card className="shadow-card">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap items-center gap-1"
            role="tablist"
            aria-label="Filter repositories"
          >
            {(
              [
                ["all", "All"],
                ["ready", "Indexed"],
                ["indexing", "In progress"],
                ["failed", "Failed"],
              ] as const
            ).map(([value, label]) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "relative rounded-lg px-3.5 py-2 text-[0.875rem] font-medium transition-colors duration-200",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={reduce ? undefined : "repo-filter-pill"}
                      transition={{ type: "spring", stiffness: 480, damping: 42 }}
                      className="absolute inset-0 rounded-lg border border-line bg-raised"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="relative">
                    {label}{" "}
                    <span className="ml-1 font-mono text-[0.75rem] text-faint">{counts[value]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="relative">
              <span className="sr-only">Search repositories</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or language"
                className="h-10 w-56 pl-9 text-[0.875rem]"
              />
            </label>
            <Select
              aria-label="Workspace"
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
              className="h-10 w-auto min-w-44 text-[0.875rem]"
            >
              <option value="all">All workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={() => setShowConnect((value) => !value)}>
              {showConnect ? <X className="h-4 w-4" /> : <Server className="h-4 w-4" />}
              {showConnect ? "Close" : "Connect repository"}
            </Button>
          </div>
        </div>
      </Card>

      {showConnect ? (
        <ConnectPanel
          workspaces={workspaces}
          integrations={integrations}
          githubOAuthEnabled={githubOAuthEnabled}
          defaultWorkspace={workspaceFilter !== "all" ? workspaceFilter : workspaces[0]?.id}
        />
      ) : null}

      {filtered.length === 0 ? (
        <Card className="px-4 py-16 text-center">
          <FileCode2 className="mx-auto h-7 w-7 text-faint" aria-hidden="true" />
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">No repositories match</h2>
          <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
            {repositories.length === 0
              ? "Connect the bundled demo dataset or a GitHub/GitLab repository to begin indexing."
              : "Clear the search or choose a different status filter."}
          </p>
          {repositories.length === 0 && workspaces[0] ? (
            <div className="mt-6 flex justify-center">
              <DemoConnectButton workspaceID={workspaces[0].id} />
            </div>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ repository, workspaceName }) => (
            <Card key={repository.id} className="group flex flex-col card-hover">
              <div className="flex items-start justify-between gap-3 px-4 pt-5">
                <div className="min-w-0">
                  <Link
                    href={`/app/repositories/${repository.id}`}
                    className="block truncate font-mono text-[0.875rem] font-medium text-ink transition-colors hover:text-accent"
                  >
                    {repository.full_name}
                  </Link>
                  <p className="mt-1.5 text-[0.8125rem] text-faint">{workspaceName}</p>
                </div>
                <StatusBadge status={repository.status} />
              </div>
              <p className="mt-3.5 line-clamp-2 flex-1 px-4 text-[0.875rem] leading-relaxed text-muted">
                {repository.description || "No description supplied by the provider."}
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-1.5 px-4">
                <Badge>{repository.language || "unknown"}</Badge>
                {repository.provider && repository.provider !== "demo" ? (
                  <Badge>{repository.provider}</Badge>
                ) : null}
                {repository.is_demo ? <Badge tone="warning">demo dataset</Badge> : null}
                {repository.visibility === "private" ? <Badge>private</Badge> : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line px-4 py-3.5 font-mono text-[0.75rem] text-faint">
                <span>
                  <span className="block text-[0.875rem] text-ink">
                    {formatNumber(repository.file_count)}
                  </span>{" "}
                  files
                </span>
                <span>
                  <span className="block text-[0.875rem] text-ink">
                    {formatNumber(repository.symbol_count)}
                  </span>{" "}
                  symbols
                </span>
                <span>
                  <span className="block truncate text-[0.875rem] text-ink">
                    {repository.default_branch}
                  </span>{" "}
                  branch
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line px-4 py-3">
                <span className="text-[0.75rem] text-faint">
                  {repository.last_indexed_at
                    ? `Indexed ${relativeTime(repository.last_indexed_at)}`
                    : "Not indexed"}
                </span>
                <Link
                  href={`/app/repositories/${repository.id}`}
                  className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-accent transition-colors hover:text-ink"
                >
                  Open
                  <ArrowRight className="arrow-slide h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectPanel({
  workspaces,
  integrations,
  githubOAuthEnabled,
  defaultWorkspace,
}: {
  workspaces: Workspace[];
  integrations: Integration[];
  githubOAuthEnabled: boolean;
  defaultWorkspace?: string;
}) {
  const router = useRouter();
  const [workspaceID, setWorkspaceID] = useState(defaultWorkspace ?? workspaces[0]?.id ?? "");
  const [provider, setProvider] = useState<"github" | "gitlab">("github");
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [validatedAs, setValidatedAs] = useState("");
  const [providerRepos, setProviderRepos] = useState<ProviderRepository[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const connected = integrations.find((integration) => integration.provider === provider);

  async function validate() {
    setBusy("validate");
    setError("");
    setValidatedAs("");
    setProviderRepos([]);
    try {
      const result = await apiPost<{ account: string }>(`/integrations/${provider}/token`, { token: token.trim() });
      setValidatedAs(result.account);
      const list = await apiClient<ProviderRepositoriesResponse>(`/integrations/${provider}/repositories`);
      setProviderRepos(list.repositories);
      if (list.repositories.length === 0) {
        setError("The token is valid, but the provider returned no repositories.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not validate the token.");
    } finally {
      setBusy("");
    }
  }

  async function connect(repo?: ProviderRepository) {
    if (!workspaceID) {
      setError("Choose a workspace first.");
      return;
    }
    const targetOwner = repo?.owner ?? owner.trim();
    const targetName = repo?.name ?? name.trim();
    if (!targetOwner || !targetName) {
      setError("Enter the repository owner and name, or choose one from the provider list.");
      return;
    }
    setBusy(repo ? `connect-${repo.full_name}` : "connect");
    setError("");
    try {
      const result = await apiPost<{ repository: Repository; job: Job }>("/repositories", {
        workspace_id: workspaceID,
        provider,
        owner: targetOwner,
        name: targetName,
        branch: branch.trim() || repo?.default_branch || "",
        description: repo?.description ?? "",
        language: repo?.language ?? "",
        private: repo?.private ?? false,
        html_url: repo?.html_url ?? "",
        external_id: repo?.external_id ?? "",
      });
      router.push(`/app/repositories/${result.repository.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the repository.");
      setBusy("");
    }
  }

  if (workspaces.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink">Create a workspace first</h2>
        <p className="mt-2 text-[0.9375rem] text-muted">
          Repositories belong to a workspace, which defines access.
        </p>
        <Link
          href="/app/workspaces"
          className="mt-4 inline-block text-[0.9375rem] font-semibold text-accent hover:underline"
        >
          Go to workspaces
        </Link>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-card">
      <div className="border-b border-line px-4 py-5">
        <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
          Connect a repository
        </h2>
        <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-muted">
          The bundled demo needs no credentials. GitHub and GitLab require read access. Tokens are
          validated against the provider and sealed at rest before indexing starts.
        </p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-canvas p-4">
          <div className="flex items-center gap-2.5">
            <Badge tone="warning">demo</Badge>
            <h3 className="text-[0.9375rem] font-semibold text-ink">Bundled dataset</h3>
          </div>
          <p className="mt-2.5 text-[0.875rem] leading-relaxed text-muted">
            A small TypeScript notes service with authentication, tests and a deliberately retained
            bug. Commit and PR metadata are fixtures and are labelled in the interface.
          </p>
          <div className="mt-4 flex items-end gap-2">
            <Field label="Workspace" htmlFor="demo-workspace" className="flex-1">
              <Select
                id="demo-workspace"
                value={workspaceID}
                onChange={(event) => setWorkspaceID(event.target.value)}
                className="h-10"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </Select>
            </Field>
            <DemoConnectButton workspaceID={workspaceID} size="sm" variant="secondary" label="Connect demo" />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {provider === "github" ? (
              <GitFork className="h-4 w-4 text-accent" aria-hidden="true" />
            ) : (
              <GitBranch className="h-4 w-4 text-accent" aria-hidden="true" />
            )}
            <h3 className="text-[0.9375rem] font-semibold text-ink">Git provider</h3>
            {connected ? (
              <Badge tone="success">connected as {connected.account_login}</Badge>
            ) : null}
          </div>

          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            <Field label="Provider" htmlFor="provider">
              <Select
                id="provider"
                value={provider}
                className="h-10"
                onChange={(event) => {
                  setProvider(event.target.value as "github" | "gitlab");
                  setProviderRepos([]);
                  setValidatedAs("");
                }}
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </Select>
            </Field>
            <Field label="Workspace" htmlFor="provider-workspace">
              <Select
                id="provider-workspace"
                value={workspaceID}
                className="h-10"
                onChange={(event) => setWorkspaceID(event.target.value)}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {provider === "github" && githubOAuthEnabled && !connected ? (
            <a
              href="/api/lk/integrations/github/authorize"
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-raised px-3.5 text-[0.875rem] text-ink transition-colors duration-150 hover:border-line-strong"
            >
              <GitFork className="h-4 w-4" aria-hidden="true" /> Authorize with GitHub
            </a>
          ) : null}

          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field
              label={connected ? "Replace access token (optional)" : "Personal access token"}
              htmlFor="provider-token"
              hint="Read-only scopes are sufficient. The token is never returned to the browser."
            >
              <Input
                id="provider-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="••••••••••••••••"
                autoComplete="off"
                className="h-10"
              />
            </Field>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={busy === "validate"}
              disabled={!token.trim()}
              onClick={validate}
            >
              Validate token
            </Button>
          </div>

          {validatedAs ? (
            <p className="mt-2.5 text-[0.875rem] text-success">Token accepted for {validatedAs}.</p>
          ) : null}
        </div>
      </div>

      {providerRepos.length > 0 ? (
        <div className="border-t border-line px-4 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[0.9375rem] font-semibold text-ink">Choose a repository</h3>
            <span className="font-mono text-[0.75rem] text-faint">
              {providerRepos.length} available
            </span>
          </div>
          <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-line">
            <ul className="divide-y divide-line">
              {providerRepos.map((repo) => (
                <li
                  key={repo.full_name}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-raised/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[0.875rem] text-ink">{repo.full_name}</p>
                    <p className="mt-1 truncate text-[0.75rem] text-faint">
                      {repo.language || "unknown"} · {repo.default_branch} ·{" "}
                      {repo.private ? "private" : "public"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={busy === `connect-${repo.full_name}`}
                    onClick={() => connect(repo)}
                  >
                    Connect
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="border-t border-line px-4 py-5">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.875rem] font-medium text-muted transition-colors hover:text-ink">
            <ChevronDown className="h-4 w-4 group-open:hidden" aria-hidden="true" />
            <ChevronUp className="hidden h-4 w-4 group-open:block" aria-hidden="true" />
            Connect by owner and repository name instead
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_0.8fr_auto] sm:items-end">
            <Field label="Owner" htmlFor="repo-owner">
              <Input
                id="repo-owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="acme"
                className="h-10"
              />
            </Field>
            <Field label="Repository" htmlFor="repo-name">
              <Input
                id="repo-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="platform"
                className="h-10"
              />
            </Field>
            <Field label="Branch" htmlFor="repo-branch" hint="Defaults to the provider default branch.">
              <Input
                id="repo-branch"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
                className="h-10"
              />
            </Field>
            <Button type="button" size="sm" loading={busy === "connect"} onClick={() => connect()}>
              Connect
            </Button>
          </div>
        </details>
      </div>

      {error ? (
        <p className="border-t border-line bg-danger/5 px-4 py-3 text-[0.875rem] text-danger">{error}</p>
      ) : null}
    </Card>
  );
}
