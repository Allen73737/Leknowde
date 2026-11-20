"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/client-api";
import type { Job, Repository } from "@/lib/types";

export function DemoConnectButton({
  workspaceID,
  size = "md",
  variant = "secondary",
  label = "Connect demo repository",
  className,
}: {
  workspaceID: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "outline";
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    if (!workspaceID) {
      setError("Create a workspace first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiPost<{ repository: Repository; job: Job; note: string }>("/repositories/demo", {
        workspace_id: workspaceID,
      });
      router.push(`/app/repositories/${result.repository.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the demo repository.");
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button type="button" size={size} variant={variant} loading={busy} onClick={connect}>
        {!busy ? <FlaskConical className="h-4 w-4" aria-hidden="true" /> : null}
        {label}
      </Button>
      {error ? <p className="mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-danger">{error}</p> : null}
    </div>
  );
}
