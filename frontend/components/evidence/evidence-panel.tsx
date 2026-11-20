import Link from "next/link";
import { FileCode2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Evidence } from "@/lib/types";

export function EvidencePanel({
  evidence,
  repositoryID,
  title = "Retrieved evidence",
}: {
  evidence: Evidence[];
  repositoryID?: string;
  title?: string;
}) {
  if (evidence.length === 0) {
    return (
      <div className="rounded-md border border-line bg-canvas px-3.5 py-3 text-[0.8125rem] text-faint">
        No source evidence was retrieved. Treat any generated prose without citations as unsupported.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-faint">{title}</p>
        <Badge>{evidence.length} citations</Badge>
      </div>
      <ul className="space-y-2">
        {evidence.map((item, index) => (
          <li key={`${item.file_path}-${item.start_line}-${index}`} className="rounded-md border border-line bg-canvas">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <FileCode2 className="h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
                {repositoryID ? (
                  <Link
                    href={`/app/repositories/${repositoryID}/explorer?path=${encodeURIComponent(item.file_path)}`}
                    className="truncate font-mono text-[0.75rem] text-accent hover:underline"
                  >
                    {item.file_path}
                  </Link>
                ) : (
                  <span className="truncate font-mono text-[0.75rem] text-accent">{item.file_path}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {item.symbol ? <Badge tone="accent">{item.symbol}</Badge> : null}
                <span className="font-mono text-[0.75rem] text-faint">
                  {item.start_line ? `${item.start_line}–${item.end_line}` : item.kind}
                </span>
              </div>
            </div>
            <div className="px-3 py-2">
              <p className="text-[0.75rem] leading-relaxed text-muted">{item.reason}</p>
              {item.snippet ? (
                <pre className="mt-1.5 max-h-40 overflow-auto rounded border border-line bg-shell px-2 py-1.5 font-mono text-[0.75rem] leading-relaxed text-muted">
                  <code>{item.snippet}</code>
                </pre>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
