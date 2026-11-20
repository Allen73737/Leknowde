"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { ArrowRight, Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/format";

const links = [
  { label: "Features", href: "/features" },
  { label: "Architecture", href: "/architecture" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotionSafe();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas">
      <div className="container-wide flex h-[4.5rem] items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-10">
          <Link
            href="/"
            aria-label="LeKnowde home"
            className="focus-ring shrink-0 rounded-lg transition-transform duration-200 hover:scale-[1.02]"
          >
            <Logo size={30} />
          </Link>

          <nav className="hidden items-center gap-1.5 lg:flex" aria-label="Primary">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative rounded-lg px-4 py-2.5 text-base font-medium transition-colors duration-200",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {link.label}
                  {active ? (
                    <motion.span
                      layoutId={reduce ? undefined : "site-nav-active"}
                      transition={{ type: "spring", stiffness: 460, damping: 40 }}
                      className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 -bottom-px h-[2px] origin-left scale-x-0 rounded-full bg-line-strong transition-transform duration-300 ease-smooth group-hover:scale-x-100"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className={cn(buttonStyles("ghost", "sm"), "hidden sm:inline-flex")}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={cn(buttonStyles("primary", "sm"), "group hidden sm:inline-flex")}
          >
            Create account
            <ArrowRight className="arrow-slide h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-ink lg:hidden"
          >
            {open ? <X className="h-[1.125rem] w-[1.125rem]" /> : <Menu className="h-[1.125rem] w-[1.125rem]" />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="mobile-menu"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-line bg-shell lg:hidden"
          >
            <nav className="flex flex-col px-5 py-3" aria-label="Mobile">
              {links.map((link, index) => (
                <motion.div
                  key={link.href}
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * index, duration: 0.28 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block border-b border-line/60 py-3 text-base font-medium text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-4 flex gap-2 pb-1">
                <Link href="/login" className={cn(buttonStyles("outline", "md"), "flex-1")}>
                  Sign in
                </Link>
                <Link href="/register" className={cn(buttonStyles("primary", "md"), "flex-1")}>
                  Create account
                </Link>
              </div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
