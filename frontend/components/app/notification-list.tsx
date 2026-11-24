"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  GitBranch,
  Info,
  Loader2,
  Users,
} from "lucide-react";

import { EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/client-api";
import { cn, relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";

const kindMeta: Record<string, { icon: typeof Bell; label: string; tone: "accent" | "success" | "warning" | "danger" | "neutral" }> = {
  success: { icon: CheckCircle2, label: "success", tone: "success" },
  error: { icon: AlertTriangle, label: "error", tone: "danger" },
  warning: { icon: AlertTriangle, label: "warning", tone: "warning" },
  info: { icon: Info, label: "info", tone: "accent" },
};

function linkFor(notification: Notification): string | null {
  const link = notification.link?.trim();
  if (!link) return null;
  if (link.startsWith("/app/")) return link;
  if (link.startsWith("/repositories/")) return `/app${link}`;
  if (link.startsWith("/workspaces")) return "/app/workspaces";
  if (link.startsWith("/")) return `/app${link}`;
  return null;
}

export function NotificationList({ initial }: { initial: Notification[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const unread = notifications.filter((notification) => !notification.read).length;

  async function markRead(id?: string) {
    const key = id ?? "all";
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      await apiPost("/notifications/read", id ? { id } : {});
      setNotifications((current) =>
        current.map((notification) =>
          !id || notification.id === id ? { ...notification, read: true } : notification,
        ),
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update notifications.");
    } finally {
      setBusy(null);
    }
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={<Bell className="h-5 w-5" aria-hidden="true" />}
          title="No notifications yet"
          description="Indexing results and workspace membership changes are written here. Notification email delivery is not configured."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="tabular text-[0.75rem] text-faint">
            {notifications.length} total · {unread} unread
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void markRead()}
          disabled={unread === 0 || busy !== null}
        >
          {busy === "all" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Mark all read
        </Button>
      </div>

      {error ? <p className="text-[0.8125rem] text-danger">{error}</p> : null}

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <ul className="divide-y divide-line">
          {notifications.map((notification) => {
            const meta = kindMeta[notification.kind] ?? { icon: GitBranch, label: notification.kind, tone: "neutral" as const };
            const Icon = meta.icon;
            const href = linkFor(notification);
            return (
              <li
                key={notification.id}
                className={cn("relative px-5 py-5 transition-colors duration-200 hover:bg-raised/30", !notification.read && "bg-accent/[0.035]")}
              >
                {!notification.read ? (
                  <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden="true" />
                ) : null}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200",
                      notification.read ? "border-line bg-canvas text-faint" : "border-accent/40 bg-accent/10 text-accent",
                    )}
                  >
                    <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-[0.9375rem]", notification.read ? "font-medium text-muted" : "font-semibold text-ink")}>
                        {notification.title}
                      </p>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {!notification.read ? <Badge tone="accent">unread</Badge> : null}
                      <span className="text-[0.75rem] text-faint">{relativeTime(notification.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{notification.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {href ? (
                        <Link href={href} className="text-[0.875rem] font-semibold text-accent hover:underline">
                          Open
                        </Link>
                      ) : (
                        <span className="text-[0.75rem] text-faint">No destination recorded.</span>
                      )}
                      {!notification.read ? (
                        <button
                          type="button"
                          onClick={() => void markRead(notification.id)}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-faint transition-colors hover:text-ink disabled:opacity-50"
                        >
                          {busy === notification.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-[0.75rem] leading-relaxed text-faint">
        Marking a notification read is recorded server-side. It does not affect the underlying repository, job or
        workspace.
      </p>
    </div>
  );
}
