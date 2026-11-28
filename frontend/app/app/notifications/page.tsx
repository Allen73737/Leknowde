import { Bell, Info, MailX } from "lucide-react";

import { ApiErrorNote } from "@/components/app/error-note";
import { NotificationList } from "@/components/app/notification-list";
import { Card, CardHeader, SectionHeading } from "@/components/ui/card";
import { safeGet } from "@/lib/server-api";
import type { NotificationsResponse } from "@/lib/types";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const result = await safeGet<NotificationsResponse>("/notifications");

  if (!result.data) {
    return (
      <div className="space-y-5">
        <SectionHeading title="Notifications" />
        <ApiErrorNote error={result.error} retryHref="/app/notifications" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Inbox"
        title="Notifications"
        description="Indexing outcomes and workspace membership changes recorded for your account. These are platform events, not model output."
        action={<Bell className="h-4 w-4 text-faint" aria-hidden="true" />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[1.6fr_1fr]">
        <NotificationList initial={result.data.notifications} />

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="What generates a notification"
              description="Only server-side events with a known recipient."
              icon={<Info className="h-4 w-4" aria-hidden="true" />}
            />
            <ul className="space-y-2 px-5 py-4 text-[0.8125rem] leading-relaxed text-muted">
              <li>
                <span className="font-medium text-ink">Indexing complete.</span> Sent to the workspace owner with the
                file and symbol counts actually written.
              </li>
              <li>
                <span className="font-medium text-ink">Added to a workspace.</span> Sent to the existing account that
                was granted membership.
              </li>
            </ul>
            <p className="border-t border-line px-5 py-3 text-[0.75rem] leading-relaxed text-faint">
              Job failures are visible in the repository header and job log. They do not currently create a separate
              notification row.
            </p>
          </Card>

          <Card>
            <CardHeader
              title="Delivery"
              description="No email provider is configured in this build."
              icon={<MailX className="h-4 w-4" aria-hidden="true" />}
            />
            <div className="px-5 py-4 text-[0.8125rem] leading-relaxed text-muted">
              <p>
                Notifications are stored in the database and shown here. There is no outbound email, push or webhook
                delivery, so nothing is sent off-platform.
              </p>
              <p className="mt-2 text-[0.75rem] text-faint">
                Removing an account also removes its notification rows. Workspace events for other members are not
                affected.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
