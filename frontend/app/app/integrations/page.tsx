import { ShieldCheck } from "lucide-react";

import { ApiErrorNote } from "@/components/app/error-note";
import { IntegrationManager } from "@/components/app/integration-manager";
import { SectionHeading } from "@/components/ui/card";
import { safeGet } from "@/lib/server-api";
import type { IntegrationsResponse } from "@/lib/types";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const result = await safeGet<IntegrationsResponse>("/integrations");

  if (!result.data) {
    return (
      <div className="space-y-4">
        <SectionHeading title="Integrations" />
        <ApiErrorNote error={result.error} retryHref="/app/integrations" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Integrations"
        description="Provider connections are organization-scoped. The stored token is used to list repositories and download a branch for indexing; tests and analysis never execute it."
        action={<ShieldCheck className="h-4 w-4 text-faint" aria-hidden="true" />}
      />
      <IntegrationManager
        initialIntegrations={result.data.integrations}
        githubOAuthEnabled={result.data.github_oauth_enabled}
        connectedProvider={connected}
        oauthError={error}
      />
    </div>
  );
}
