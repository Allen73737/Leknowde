import { Activity, Info, ShieldCheck, Users } from "lucide-react";

import { ApiErrorNote } from "@/components/app/error-note";
import { AuditTable } from "@/components/app/audit-table";
import { Card, CardHeader, SectionHeading, Stat } from "@/components/ui/card";
import { safeGet } from "@/lib/server-api";
import type { AuditLog } from "@/lib/types";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const result = await safeGet<{ logs: AuditLog[] }>("/audit-logs?limit=300");

  if (!result.data) {
    return (
      <div className="space-y-4">
        <SectionHeading title="Audit log" />
        <ApiErrorNote error={result.error} retryHref="/app/audit" />
      </div>
    );
  }

  const logs = result.data.logs ?? [];
  const actors = new Set(logs.map((log) => log.actor_email).filter(Boolean));
  const integrationEvents = logs.filter((log) => log.action.startsWith("integration.")).length;
  const workspaceEvents = logs.filter((log) => log.action.startsWith("workspace.")).length;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Audit log"
        description="Server-recorded actions for this organization. Each row names the actor, the target, the client IP and the request time. This is an operational log, not a signed or tamper-evident ledger."
        action={<ShieldCheck className="h-4 w-4 text-faint" aria-hidden="true" />}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat label="Events" value={logs.length} hint="Most recent 300" />
        <Stat label="Actors" value={actors.size} hint="Distinct recorded emails" />
        <Stat label="Integration changes" value={integrationEvents} hint="Connect, disconnect, OAuth" />
        <Stat label="Workspace changes" value={workspaceEvents} hint="Create, update, membership" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <AuditTable logs={logs} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="What is recorded"
              description="Written by the API inside the request that performs the action."
              icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="space-y-1.5 px-4 py-3.5 text-[0.8125rem] leading-relaxed text-muted">
              <li>Authentication: sign-in, sign-out, password reset.</li>
              <li>Workspaces: create, update, delete, member add/remove.</li>
              <li>Repositories: connect, delete, indexing start, document publish.</li>
              <li>Integrations: token connect, OAuth connect, disconnect.</li>
              <li>Account: profile update and account deletion.</li>
            </ul>
            <div className="border-t border-line px-4 py-3">
              <p className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-faint">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Metadata may contain IDs and non-secret settings. Provider tokens, passwords and reset tokens are never
                written to the audit metadata.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Retention and access"
              description="No retention job is configured in this build."
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
            />
            <div className="px-4 py-3.5 text-[0.8125rem] leading-relaxed text-muted">
              <p>
                Any authenticated member of the organization can read these events. Rows persist until the database is
                cleaned; there is no automatic expiry, export or external SIEM forwarding.
              </p>
              <p className="mt-2 text-[0.75rem] text-faint">
                Account deletion is a soft delete: the user row is anonymized and credentials are revoked, so earlier
                audit rows remain and join to an anonymous address rather than a live account.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
