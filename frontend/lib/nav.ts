import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Boxes,
  Braces,
  Bug,
  Compass,
  FileCode2,
  FileText,
  GitBranch,
  GitPullRequest,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Network,
  Radar,
  Settings,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";

export interface RepoNavItem {
  label: string;
  segment: string;
  icon: LucideIcon;
  description: string;
}

export const repoNav: RepoNavItem[] = [
  { label: "Overview", segment: "", icon: LayoutDashboard, description: "Repository summary and recent activity" },
  { label: "Explorer", segment: "explorer", icon: FileCode2, description: "Browse indexed files with symbols" },
  { label: "Symbols", segment: "symbols", icon: Braces, description: "Functions, classes, types and entities" },
  { label: "Assistant", segment: "assistant", icon: MessageSquare, description: "Evidence-backed repository answers" },
  { label: "Architecture", segment: "architecture", icon: Network, description: "Interactive system graph" },
  { label: "Dependencies", segment: "dependencies", icon: Workflow, description: "Imports, coupling and cycles" },
  { label: "Change impact", segment: "impact", icon: Radar, description: "Blast radius and risk assessment" },
  { label: "Documentation", segment: "documentation", icon: BookOpen, description: "Living documentation from facts" },
  { label: "README", segment: "readme", icon: FileText, description: "README and GitHub About metadata" },
  { label: "Health", segment: "health", icon: Activity, description: "Findings, complexity and test signals" },
  { label: "Pull requests", segment: "pull-requests", icon: GitPullRequest, description: "Review intelligence and PR risk" },
  { label: "Contracts", segment: "contracts", icon: GitBranch, description: "Declared routes and client call sites" },
  { label: "Snapshots", segment: "snapshots", icon: Layers, description: "Architecture snapshots and temporal drift" },
  { label: "Ownership", segment: "ownership", icon: ShieldCheck, description: "Code ownership and bus factor" },
  { label: "Test selection", segment: "test-select", icon: Terminal, description: "Pick tests affected by a change" },
  { label: "Onboarding", segment: "onboarding", icon: Compass, description: "Guided learning path" },
  { label: "Digital twin", segment: "twin", icon: Boxes, description: "Whole-system model and flows" },
];

export const primaryNav: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "Repositories", href: "/app/repositories", icon: FileCode2 },
];

export const workspaceNav: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "Workspaces", href: "/app/workspaces", icon: Boxes },
  { label: "Repositories", href: "/app/repositories", icon: FileCode2 },
];

export const accountNav: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Integrations", href: "/app/integrations", icon: ShieldCheck },
  { label: "Notifications", href: "/app/notifications", icon: Bug },
  { label: "Audit log", href: "/app/audit", icon: Activity },
  { label: "Settings", href: "/app/settings", icon: Settings },
];

export const documentKindIcons: Record<string, LucideIcon> = {
  readme: BookOpen,
  overview: Compass,
  architecture: Network,
  api: Braces,
  database: Boxes,
  srs: BookOpen,
  installation: Settings,
  development: Workflow,
  deployment: Boxes,
  testing: Bug,
  onboarding: Compass,
  changelog: Activity,
  adr: BookOpen,
};
