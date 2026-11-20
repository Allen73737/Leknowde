"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import {
  Bell,
  ChevronRight,
  Command,
  Menu,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette, PaletteHint } from "@/components/app/command-palette";
import { UserMenu } from "@/components/app/user-menu";
import { accountNav, workspaceNav } from "@/lib/nav";
import { cn, initials, plural } from "@/lib/format";
import type { MeResponse, Workspace } from "@/lib/types";

const crumbLabels: Record<string, string> = {
  app: "Dashboard",
  workspaces: "Workspaces",
  repositories: "Repositories",
  notifications: "Notifications",
  integrations: "Integrations",
  settings: "Settings",
  audit: "Audit log",
};

function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((part, index) => {
    const href = `/${parts.slice(0, index + 1).join("/")}`;
    const label = crumbLabels[part] ?? (part.length > 22 ? "Repository" : part.replace(/-/g, " "));
    return { href, label };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden min-w-0 items-center gap-1 text-[0.8125rem] text-faint sm:flex"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex min-w-0 items-center gap-1">
            {index > 0 ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-line-strong" aria-hidden="true" />
            ) : null}
            {isLast ? (
              <span className="truncate font-medium capitalize text-ink">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate capitalize transition-colors duration-200 hover:text-ink"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  layoutId,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  layoutId: string;
}) {
  const reduce = useReducedMotionSafe();
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[0.875rem] font-medium transition-colors duration-200",
        active ? "text-ink" : "text-muted hover:text-ink",
      )}
    >
      {active ? (
        <motion.span
          layoutId={reduce ? undefined : layoutId}
          transition={{ type: "spring", stiffness: 480, damping: 42 }}
          className="absolute inset-0 rounded-lg border border-line bg-raised"
          aria-hidden="true"
        >
          <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-accent" />
        </motion.span>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-lg bg-raised/0 transition-colors duration-200 group-hover:bg-raised/60"
        />
      )}
      <span className="relative flex min-w-0 items-center gap-2.5">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-all duration-200",
            active
              ? "text-accent"
              : "text-faint group-hover:translate-x-[1px] group-hover:text-muted",
          )}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </span>
      {badge && badge > 0 ? (
        <span className="relative shrink-0 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[0.75rem] font-medium text-accent">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarBody({
  me,
  workspaces,
  unread,
  pathname,
  onNavigate,
  onClose,
  onOpenPalette,
  layoutPrefix,
}: {
  me: MeResponse;
  workspaces: Workspace[];
  unread: number;
  pathname: string;
  onNavigate?: () => void;
  onClose?: () => void;
  onOpenPalette: () => void;
  layoutPrefix: string;
}) {
  const org = "name" in me.organization ? me.organization.name : "Organization";

  return (
    <div className="flex h-full flex-col border-r border-line bg-shell">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
        <Link
          href="/app"
          aria-label="LeKnowde dashboard"
          className="focus-ring rounded-lg transition-transform duration-200 hover:scale-[1.02]"
        >
          <Logo size={26} />
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-[1.125rem] w-[1.125rem]" />
          </button>
        ) : null}
      </div>

      <div className="shrink-0 px-3 pt-3">
        <Link
          href="/app/workspaces"
          onClick={onNavigate}
          title={org}
          className="group flex items-center gap-2.5 rounded-lg border border-line bg-canvas px-3 py-2 transition-colors duration-200 hover:border-line-strong"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-raised font-mono text-[0.75rem] font-semibold text-accent">
            {initials(org)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-medium leading-tight text-ink">
              {org}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[0.75rem] text-faint">
              {workspaces.length === 0
                ? "No workspaces"
                : plural(workspaces.length, "workspace")}
            </span>
          </span>
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2" aria-label="Main">
        <div className="space-y-0.5">
          {workspaceNav.map((item) => {
            const active =
              item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <div key={item.href} onClick={onNavigate}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={active}
                  layoutId={`${layoutPrefix}-main`}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between px-3">
            <p className="font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-faint">
              Workspaces
            </p>
            <Link
              href="/app/workspaces"
              onClick={onNavigate}
              className="rounded-md p-1 text-faint transition-all duration-200 hover:bg-raised hover:text-ink"
              aria-label="Create or manage workspaces"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-1.5 space-y-0.5">
            {workspaces.slice(0, 4).map((workspace) => (
              <Link
                key={workspace.id}
                href={`/app/repositories?workspace=${workspace.id}`}
                onClick={onNavigate}
                className="group flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[0.8125rem] text-muted transition-colors duration-200 hover:bg-raised/60 hover:text-ink"
              >
                <span className="truncate">{workspace.name}</span>
                <span className="shrink-0 font-mono text-[0.75rem] text-faint">
                  {workspace.repository_count}
                </span>
              </Link>
            ))}
            {workspaces.length === 0 ? (
              <p className="px-3 py-1.5 text-[0.8125rem] text-faint">No workspaces yet.</p>
            ) : (
              <Link
                href="/app/workspaces"
                onClick={onNavigate}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[0.8125rem] text-faint transition-colors duration-200 hover:bg-raised/60 hover:text-ink"
              >
                All workspaces
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6">
          <p className="px-3 font-mono text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-faint">
            Account
          </p>
          <div className="mt-1.5 space-y-0.5">
            {accountNav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <div key={item.href} onClick={onNavigate}>
                  <NavLink
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={active}
                    badge={item.href === "/app/notifications" ? unread : undefined}
                    layoutId={`${layoutPrefix}-account`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="shrink-0 border-t border-line p-2.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex w-full items-center gap-2.5 rounded-lg border border-line bg-canvas px-3 py-2 text-left transition-all duration-200 hover:border-line-strong"
        >
          <Command className="h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
            Search everything
          </span>
          <span className="shrink-0 rounded border border-line bg-shell px-1.5 py-0.5 font-mono text-[0.75rem] text-faint">
            ⌘K
          </span>
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  me,
  workspaces,
  unread,
  children,
}: {
  me: MeResponse;
  workspaces: Workspace[];
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <CommandPalette workspaces={workspaces} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block xl:w-72">
        <SidebarBody
          me={me}
          workspaces={workspaces}
          unread={unread}
          pathname={pathname}
          onOpenPalette={() => setPaletteOpen(true)}
          layoutPrefix="desktop"
        />
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-[17.5rem]"
              initial={reduce ? { opacity: 1 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              role="dialog"
              aria-label="Navigation"
            >
              <SidebarBody
                me={me}
                workspaces={workspaces}
                unread={unread}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                onClose={() => setMobileOpen(false)}
                onOpenPalette={() => {
                  setMobileOpen(false);
                  setPaletteOpen(true);
                }}
                layoutPrefix="mobile"
              />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      <div className="lg:pl-64 xl:pl-72">
        <header
          className={cn(
            "sticky top-0 z-30 border-b bg-canvas transition-shadow duration-300",
            scrolled ? "border-line shadow-[0_10px_30px_-24px_rgba(0,0,0,0.55)]" : "border-line/70",
          )}
        >
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-ink lg:hidden"
              >
                <Menu className="h-[1.125rem] w-[1.125rem]" />
              </button>
              <Breadcrumbs pathname={pathname} />
            </div>
            <div className="flex items-center gap-1.5">
              <PaletteHint onClick={() => setPaletteOpen(true)} />
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:text-ink lg:hidden"
              >
                <Search className="h-[1.125rem] w-[1.125rem]" />
              </button>
              <Link
                href="/app/notifications"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
              >
                <Bell className="h-[1.125rem] w-[1.125rem]" />
                {unread > 0 ? (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-canvas" />
                ) : null}
              </Link>
              <ThemeToggle />
              <div className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
              <UserMenu name={me.user.name} email={me.user.email} />
            </div>
          </div>
        </header>

        <main id="main" className="w-full px-4 py-6 sm:px-6 lg:py-7 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
