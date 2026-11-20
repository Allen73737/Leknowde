import { redirect } from "next/navigation";

import { ApiErrorNote } from "@/components/app/error-note";
import { SettingsForms } from "@/components/app/settings-forms";
import { SectionHeading } from "@/components/ui/card";
import { getWorkspaces } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { MeResponse } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [me, workspaceResult] = await Promise.all([safeGet<MeResponse>("/auth/me"), getWorkspaces()]);

  if (!me.data) {
    if (me.error.status === 401) redirect("/login");
    return (
      <div className="space-y-4">
        <SectionHeading title="Settings" />
        <ApiErrorNote error={me.error} retryHref="/app/settings" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Settings"
        description="Profile, stored preferences, password recovery and account deletion. Changes take effect immediately and are written to the audit log."
      />
      <SettingsForms me={me.data} workspaces={workspaceResult.data?.workspaces ?? []} />
    </div>
  );
}
