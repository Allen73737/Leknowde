"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

import { cn } from "@/lib/format";

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
  animated?: boolean;
}

export function Logo({ size = 30, showWordmark = true, className, wordmarkClassName, animated = true }: LogoProps) {
  const reduced = useReducedMotionSafe();
  const shouldAnimate = animated && !reduced;

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" stroke="var(--line)" />
        <motion.path
          d="M12 9.5V27.5H26.5"
          stroke="var(--accent)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={shouldAnimate ? { pathLength: 0, opacity: 0.4 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.path
          d="M26.5 27.5L31.2 18.8"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          initial={shouldAnimate ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 0.85 }}
          transition={{ delay: 0.55, duration: 0.7, ease: "easeOut" }}
        />
        <motion.circle
          cx="12"
          cy="9.5"
          r="2.5"
          fill="var(--accent)"
          initial={shouldAnimate ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
          style={{ transformOrigin: "12px 9.5px" }}
        />
        <motion.circle
          cx="26.5"
          cy="27.5"
          r="2.5"
          fill="var(--accent)"
          initial={shouldAnimate ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.95, type: "spring", stiffness: 260, damping: 18 }}
          style={{ transformOrigin: "26.5px 27.5px" }}
        />
        <motion.circle
          cx="31.2"
          cy="18.8"
          r="2"
          fill="var(--ink)"
          initial={shouldAnimate ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.15, type: "spring", stiffness: 260, damping: 18 }}
          style={{ transformOrigin: "31.2px 18.8px" }}
        />
      </svg>
      {showWordmark ? (
        <span
          className={cn(
            "font-display text-[17px] font-semibold tracking-[-0.035em] text-ink",
            wordmarkClassName,
          )}
        >
          LeKnowde
        </span>
      ) : null}
    </span>
  );
}
