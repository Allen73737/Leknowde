"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import {
  Bell,
  ChevronRight,
  ChevronsUpDown,
  Command,
  Menu,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/app/command-palette";
import { UserMenu } from "@/components/app/user-menu";
import { accountNav, primaryNav } from "@/lib/nav";
import { cn, initials, plural } from "@/lib/format";
import type { MeResponse, MetaResponse, Workspace } from "@/lib/types";

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
      className="hidden min-w-0 items-center gap-0.5 text-[0.8125rem] text-faint sm:flex"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex min-w-0 items-center gap-0.5">
            {index > 0 ? (
              <ChevronRight className="h-3 w-3 shrink-0 text-line-strong" aria-hidden="true" />
            ) : null}
            {isLast ? (
              <span className="truncate font-medium capitalize text-ink">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate capitalize transition-colors duration-150 hover:text-ink"
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
        "group relative flex items-center justify-between gap-2 rounded-[6px] border px-2.5 py-[7px] text-[0.8125rem] font-medium transition-colors duration-150",
        active ? "text-ink" : "border-transparent text-muted hover:text-ink",
      )}
    >
      {active ? (
        <motion.span
          layoutId={reduce ? undefined : layoutId}
          transition={{ type: "spring", stiffness: 480, damping: 42 }}
          className="absolute inset-0 rounded-[6px] border border-line bg-raised"
          aria-hidden="true"
        >
          <span className="absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-r-full bg-accent" />
        </motion.span>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-[6px] bg-raised/0 transition-colors duration-150 group-hover:bg-raised/55"
        />
      )}
      <span className="relative flex min-w-0 items-center gap-2.5">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors duration-150",
            active ? "text-accent" : "text-faint group-hover:text-muted",
          )}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </span>
      {badge && badge > 0 ? (
        <span className="relative shrink-0 rounded-[4px] border border-accent/35 bg-accent/10 px-1.5 py-0.5 tabular text-[0.75rem] font-medium leading-none text-accent">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function NavGroupLabel({ children, aside }: { children: string; aside?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between px-2.5">
      <p className="meta-label">{children}</p>
      {aside ? <span className="font-mono text-[0.75rem] text-faint">{aside}</span> : null}
    </div>
  );
}

function SidebarBody({
  me,
  workspaces,
  unread,
  pathname,
  meta,
  onNavigate,
  onClose,
  onOpenPalette,
  layoutPrefix,
}: {
  me: MeResponse;
  workspaces: Workspace[];
  unread: number;
  pathname: string;
  meta?: MetaResponse | null;
  onNavigate?: () => void;
  onClose?: () => void;
  onOpenPalette: () => void;
  layoutPrefix: string;
}) {
  const org = "name" in me.organization ? me.organization.name : "Organization";
  const workspaceCount = workspaces.length;
  const repositoryCount = workspaces.reduce((total, workspace) => total + workspace.repository_count, 0);
  const workspaceLabel =
    workspaceCount === 0
      ? "No workspace"
      : workspaceCount === 1
        ? workspaces[0]?.name ?? "Workspace"
        : "All workspaces";
  const workspaceMeta =
    workspaceCount === 0
      ? "Create one to begin"
      : workspaceCount === 1
        ? plural(repositoryCount, "repository", "repositories")
        : `${plural(repositoryCount, "repository", "repositories")} · ${plural(workspaceCount, "workspace")}`;
  const orgLooksLikeEmail = org.includes("@");
  const apiOnline = Boolean(meta);
  const aiOnline = Boolean(meta?.ai_service?.status && meta.ai_service.status !== "unavailable");

  return (
    <div className="flex h-full flex-col border-r border-line bg-shell">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <Link href="/app" aria-label="LeKnowde dashboard" className="focus-ring rounded-[6px]">
          <Logo size={24} />
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-raised hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="chip">v1</span>
        )}
      </div>

      <div className="shrink-0 px-2.5 pt-2.5">
        <Link
          href="/app/workspaces"
          onClick={onNavigate}
          title={orgLooksLikeEmail ? workspaceLabel : org}
          className="group flex items-center gap-2.5 rounded-[7px] border border-line bg-canvas px-2.5 py-2 transition-colors duration-150 hover:border-line-strong"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[5px] border border-line bg-raised text-[0.75rem] font-semibold text-accent">
            {initials(workspaceLabel)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-medium leading-tight text-ink">
              {workspaceLabel}
            </span>
            <span className="mt-0.5 block truncate text-[0.75rem] leading-tight text-faint">{workspaceMeta}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        <NavGroupLabel aside={String(workspaceCount).padStart(2, "0")}>Workspace</NavGroupLabel>
        <div className="space-y-0.5">
          {primaryNav.map((item) => {
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

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <p className="meta-label">Spaces</p>
            <Link
              href="/app/workspaces"
              onClick={onNavigate}
              className="rounded-[4px] p-0.5 text-faint transition-colors hover:bg-raised hover:text-ink"
              aria-label="Create or manage workspaces"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-0.5">
            {workspaces.slice(0, 4).map((workspace) => (
              <Link
                key={workspace.id}
                href={`/app/repositories?workspace=${workspace.id}`}
                onClick={onNavigate}
                className="group flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-[5px] text-[0.8125rem] text-muted transition-colors duration-150 hover:bg-raised/55 hover:text-ink"
              >
                <span className="truncate">{workspace.name}</span>
                <span className="shrink-0 tabular font-mono text-[0.75rem] text-faint">
                  {workspace.repository_count}
                </span>
              </Link>
            ))}
            {workspaces.length === 0 ? (
              <p className="px-2.5 py-1 text-[0.8125rem] text-faint">No workspaces yet.</p>
            ) : (
              <Link
                href="/app/workspaces"
                onClick={onNavigate}
                className="flex items-center justify-between gap-2 rounded-[6px] px-2.5 py-[5px] text-[0.75rem] text-faint transition-colors duration-150 hover:bg-raised/55 hover:text-ink"
              >
                Manage workspaces
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <NavGroupLabel>Account</NavGroupLabel>
          <div className="space-y-0.5">
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

      <div className="shrink-0 space-y-2 border-t border-line p-2.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex w-full items-center gap-2 rounded-[6px] border border-line bg-canvas px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-line-strong"
        >
          <Command className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted">Search everything</span>
          <span className="kbd">⌘K</span>
        </button>
        <div className="flex items-center justify-between px-1 font-mono text-[0.75rem] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", apiOnline ? "bg-success" : "bg-danger")}
            />
            API
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", aiOnline ? "bg-success" : "bg-warning")}
            />
            {aiOnline ? "AI linked" : "AI offline"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  me,
  workspaces,
  unread,
  meta,
  children,
}: {
  me: MeResponse;
  workspaces: Workspace[];
  unread: number;
  meta?: MetaResponse | null;
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] lg:block xl:w-[16.5rem]">
        <SidebarBody
          me={me}
          workspaces={workspaces}
          unread={unread}
          pathname={pathname}
          meta={meta}
          onOpenPalette={() => setPaletteOpen(true)}
          layoutPrefix="desktop"
        />
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-[16.5rem]"
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
                meta={meta}
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

      <div className="lg:pl-[15.5rem] xl:pl-[16.5rem]">
        <header
          className={cn(
            "sticky top-0 z-30 border-b bg-canvas transition-colors duration-200",
            scrolled ? "border-line" : "border-line/70",
          )}
        >
          <div className="mx-auto flex h-14 w-full max-w-[112rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-line text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <Breadcrumbs pathname={pathname} />
            </div>

            <div className="hidden flex-1 justify-center md:flex">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="group flex h-8 w-full max-w-md items-center gap-2 rounded-[6px] border border-line bg-shell px-2.5 text-left transition-colors duration-150 hover:border-line-strong"
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-faint">
                  Search repositories, files, symbols
                </span>
                <span className="kbd">⌘K</span>
              </button>
            </div>

            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-muted transition-colors duration-150 hover:bg-raised hover:text-ink md:hidden"
              >
                <Search className="h-4 w-4" />
              </button>
              <Link
                href="/app/notifications"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-muted transition-colors duration-150 hover:bg-raised hover:text-ink"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-canvas" />
                ) : null}
              </Link>
              <ThemeToggle />
              <div className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
              <UserMenu name={me.user.name} email={me.user.email} />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[112rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
