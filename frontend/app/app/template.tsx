"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { usePathname } from "next/navigation";

/**
 * Route transition for everything inside /app. The shell (sidebar, topbar)
 * stays still; only the page body fades and lifts.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotionSafe();

  return (
    <motion.div
      key={pathname}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
