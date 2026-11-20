import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import type { ApiError } from "@/lib/api-error";

export function ApiErrorNote({
  error,
  retryHref,
  title = "This view could not be loaded",
}: {
  error: ApiError;
  retryHref?: string;
  title?: string;
}) {
  return (
    <div className="rounded-card border border-danger/40 bg-danger/5 px-4 py-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{error.message}</p>
          <p className="mt-2 font-mono text-[0.75rem] text-faint">
            HTTP {error.status} · {error.code}
          </p>
          {retryHref ? (
            <Link href={retryHref} className={buttonStyles("secondary", "sm", "mt-4")}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NotIndexedNotice({ repositoryID, status }: { repositoryID: string; status: string }) {
  return (
    <div className="rounded-card border border-warning/40 bg-warning/5 px-4 py-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-ink">This repository is not indexed yet</h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
            Current status is <span className="font-mono text-ink">{status}</span>. Indexing parses files, resolves
            imports and builds the graph. Start a job from the repository header and this view will populate when it
            completes.
          </p>
          <Link href={`/app/repositories/${repositoryID}`} className={buttonStyles("secondary", "sm", "mt-4")}>
            Open repository overview
          </Link>
        </div>
      </div>
    </div>
  );
}
