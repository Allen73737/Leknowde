import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { GraphView } from "@/components/graph/graph-view";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { GraphResponse } from "@/lib/types";

export const metadata = { title: "Architecture" };

export default async function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/architecture`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<GraphResponse>(`/repositories/${id}/graph?view=architecture&limit=500`);
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/architecture`} title="Graph unavailable" />;
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Structure"
        title="Architecture"
        description="A graph of modules, services, APIs and entities. Switch projections without losing the repository context. Node placement is deterministic; it is not a force-directed guess."
      />
      <GraphView repositoryID={id} initialGraph={result.data.graph} initialView="architecture" />
    </div>
  );
}
