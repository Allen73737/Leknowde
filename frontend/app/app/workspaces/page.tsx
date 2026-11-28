import { ApiErrorNote } from "@/components/app/error-note";
import { SectionHeading } from "@/components/ui/card";
import { WorkspaceManager, type WorkspaceBundle } from "@/components/workspaces/workspace-manager";
import { getWorkspace, getWorkspaces } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { MembersResponse } from "@/lib/types";

export const metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const result = await getWorkspaces();

  if (!result.data) {
    return (
      <div className="space-y-5">
        <SectionHeading title="Workspaces" />
        <ApiErrorNote error={result.error} retryHref="/app/workspaces" />
      </div>
    );
  }

  const bundles: WorkspaceBundle[] = await Promise.all(
    result.data.workspaces.map(async (workspace) => {
      const [detail, members] = await Promise.all([
        getWorkspace(workspace.id),
        safeGet<MembersResponse>(`/workspaces/${workspace.id}/members`),
      ]);
      return {
        workspace: detail.data?.workspace ?? workspace,
        repositories: detail.data?.repositories ?? [],
        members: members.data?.members ?? [],
        error: detail.error?.message,
      };
    }),
  );

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Access"
        title="Workspaces"
        description="A workspace is the access boundary for repositories, members, audit records and provider integrations."
        meta={[
          { label: "Workspaces", value: String(bundles.length).padStart(2, "0") },
          {
            label: "Repositories",
            value: String(bundles.reduce((total, bundle) => total + bundle.repositories.length, 0)).padStart(2, "0"),
          },
          {
            label: "Members",
            value: String(bundles.reduce((total, bundle) => total + bundle.members.length, 0)).padStart(2, "0"),
          },
        ]}
      />
      <WorkspaceManager initial={bundles} />
    </div>
  );
}
