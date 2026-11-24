"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/format";
import { repoNav } from "@/lib/nav";

/**
 * RepoNav — one quiet hairline tab strip.
 *
 * Thirteen sections cannot wrap into two rows without looking like a settings
 * form, so the strip scrolls horizontally, keeps the active tab in view and
 * exposes explicit arrows at the edges that actually overflow. Labels carry the
 * hierarchy; a single 2px accent rule marks the active section.
 */
export function RepoNav({ repositoryID }: { repositoryID: string }) {
  const pathname = usePathname();
  const base = `/app/repositories/${repositoryID}`;
  const reduce = useReducedMotionSafe();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const activeHref = repoNav.reduce((match, item) => {
    if (!item.segment) return match;
    const href = `${base}/${item.segment}`;
    return pathname === href || pathname.startsWith(`${href}/`) ? href : match;
  }, base);

  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    setEdges({
      left: element.scrollLeft > 4,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    const start = active.offsetLeft;
    const end = start + active.offsetWidth;
    const inView = start >= container.scrollLeft + 8 && end <= container.scrollLeft + container.clientWidth - 8;
    if (inView) return;
    container.scrollTo({
      left: Math.max(0, start - 24),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [pathname, reduce]);

  function nudge(direction: -1 | 1) {
    scroller.current?.scrollBy({
      left: direction * Math.max(240, (scroller.current?.clientWidth ?? 320) * 0.6),
      behavior: reduce ? "auto" : "smooth",
    });
  }

  return (
    <nav aria-label="Repository sections" className="relative border-b border-line">
      <div className="relative px-8">
        <div
          ref={scroller}
          onScroll={measure}
          className="no-scrollbar -mb-px flex snap-x snap-mandatory items-stretch gap-0.5 overflow-x-auto"
        >
          {repoNav.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = href === activeHref;
            return (
              <Link
                key={item.segment || "overview"}
                href={href}
                title={item.description}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex shrink-0 snap-start items-center rounded-t-md px-3 pb-3 pt-2 text-[0.8125rem] font-medium transition-colors duration-200",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {active ? (
                  <motion.span
                    layoutId={reduce ? undefined : "repo-nav-underline"}
                    transition={{ type: "spring", stiffness: 520, damping: 44 }}
                    className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            );
          })}
        </div>

        {edges.left ? (
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll sections left"
            className="press absolute left-0 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-muted shadow-card transition-colors duration-200 hover:border-line-strong hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}

        {edges.right ? (
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll sections right"
            className="press absolute right-0 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-muted shadow-card transition-colors duration-200 hover:border-line-strong hover:text-ink"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </nav>
  );
}
