import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { DocumentationStudio } from "@/components/repo/documentation-studio";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { DocumentsResponse } from "@/lib/types";

export const metadata = { title: "Documentation" };

export default async function DocumentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/documentation`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<DocumentsResponse>(`/repositories/${id}/documents`);
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/documentation`} title="Documents unavailable" />;
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Documentation"
        description="Readmes, architecture notes, API references, onboarding guides and ADR scaffolds generated from indexed structure. Drift is reported when facts move."
      />
      <DocumentationStudio
        repositoryID={id}
        initialDocuments={result.data.documents ?? []}
        kinds={result.data.kinds ?? []}
      />
    </div>
  );
}
