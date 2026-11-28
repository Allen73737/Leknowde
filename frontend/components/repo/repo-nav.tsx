"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/format";
import { repoNavGroups, repoNavPrimary } from "@/lib/nav";

/**
 * RepoNav — five permanent tabs plus a grouped overflow menu.
 *
 * Seventeen sections do not belong in one scrolling ribbon. The five surfaces
 * people use constantly stay visible; everything else lives in a labelled
 * three-column menu so the strip stays predictable at every width.
 */
export function RepoNav({ repositoryID }: { repositoryID: string }) {
  const pathname = usePathname();
  const base = `/app/repositories/${repositoryID}`;
  const reduce = useReducedMotionSafe();
  const wrap = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);

  const hrefFor = (segment: string) => (segment ? `${base}/${segment}` : base);

  const activePrimary = repoNavPrimary.find((item) => {
    const href = hrefFor(item.segment);
    return item.segment === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
  });

  const secondary = repoNavGroups.flatMap((group) => group.items);
  const activeSecondary = secondary.find((item) => {
    const href = hrefFor(item.segment);
    return pathname === href || pathname.startsWith(`${href}/`);
  });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <nav aria-label="Repository sections" className="flex items-stretch border-b border-line">
        <div className="no-scrollbar -mb-px flex flex-1 items-stretch gap-0.5 overflow-x-auto">
          {repoNavPrimary.map((item) => {
            const href = hrefFor(item.segment);
            const active = activePrimary?.segment === item.segment;
            return (
              <Link
                key={item.segment || "overview"}
                href={href}
                ref={active ? activeRef : undefined}
                title={item.description}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex shrink-0 items-center rounded-t-[6px] px-3 pb-2.5 pt-2 text-[0.8125rem] font-medium transition-colors duration-150",
                  active ? "text-ink" : "text-muted hover:bg-raised/40 hover:text-ink",
                )}
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {active ? (
                  <motion.span
                    layoutId={reduce ? undefined : "repo-nav-underline"}
                    transition={{ type: "spring", stiffness: 520, damping: 44 }}
                    className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-accent"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="relative -mb-px flex shrink-0 items-stretch border-l border-line pl-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-haspopup="true"
            className={cn(
              "group relative flex items-center gap-1.5 rounded-t-[6px] px-3 pb-2.5 pt-2 text-[0.8125rem] font-medium transition-colors duration-150",
              activeSecondary || open ? "text-ink" : "text-muted hover:bg-raised/40 hover:text-ink",
            )}
          >
            <span className="whitespace-nowrap">{activeSecondary?.label ?? "More"}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-200",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
            {activeSecondary ? (
              <motion.span
                layoutId={reduce ? undefined : "repo-nav-underline"}
                transition={{ type: "spring", stiffness: 520, damping: 44 }}
                className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-accent"
                aria-hidden="true"
              />
            ) : null}
          </button>

          {open ? (
            <div
              className="absolute right-0 top-full z-50 mt-px w-[min(52rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line-strong bg-surface shadow-pop"
              role="menu"
              aria-label="More repository sections"
            >
              <div className="flex items-center justify-between border-b border-line bg-shell/60 px-4 py-2">
                <p className="meta-label">All surfaces</p>
                <p className="font-mono text-[0.75rem] text-faint">
                  {secondary.length} views
                </p>
              </div>
              <div className="grid gap-x-2 gap-y-1 p-2 sm:grid-cols-2 xl:grid-cols-3">
                {repoNavGroups.map((group, groupIndex) => (
                  <div key={group.label} className="min-w-0 p-1">
                    <p className="flex items-baseline gap-2 px-2 pb-1.5 pt-1">
                      <span className="font-mono text-[0.75rem] text-faint">
                        {String(groupIndex + 1).padStart(2, "0")}
                      </span>
                      <span className="meta-label">{group.label}</span>
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const href = hrefFor(item.segment);
                        const active = activeSecondary?.segment === item.segment;
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.segment}
                            href={href}
                            role="menuitem"
                            aria-current={active ? "page" : undefined}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "group flex items-start gap-2 rounded-[6px] border px-2 py-1.5 transition-colors duration-150",
                              active
                                ? "border-line bg-raised text-ink"
                                : "border-transparent text-muted hover:bg-raised/55 hover:text-ink",
                            )}
                          >
                            <Icon
                              className={cn(
                                "mt-0.5 h-3.5 w-3.5 shrink-0",
                                active ? "text-accent" : "text-faint group-hover:text-muted",
                              )}
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[0.8125rem] font-medium">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block truncate text-[0.75rem] leading-snug text-faint">
                                {item.description}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
