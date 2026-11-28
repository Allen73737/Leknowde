import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { ReadmeStudio } from "@/components/repo/readme-studio";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { ReadmeResponse } from "@/lib/types";

export const metadata = { title: "README" };

export default async function ReadmePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/readme`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const result = await safeGet<ReadmeResponse>(`/repositories/${id}/readme`);
  if (!result.data) {
    return <ApiErrorNote error={result.error} retryHref={`/app/repositories/${id}/readme`} title="README unavailable" />;
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Document"
        title="README and About"
        description="A publishable README and GitHub About panel generated from the index: languages, manifests, endpoints, entities and structure. Facts are computed; the draft is never copied from a live provider."
      />
      <ReadmeStudio repositoryID={id} initial={result.data} />
    </div>
  );
}
