"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import { cn, formatNumber, languageColor, relativeTime } from "@/lib/format";
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
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 px-3.5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap items-center gap-0.5"
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
                    "relative rounded-[5px] border px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors duration-150",
                    active
                      ? "border-line bg-raised text-ink"
                      : "border-transparent text-muted hover:bg-raised/50 hover:text-ink",
                  )}
                >
                  <span className="relative">
                    {label}
                    <span className="ml-1.5 tabular font-mono text-[0.75rem] text-faint">{counts[value]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative">
              <span className="sr-only">Search repositories</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or language"
                className="h-8 w-52 pl-8 text-[0.8125rem]"
              />
            </label>
            <Select
              aria-label="Workspace"
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
              className="h-8 w-auto min-w-40 text-[0.8125rem]"
            >
              <option value="all">All workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={() => setShowConnect((value) => !value)}>
              {showConnect ? <X className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
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
        <Card className="px-6 py-12 text-center">
          <FileCode2 className="mx-auto h-6 w-6 text-faint" aria-hidden="true" />
          <h2 className="mt-3 font-display text-[1.125rem] font-semibold tracking-[-0.02em] text-ink">
            No repositories match
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-muted">
            {repositories.length === 0
              ? "Connect the bundled demo dataset or a GitHub/GitLab repository to begin indexing."
              : "Clear the search or choose a different status filter."}
          </p>
          {repositories.length === 0 && workspaces[0] ? (
            <div className="mt-5 flex justify-center">
              <DemoConnectButton workspaceID={workspaces[0].id} />
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div
            className="hidden grid-cols-[minmax(0,1fr)_10rem_8rem_9rem] gap-4 border-b border-line bg-shell/50 px-4 py-2 lg:grid"
            aria-hidden="true"
          >
            <span className="meta-label">Repository</span>
            <span className="meta-label">Workspace</span>
            <span className="meta-label">Structure</span>
            <span className="meta-label">State</span>
          </div>
          <ul className="divide-y divide-line/70">
            {filtered.map(({ repository, workspaceName }) => (
              <li key={repository.id}>
                <Link
                  href={`/app/repositories/${repository.id}`}
                  className="group grid gap-3 px-4 py-3 transition-colors duration-150 hover:bg-raised/40 lg:grid-cols-[minmax(0,1fr)_10rem_8rem_9rem] lg:items-center lg:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-[0.8125rem] font-medium text-ink transition-colors group-hover:text-accent">
                        {repository.full_name}
                      </span>
                      {repository.is_demo ? <Badge tone="warning">demo</Badge> : null}
                      {repository.visibility === "private" ? <Badge>private</Badge> : null}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[0.75rem] leading-relaxed text-faint">
                      {repository.description || "No description supplied by the provider."}
                    </p>
                  </div>

                  <div className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: languageColor(repository.language) }}
                    />
                    <span className="truncate">{workspaceName}</span>
                    <span className="text-line-strong" aria-hidden="true">
                      /
                    </span>
                    <span className="shrink-0 font-mono text-[0.75rem] text-faint">
                      {repository.language || "unknown"}
                    </span>
                  </div>

                  <div className="min-w-0 text-[0.75rem] text-muted">
                    <p className="tabular truncate font-mono">
                      {formatNumber(repository.file_count)} files
                    </p>
                    <p className="tabular mt-0.5 truncate font-mono text-faint">
                      {formatNumber(repository.symbol_count)} symbols
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <div className="min-w-0 text-right">
                      <StatusBadge status={repository.status} />
                      <p className="mt-1 truncate text-[0.75rem] text-faint">
                        {repository.last_indexed_at
                          ? relativeTime(repository.last_indexed_at)
                          : "Not indexed"}
                      </p>
                    </div>
                    <ArrowRight
                      className="arrow-slide h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-accent"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
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
