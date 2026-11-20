"use client";

import { motion, type Variants } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/* -------------------------------------------------------------------------
 * Reveal — fades and lifts content when it enters the viewport.
 * ---------------------------------------------------------------------- */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotionSafe();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-70px" }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------
 * Stagger — orchestrated children. Compose with StaggerItem.
 * ---------------------------------------------------------------------- */
export function Stagger({
  children,
  className,
  delay = 0,
  gap = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  gap?: number;
}) {
  const reduce = useReducedMotionSafe();
  const parent: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : gap, delayChildren: delay } },
  };
  return (
    <motion.div
      className={className}
      variants={parent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  y = 14,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotionSafe();
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : y },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  };
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------
 * Press — a subtle spring on tap for interactive wrappers.
 * ---------------------------------------------------------------------- */
export function Press({
  children,
  className,
  scale = 0.985,
}: {
  children: React.ReactNode;
  className?: string;
  scale?: number;
}) {
  const reduce = useReducedMotionSafe();
  return (
    <motion.div
      className={className}
      whileTap={reduce ? undefined : { scale }}
      whileHover={reduce ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
    >
      {children}
    </motion.div>
  );
}
