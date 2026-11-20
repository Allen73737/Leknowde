import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/format";
import { cn } from "@/lib/format";

const statusLabel: Record<string, string> = {
  ready: "indexed",
  indexing: "indexing",
  queued: "queued",
  pending: "pending",
  failed: "failed",
  running: "running",
  completed: "completed",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={cn(statusTone(status), className)}>{statusLabel[status] ?? status}</Badge>
  );
}

export function DemoBadge() {
  return <Badge tone="warning">demo dataset</Badge>;
}
