import { ApiErrorNote, NotIndexedNotice } from "@/components/app/error-note";
import { Explorer } from "@/components/repo/explorer";
import { getRepositoryBundle } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { TreeResponse } from "@/lib/types";

export const metadata = { title: "Explorer" };

export default async function ExplorerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ path?: string; line?: string }>;
}) {
  const { id } = await params;
  const { path, line } = await searchParams;
  const bundle = await getRepositoryBundle(id);

  if (!bundle.data) {
    return <ApiErrorNote error={bundle.error} retryHref={`/app/repositories/${id}/explorer`} />;
  }
  if (bundle.data.repository.status !== "ready") {
    return <NotIndexedNotice repositoryID={id} status={bundle.data.repository.status} />;
  }

  const tree = await safeGet<TreeResponse>(`/repositories/${id}/tree`);
  if (!tree.data) {
    return <ApiErrorNote error={tree.error} retryHref={`/app/repositories/${id}/explorer`} title="File tree unavailable" />;
  }

  return (
    <Explorer
      repositoryID={id}
      tree={tree.data.tree}
      files={tree.data.files}
      initialPath={path}
      initialLine={line ? Number(line) : undefined}
    />
  );
}
