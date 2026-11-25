import { GitBranch, GitPullRequest, Link, Play, RefreshCw } from "lucide-react";

import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, MetricBand, SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { safeGet } from "@/lib/server-api";
import type { Contract, ContractLink, ContractSurface } from "@/lib/types";

export const metadata = { title: "Contracts" };

interface ContractsPageData {
  producers: Contract[];
  consumers: Contract[];
  links: ContractLink[];
  totals: { producers: number; consumers: number };
  analyzed_at: string;
  limitations: string[];
}

export default async function ContractsPage({
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
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/contracts`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<ContractSurface>(
    `/repositories/${id}/contracts?branch=${encodeURIComponent(branch ?? bundle.data.repository.default_branch)}`,
  );
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/contracts`} title="Contracts unavailable" />;
  }

  const { producers, consumers, links, totals, analyzed_at, limitations } = result.data;
  const crossRepo = (links ?? []).filter((l) => l.cross_repository);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="API contracts"
        description="Declared routes (producers) matched to client call sites (consumers), computed from the indexed graph. Matching is structural — method plus normalised path — so request and response schemas are not compared."
        action={
          <a href={`/app/repositories/${id}/contracts?branch=${encodeURIComponent(bundle.data.repository.default_branch)}`} className="inline-flex items-center gap-1 rounded border border-line bg-surface px-3 py-2 text-[0.8125rem] text-muted hover:border-accent hover:text-accent">
            <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
            Refresh
          </a>
        }
      />

      <MetricBand
        items={[
          { label: "Producers", value: formatNumber(totals.producers), hint: "Route declarations" },
          { label: "Consumers", value: formatNumber(totals.consumers), hint: "Client call sites" },
          { label: "Links", value: formatNumber(links.length), hint: "Matched producer → consumer" },
          {
            label: "Cross-repo",
            value: formatNumber(crossRepo.length),
            hint: "Links spanning repositories",
            tone: crossRepo.length > 0 ? "warning" : "default",
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader
            title="Producers (EXPOSES)"
            description="Routes declared in this repository."
            icon={<GitBranch className="h-4 w-4" aria-hidden="true" />}
          />
          {producers.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              No producers were detected. Index the repository first.
            </p>
          ) : (
            <ul className="divide-y divide-line max-h-[64vh] overflow-y-auto">
              {producers.slice(0, 30).map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[0.8125rem] text-ink truncate">
                        {c.method} {c.path}
                      </p>
                      <p className="text-[0.75rem] text-muted truncate">
                        {c.file_path}:{c.line}
                      </p>
                    </div>
                    <Badge>{c.source}</Badge>
                  </div>
                </li>
              ))}
              {producers.length > 30 && (
                <p className="px-5 py-3 text-[0.8125rem] text-faint">
                  {producers.length - 30} more producers not shown.
                </p>
              )}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Consumers (CONSUMES)"
            description="Client call sites that reference a route."
            icon={<Play className="h-4 w-4" aria-hidden="true" />}
          />
          {consumers.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              No consumers were detected.
            </p>
          ) : (
            <ul className="divide-y divide-line max-h-[64vh] overflow-y-auto">
              {consumers.slice(0, 30).map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[0.8125rem] text-ink truncate">
                        {c.method} {c.path}
                      </p>
                      <p className="text-[0.75rem] text-muted truncate">
                        {c.file_path}:{c.line}
                      </p>
                    </div>
                    <Badge>{c.source}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Matched links"
            description="Producer → consumer relationships. Cross-repo links span repository boundaries."
            icon={<Link className="h-4 w-4" aria-hidden="true" />}
          />
          {links.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">
              No links were matched.
            </p>
          ) : (
            <ul className="divide-y divide-line max-h-[64vh] overflow-y-auto">
              {links.slice(0, 30).map((l) => (
                <li key={`${l.producer_file}-${l.consumer_file}-${l.operation}`} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[0.8125rem] text-ink truncate">
                        {l.method} {l.path}
                      </p>
                      <p className="text-[0.75rem] text-muted truncate">
                        {l.producer_file} → {l.consumer_file}
                      </p>
                    </div>
                    <Badge tone={l.cross_repository ? "warning" : "neutral"}>
                      {Math.round(l.confidence * 100)}% {l.match}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {crossRepo.length > 0 && (
            <div className="mt-auto border-t border-line px-5 py-3">
              <p className="text-[0.75rem] font-medium text-faint">{crossRepo.length} cross-repository link(s)</p>
              <ul className="mt-1.5 space-y-1">
                {crossRepo.slice(0, 5).map((l) => (
                  <li key={l.operation} className="flex items-center justify-between gap-3 text-[0.75rem]">
                    <span className="min-w-0 truncate text-muted">{l.producer_repository_name}</span>
                    <span className="font-mono text-[0.75rem] text-muted">{l.method} {l.path}</span>
                    <span className="text-[0.75rem] text-muted truncate">{l.consumer_repository_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Unmatched consumers"
            description="Call sites with no matching declared route on this branch."
            icon={<GitPullRequest className="h-4 w-4" aria-hidden="true" />}
          />
          {result.data.unmatched_consumers.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">All consumers matched.</p>
          ) : (
            <ul className="divide-y divide-line">
              {result.data.unmatched_consumers.slice(0, 12).map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[0.8125rem] text-ink truncate">{c.method} {c.path}</p>
                      <p className="text-[0.75rem] text-muted truncate">{c.file_path}:{c.line}</p>
                    </div>
                    <Badge>{c.repository_name}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Orphan producers"
            description="Declared routes with no matching consumer call site."
          />
          {result.data.orphan_producers.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.875rem] text-faint">No orphans.</p>
          ) : (
            <ul className="divide-y divide-line">
              {result.data.orphan_producers.slice(0, 12).map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[0.8125rem] text-ink truncate">{c.method} {c.path}</p>
                      <p className="text-[0.75rem] text-muted truncate">{c.file_path}:{c.line}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {limitations.length > 0 && (
        <Card>
          <CardHeader title="Limitations" description="Stated explicitly so matches are not over-read." />
          <ul className="space-y-2.5 px-5 py-4">
            {limitations.map((limitation) => (
              <li key={limitation} className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-muted">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                {limitation}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-[0.75rem] text-faint">
        Computed from the index at {analyzed_at ? formatDateTime(analyzed_at) : "unknown"}.
      </p>
    </div>
  );
}
