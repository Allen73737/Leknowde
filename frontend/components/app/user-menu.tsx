"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";

import { initials } from "@/lib/format";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/session/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-[6px] border border-transparent px-1 py-0.5 text-left transition-colors hover:border-line hover:bg-raised"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-line bg-raised font-mono text-[0.75rem] font-medium text-accent">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-[0.75rem] font-medium text-ink">{name}</span>
          <span className="block truncate font-mono text-[0.75rem] text-faint">{email}</span>
        </span>
        <ChevronDown className="h-3 w-3 text-faint" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-card border border-line bg-surface shadow-pop"
        >
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-xs font-medium text-ink">{name}</p>
            <p className="mt-0.5 truncate font-mono text-[0.75rem] text-faint">{email}</p>
          </div>
          <div className="p-1.5">
            <Link
              href="/app/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded px-2.5 py-2 text-xs text-muted hover:bg-raised hover:text-ink"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" /> Account settings
            </Link>
            <Link
              href="/app/settings#workspace"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded px-2.5 py-2 text-xs text-muted hover:bg-raised hover:text-ink"
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Workspace &amp; members
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
