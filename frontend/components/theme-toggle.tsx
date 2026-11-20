"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("lk-theme", next);
    } catch {
      /* storage may be unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={`relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-transparent text-muted transition-all duration-200 ease-smooth hover:border-line hover:bg-raised hover:text-ink active:scale-95 ${className}`}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={theme}
          initial={reduce ? false : { opacity: 0, rotate: -45, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, rotate: 45, scale: 0.7 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center"
        >
          {theme === "dark" ? (
            <Sun className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
          ) : (
            <Moon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
