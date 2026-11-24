import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { PullRequestConsole } from "@/components/repo/pull-request-console";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { PullRequestsResponse } from "@/lib/types";

export const metadata = { title: "Pull requests" };

export default async function PullRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/pull-requests`} />;
  }

  const result = await safeGet<PullRequestsResponse>(`/repositories/${id}/pull-requests?state=open`);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Pull requests"
        description="Analyse a diff against the indexed graph: blast radius, missing tests and a transparent risk score. Diff text is untrusted data and is never executed."
      />
      {bundle.data.repository.status !== "ready" ? (
        <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />
      ) : !result.data ? (
        <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/pull-requests`} title="Pull requests unavailable" />
      ) : (
        <PullRequestConsole repositoryID={id} initial={result.data} />
      )}
    </div>
  );
}
