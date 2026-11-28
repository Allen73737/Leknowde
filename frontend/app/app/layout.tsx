import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { buttonStyles } from "@/components/ui/button";
import { getNotifications, getWorkspaces } from "@/lib/app-data";
import { safeGet } from "@/lib/server-api";
import type { MeResponse, MetaResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · LeKnowde" },
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await safeGet<MeResponse>("/auth/me");
  if (!me.data) {
    if (me.error.status === 401) redirect("/login");
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-6">
          <p className="eyebrow">Workspace unavailable</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-ink">The LeKnowde API is not reachable</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{me.error.message}</p>
          <p className="mt-3 font-mono text-[0.75rem] text-faint">
            HTTP {me.error.status} · {me.error.code}
          </p>
          <div className="mt-5 flex gap-2">
            <Link href="/login" className={buttonStyles("primary", "sm")}>
              Sign in
            </Link>
            <Link href="/" className={buttonStyles("outline", "sm")}>
              Return home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [workspacesResult, notificationsResult, metaResult] = await Promise.all([
    getWorkspaces(),
    getNotifications(),
    safeGet<MetaResponse>("/meta"),
  ]);
  const workspaces = workspacesResult.data?.workspaces ?? [];
  const unread = notificationsResult.data?.unread ?? 0;

  return (
    <AppShell me={me.data} workspaces={workspaces} unread={unread} meta={metaResult.data}>
      {children}
    </AppShell>
  );
}
