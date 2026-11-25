import { TestSelectionForm } from "@/components/repo/test-select-form";
import { getRepositoryBundle } from "@/lib/app-data";
import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";

export default async function TestSelectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getRepositoryBundle(id);
  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/test-select`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }
  return <TestSelectionForm repositoryID={id} />;
}
