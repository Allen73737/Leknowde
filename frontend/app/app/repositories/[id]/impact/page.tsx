import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { ImpactConsole } from "@/components/repo/impact-console";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { ImpactListResponse } from "@/lib/types";

export const metadata = { title: "Change impact" };

export default async function ImpactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/impact`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const reports = await safeGet<ImpactListResponse>(`/repositories/${id}/impact`);

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Change impact"
        description="What a change touches, what tests exist, and how much risk the static evidence supports — with every factor exposed."
      />
      {!reports.data ? (
        <ApiErrorNote error={reports.error} retryHref={`/app/repositories/${id}/impact`} title="Impact reports unavailable" />
      ) : (
        <ImpactConsole repositoryID={id} initialReports={reports.data.reports ?? []} />
      )}
    </div>
  );
}
