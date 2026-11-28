"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitFork,
  KeyRound,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Unplug,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { apiClient, apiDelete, apiPost } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import type { Integration, IntegrationsResponse } from "@/lib/types";

const providers = [
  {
    id: "github",
    name: "GitHub",
    icon: GitFork,
    tokenURL: "https://github.com/settings/tokens",
    scopes: "repo, read:user",
    note: "A classic personal access token with repository read access. Fine-grained tokens also work when they can read the repository contents and metadata.",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: GitBranch,
    tokenURL: "https://gitlab.com/-/user_settings/personal_access_tokens",
    scopes: "read_api, read_repository",
    note: "A personal access token with read_api and read_repository. Self-hosted GitLab is not supported by this build.",
  },
] as const;

export function IntegrationManager({
  initialIntegrations,
  githubOAuthEnabled,
  connectedProvider,
  oauthError,
}: {
  initialIntegrations: Integration[];
  githubOAuthEnabled: boolean;
  connectedProvider?: string;
  oauthError?: string;
}) {
  const router = useRouter();
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [token, setToken] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const byProvider = new Map(integrations.map((integration) => [integration.provider, integration]));

  async function refresh() {
    const result = await apiClient<IntegrationsResponse>("/integrations");
    setIntegrations(result.integrations ?? []);
  }

  async function connect(provider: string) {
    const value = token[provider]?.trim();
    if (!value) {
      setError("Paste a personal access token first.");
      return;
    }
    setBusy(provider);
    setError("");
    setMessage("");
    try {
      await apiPost(`/integrations/${provider}/token`, { token: value });
      setToken((current) => ({ ...current, [provider]: "" }));
      await refresh();
      setMessage(`${provider} credentials verified and stored.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The provider rejected the connection.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: string) {
    setBusy(provider);
    setError("");
    setMessage("");
    try {
      await apiDelete(`/integrations/${provider}`);
      await refresh();
      setConfirming(null);
      setMessage(`${provider} credentials removed for this organization.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the integration.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {connectedProvider ? (
        <InlineNotice tone="success" title={`${connectedProvider} connected`}>
          The OAuth exchange completed and the token was stored encrypted. Return to repositories to pick one from the
          provider list.
        </InlineNotice>
      ) : null}
      {oauthError ? (
        <InlineNotice tone="danger" title="OAuth did not complete">
          The provider returned <span className="font-mono">{oauthError}</span>. Nothing was stored. You can retry, or
          connect with a personal access token instead.
        </InlineNotice>
      ) : null}
      {message ? (
        <InlineNotice tone="success" title="Integration updated">
          {message}
        </InlineNotice>
      ) : null}
      {error ? (
        <InlineNotice tone="danger" title="Integration request failed">
          {error}
        </InlineNotice>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {providers.map((provider) => {
          const integration = byProvider.get(provider.id);
          const Icon = provider.icon;
          const isBusy = busy === provider.id;
          return (
            <section key={provider.id} className="rounded-card border border-line bg-surface">
              <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border border-line bg-canvas text-ink">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {provider.name}
                      {integration ? <Badge tone="success">connected</Badge> : <Badge>not connected</Badge>}
                    </h2>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                      {integration
                        ? `Authorized as ${integration.account_login || "unknown account"}.`
                        : "Connect once to list and index repositories from this provider."}
                    </p>
                  </div>
                </div>
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin text-faint" aria-hidden="true" /> : null}
              </div>

              {integration ? (
                <div className="space-y-3 px-4 py-4">
                  <dl className="grid grid-cols-2 gap-3 text-[0.8125rem]">
                    <div>
                      <dt className="text-[0.75rem] uppercase tracking-[0.1em] text-faint">Account</dt>
                      <dd className="mt-0.5 truncate font-mono text-ink">{integration.account_login || "unknown"}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.75rem] uppercase tracking-[0.1em] text-faint">Scopes</dt>
                      <dd className="mt-0.5 truncate font-mono text-ink">{integration.scopes || "not reported"}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.75rem] uppercase tracking-[0.1em] text-faint">Connected</dt>
                      <dd className="mt-0.5 font-mono text-ink">{formatDateTime(integration.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.75rem] uppercase tracking-[0.1em] text-faint">Expires</dt>
                      <dd className="mt-0.5 font-mono text-ink">
                        {integration.expires_at ? formatDateTime(integration.expires_at) : "no expiry reported"}
                      </dd>
                    </div>
                  </dl>

                  {confirming === provider.id ? (
                    <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2.5">
                      <p className="text-[0.8125rem] leading-relaxed text-danger">
                        Removing this connection deletes the stored token for the whole organization. Repositories that
                        were already indexed keep their code until deleted.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          loading={isBusy}
                          onClick={() => void disconnect(provider.id)}
                        >
                          Confirm disconnect
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirming(provider.id)}
                      disabled={isBusy}
                    >
                      <Unplug className="h-3.5 w-3.5" aria-hidden="true" /> Disconnect
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 px-4 py-4">
                  {provider.id === "github" ? (
                    githubOAuthEnabled ? (
                      <div className="rounded-md border border-line bg-canvas px-3 py-2.5">
                        <p className="text-[0.8125rem] font-medium text-ink">Authorize with GitHub OAuth</p>
                        <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
                          You will leave LeKnowde for GitHub, approve read access, then return here.
                        </p>
                        <a
                          href="/api/lk/integrations/github/authorize"
                          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink hover:border-accent hover:text-accent"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Continue to GitHub
                        </a>
                      </div>
                    ) : (
                      <div className="rounded-md border border-line bg-canvas px-3 py-2.5">
                        <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
                          <TriangleAlert className="h-3.5 w-3.5 text-faint" aria-hidden="true" /> GitHub OAuth is not configured
                        </p>
                        <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
                          Set <span className="font-mono">GITHUB_CLIENT_ID</span> and{" "}
                          <span className="font-mono">GITHUB_CLIENT_SECRET</span> on the API to enable it. A personal
                          access token works without OAuth.
                        </p>
                      </div>
                    )
                  ) : null}

                  <div>
                    <Label htmlFor={`token-${provider.id}`}>Personal access token</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`token-${provider.id}`}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={token[provider.id] ?? ""}
                        onChange={(event) =>
                          setToken((current) => ({ ...current, [provider.id]: event.target.value }))
                        }
                        placeholder={provider.id === "github" ? "ghp_…" : "glpat-…"}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        loading={isBusy}
                        onClick={() => void connect(provider.id)}
                        disabled={isBusy || !(token[provider.id] ?? "").trim()}
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Verify
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">{provider.note}</p>
                    <a
                      href={provider.tokenURL}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[0.75rem] text-accent hover:underline"
                    >
                      Create a token at {provider.name} <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                    </a>
                  </div>

                  <p className="rounded border border-line bg-canvas px-2.5 py-2 font-mono text-[0.75rem] leading-relaxed text-faint">
                    expected scopes: {provider.scopes}
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface px-4 py-4">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" /> How credentials are handled
          </h2>
          <ul className="mt-2 space-y-1.5 text-[0.8125rem] leading-relaxed text-muted">
            <li>Tokens are verified against the provider before they are stored.</li>
            <li>The API encrypts them with AES-256-GCM and never returns the secret in a response.</li>
            <li>Repositories are fetched through the provider API. LeKnowde does not run repository code.</li>
            <li>Disconnecting deletes the organization&apos;s stored token for that provider.</li>
          </ul>
        </section>

        <section className="rounded-card border border-line bg-surface px-4 py-4">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-ink">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> What a connection enables
          </h2>
          <ul className="mt-2 space-y-1.5 text-[0.8125rem] leading-relaxed text-muted">
            <li>Browsing the provider&apos;s repository list when connecting a repository.</li>
            <li>Fetching a branch tarball for indexing — the only step that downloads source.</li>
            <li>Reading pull-request metadata for review analysis when a repository is indexed.</li>
          </ul>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-faint">
            Listing repositories and merge requests is read-only. LeKnowde does not push commits or post comments with
            this build.
          </p>
        </section>
      </div>
    </div>
  );
}
