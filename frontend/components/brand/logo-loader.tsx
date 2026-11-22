"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

import { cn } from "@/lib/format";

/**
 * LogoLoader — the brand mark used as a loading state.
 *
 * The square frame and the "L" path are drawn from the same geometry as the
 * static logo, but loop: the outer ring sweeps once per cycle, the path
 * redraws, and the two nodes settle in. With reduced motion the mark is
 * rendered once, still, and only the label remains.
 */
export function LogoLoader({
  size = 44,
  label,
  wordmark = false,
  className,
  decorative = false,
}: {
  size?: number;
  label?: string;
  wordmark?: boolean;
  className?: string;
  decorative?: boolean;
}) {
  const reduce = useReducedMotionSafe();

  return (
    <span
      className={cn("inline-flex items-center gap-3", className)}
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-hidden={decorative || undefined}
    >
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <circle cx="24" cy="24" r="22.5" fill="none" stroke="var(--line)" strokeWidth="1.25" />
          <motion.circle
            cx="24"
            cy="24"
            r="22.5"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeDasharray="30 111.5"
            initial={reduce ? false : { rotate: 0 }}
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 1.7, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "24px 24px" }}
          />
        </svg>

        <svg
          viewBox="0 0 40 40"
          className="absolute inset-[17%] h-[66%] w-[66%]"
          fill="none"
          aria-hidden="true"
        >
          <motion.path
            d="M12 9.5V27.5H26.5"
            stroke="var(--accent)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
            animate={
              reduce
                ? { pathLength: 1, opacity: 1 }
                : { pathLength: [0, 1, 1, 0], opacity: [0.35, 1, 1, 0.35] }
            }
            transition={
              reduce
                ? undefined
                : { duration: 2.1, times: [0, 0.45, 0.8, 1], repeat: Infinity, ease: "easeInOut" }
            }
          />
          <motion.path
            d="M26.5 27.5L31.2 18.8"
            stroke="var(--accent)"
            strokeWidth="1.7"
            strokeLinecap="round"
            initial={reduce ? false : { opacity: 0 }}
            animate={reduce ? { opacity: 0.85 } : { opacity: [0, 0.9, 0.9, 0] }}
            transition={
              reduce ? undefined : { duration: 2.1, times: [0, 0.5, 0.8, 1], repeat: Infinity }
            }
          />
          <motion.circle
            cx="12"
            cy="9.5"
            r="2.6"
            fill="var(--accent)"
            initial={reduce ? false : { scale: 0 }}
            animate={reduce ? { scale: 1 } : { scale: [0, 1, 1, 0] }}
            transition={
              reduce
                ? undefined
                : { duration: 2.1, times: [0, 0.25, 0.78, 1], repeat: Infinity, ease: "backOut" }
            }
            style={{ transformOrigin: "12px 9.5px" }}
          />
          <motion.circle
            cx="26.5"
            cy="27.5"
            r="2.6"
            fill="var(--accent)"
            initial={reduce ? false : { scale: 0 }}
            animate={reduce ? { scale: 1 } : { scale: [0, 1, 1, 0] }}
            transition={
              reduce
                ? undefined
                : { duration: 2.1, times: [0, 0.5, 0.78, 1], repeat: Infinity, ease: "backOut" }
            }
            style={{ transformOrigin: "26.5px 27.5px" }}
          />
        </svg>
      </span>

      {wordmark || label ? (
        <span className="flex min-w-0 flex-col">
          {wordmark ? (
            <motion.span
              className="font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.035em] text-ink"
              initial={reduce ? false : { opacity: 0.45 }}
              animate={reduce ? undefined : { opacity: [0.45, 1, 0.45] }}
              transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              LeKnowde
            </motion.span>
          ) : null}
          {label ? (
            <span className="text-[0.75rem] leading-relaxed text-faint">
              {label}
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="sr-only">{decorative || label ? null : "Loading"}</span>
    </span>
  );
}

/** Full-panel loader for route transitions and empty waits. */
export function LogoLoaderPanel({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotionSafe();
  return (
    <div
      className={cn(
        "flex min-h-[52vh] flex-col items-center justify-center gap-6 rounded-card border border-line bg-surface/40 px-6 py-16",
        className,
      )}
    >
      <LogoLoader size={56} wordmark label={label} className="flex-col gap-5 text-center" />
      <div className="flex w-40 flex-col items-center gap-2.5">
        <span className="relative h-[3px] w-full overflow-hidden rounded-full bg-raised">
          {reduce ? (
            <span className="absolute inset-y-0 left-0 w-2/3 rounded-full bg-accent" />
          ) : (
            <motion.span
              className="absolute inset-y-0 w-1/2 rounded-full bg-accent"
              initial={{ x: "-120%" }}
              animate={{ x: ["-120%", "220%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </span>
        <span className="text-[0.75rem] text-faint">
          Deterministic core
        </span>
      </div>
    </div>
  );
}
