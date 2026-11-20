import { ApiErrorNote } from "@/components/app/error-note";
import { RepositoryBrowser } from "@/components/repo/repository-browser";
import { SectionHeading } from "@/components/ui/card";
import { getRepositoriesForWorkspace, getWorkspaces } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { IntegrationsResponse, Repository } from "@/lib/types";

export const metadata = { title: "Repositories" };

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { workspace: workspaceQuery } = await searchParams;
  const [workspacesResult, integrationsResult] = await Promise.all([
    getWorkspaces(),
    safeGet<IntegrationsResponse>("/integrations"),
  ]);

  if (!workspacesResult.data) {
    return (
      <div className="space-y-4">
        <SectionHeading title="Repositories" />
        <ApiErrorNote error={workspacesResult.error} retryHref="/app/repositories" />
      </div>
    );
  }

  const workspaces = workspacesResult.data.workspaces;
  const repoLists = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspace,
      result: await getRepositoriesForWorkspace(workspace.id),
    })),
  );

  const repositories: { repository: Repository; workspaceName: string }[] = [];
  for (const { workspace, result } of repoLists) {
    for (const repository of result.data?.repositories ?? []) {
      repositories.push({ repository, workspaceName: workspace.name });
    }
  }
  repositories.sort((a, b) => b.repository.updated_at.localeCompare(a.repository.updated_at));

  const initialWorkspace = workspaceQuery && workspaces.some((workspace) => workspace.id === workspaceQuery)
    ? workspaceQuery
    : undefined;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Repositories"
        description="Connect a source, index a branch, then inspect its structure. Indexing is the only step that fetches code; analysis never executes it."
      />
      <RepositoryBrowser
        workspaces={workspaces}
        repositories={repositories}
        integrations={integrationsResult.data?.integrations ?? []}
        githubOAuthEnabled={integrationsResult.data?.github_oauth_enabled ?? false}
        initialWorkspace={initialWorkspace}
      />
    </div>
  );
}
