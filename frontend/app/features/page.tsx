import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Boxes,
  Braces,
  GitPullRequest,
  Network,
  Radar,
  Search,
  Workflow,
} from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Repository explorer, evidence-backed assistant, architecture studio, dependency intelligence, change impact, living documentation, health analysis and onboarding.",
};

const sections = [
  {
    id: "assistant",
    icon: Search,
    eyebrow: "Repository assistant",
    title: "Answers that show their source",
    body: "Ask about behaviour, ownership, data flow or failure modes. Retrieval scores lexical matches, hashed lexical vectors and symbol names, then supplies a bounded evidence set. The model explains only that evidence. Citations outside the supplied set are discarded.",
    bullets: [
      "File path, line range, symbol and snippet on every citation",
      "Confidence label plus an explicit uncertainty field",
      "Honest degradation when no model provider is configured",
      "Conversation history persisted per user and repository",
    ],
  },
  {
    id: "architecture",
    icon: Network,
    eyebrow: "Architecture studio",
    title: "The repository as a navigable graph",
    body: "Switch between module, file, symbol, architecture and test views. Nodes carry real degree counts; edges carry relation type, line number and source file. The canvas uses React Flow with a restrained custom node language, not a decorative network diagram.",
    bullets: [
      "Module, file, symbol, architecture and test views",
      "CONTAINS, IMPORTS, CALLS, EXPOSES, CONSUMES, TESTS, DEPENDS_ON",
      "Neighbourhood focus and truncation reporting",
      "Parser fidelity surfaced next to the graph",
    ],
  },
  {
    id: "dependencies",
    icon: Workflow,
    eyebrow: "Dependency intelligence",
    title: "Coupling you can verify",
    body: "Import resolution follows relative paths and known module roots. External packages are separated from internal modules. Circular groups are reported with their actual module paths, and file-level dependencies include the import line.",
    bullets: [
      "Internal module and file dependency summary",
      "External package footprint per module",
      "Circular dependency groups",
      "Incoming and outgoing imports with line evidence",
    ],
  },
  {
    id: "impact",
    icon: Radar,
    eyebrow: "Change impact",
    title: "What moves when this changes",
    body: "Describe a change in ordinary language. The engine identifies seed symbols and files, walks reverse dependencies, finds tests that reference the affected modules, and computes an additive risk score. Every factor and weight is returned with the result.",
    bullets: [
      "Seeds, affected files, symbols, APIs, entities and services",
      "Existing and recommended tests with a test plan",
      "Transparent risk formula: weights, evidence, level thresholds",
      "Implementation sequence and rollback considerations",
    ],
  },
  {
    id: "documentation",
    icon: BookOpen,
    eyebrow: "Living documentation",
    title: "Documents generated from structure",
    body: "Thirteen document kinds are available: README, overview, architecture, API, database, SRS, installation, development, deployment, testing, onboarding, changelog and ADR. A deterministic generator always runs; a provider can add prose when configured. Source fingerprints expose drift.",
    bullets: [
      "Deterministic fallback with verified facts",
      "Generation from indexed files, modules, endpoints and entities",
      "Drift flags when source structure changes",
      "Draft, published and archived states; editable content",
    ],
  },
  {
    id: "health",
    icon: Activity,
    eyebrow: "Software health",
    title: "Signals, not verdicts",
    body: "Health analysis uses transparent pattern checks and structural signals: missing test references, possible dynamic SQL, non-TLS endpoints, unused import candidates, duplication and complexity proxies. Findings are review candidates. The score and penalties are shown.",
    bullets: [
      "Severity and kind breakdown with penalty points",
      "Findings carry confidence and raw evidence JSON",
      "Limitations listed alongside the score",
      "Per-file code view with symbol ranges",
    ],
  },
  {
    id: "onboarding",
    icon: Boxes,
    eyebrow: "Developer onboarding",
    title: "A reading order, not a wall of links",
    body: "Onboarding is generated from entry points, key files by degree, endpoints, entities, tests and existing findings. Each step includes why it matters and an exercise that forces active reading.",
    bullets: [
      "Seven-step guided path with estimated hours",
      "Key files ranked by dependency degree and role",
      "Glossary, architecture summary and questions to ask",
      "Links directly into the explorer",
    ],
  },
  {
    id: "pr",
    icon: GitPullRequest,
    eyebrow: "Pull-request intelligence",
    title: "Review the blast radius, not just the diff",
    body: "For connected providers, pull-request files are mapped to indexed modules, affected paths are resolved through the graph, and missing tests are highlighted. Demo pull requests are fixtures and labelled as such.",
    bullets: [
      "Changed paths mapped to indexed modules",
      "Risk assessment with the same transparent model",
      "Missing-test and review recommendations",
      "Evidence and uncertainty lists",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main id="main">
        <section className="relative overflow-hidden border-b border-line bg-shell">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid-backdrop opacity-30 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]"
          />
          <div className="container-wide relative py-14 sm:py-16 lg:py-20">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:items-end lg:gap-20">
              <Reveal>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="accent">Platform 1.0</Badge>
                  <span className="text-[0.75rem] text-faint">
                    {sections.length} connected surfaces
                  </span>
                </div>
                <h1 className="mt-6 max-w-[18ch] font-display text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-ink text-balance sm:text-6xl xl:text-7xl">
                  Understand the system, not just the files.
                </h1>
                <p className="mt-7 max-w-2xl text-xl leading-[1.6] text-muted">
                  Every surface is built on the same indexed repository: files, symbols, edges,
                  findings and retrieved evidence. Each one is useful on its own; together they
                  replace the scattered archaeology of search, grep, diagrams and oral tradition.
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <p className="text-[0.75rem] text-faint">
                  Shared foundation
                </p>
                <ul className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-0">
                  {[
                    ["Indexed once", "Files, symbols, line ranges, signatures"],
                    ["One graph", "Contains, imports, calls, exposes, tests"],
                    ["Bounded evidence", "Retrieved before any model runs"],
                    ["Stated limits", "Parser mode, confidence, missing data"],
                  ].map(([title, note], index) => (
                    <li
                      key={title}
                      className="flex items-start gap-3.5 border-t border-line py-3.5 text-[0.9375rem] leading-relaxed"
                    >
                      <span className="mt-0.5 font-mono text-[0.75rem] text-faint">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{title}</span>
                        <span className="mt-0.5 block text-muted">{note}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <Reveal
              delay={0.1}
              className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-4"
            >
              {sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="group flex w-full items-center gap-2.5 rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[0.8125rem] text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
                >
                  <span className="font-mono text-[0.75rem] text-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <section.icon
                    className="h-3.5 w-3.5 text-faint transition-colors group-hover:text-accent"
                    aria-hidden="true"
                  />
                  {section.eyebrow}
                </a>
              ))}
            </Reveal>
          </div>
        </section>

        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className={`scroll-mt-20 border-b border-line ${index % 2 === 1 ? "bg-shell" : ""}`}
          >
            <div className="container-wide grid grid-cols-[minmax(0,1fr)] gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-24 lg:py-24">
              <Reveal>
                <div className="flex items-center gap-3">
                  <span className="text-[0.75rem] text-faint">
                    {String(index + 1).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}
                  </span>
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent shadow-card">
                    <section.icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                  </span>
                </div>
                <p className="eyebrow mt-6">{section.eyebrow}</p>
                <h2 className="mt-4 max-w-[22ch] font-display text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-ink text-balance sm:text-5xl">
                  {section.title}
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-[1.65] text-muted">{section.body}</p>
              </Reveal>

              <Reveal delay={0.08}>
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-0 sm:grid-cols-2 lg:grid-cols-1">
                  {section.bullets.map((bullet, bulletIndex) => (
                    <li
                      key={bullet}
                      className="group flex items-start gap-4 border-t border-line py-4 text-base leading-relaxed text-muted transition-colors duration-200 hover:text-ink"
                    >
                      <span className="mt-0.5 font-mono text-[0.75rem] text-faint transition-colors group-hover:text-accent">
                        {String(bulletIndex + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">{bullet}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[0.75rem] text-faint">
                  Available in this build · deterministic unless marked otherwise
                </p>
              </Reveal>
            </div>
          </section>
        ))}

        <section className="border-t border-line bg-shell">
          <div className="container-wide py-16 sm:py-20 lg:py-24">
            <Reveal>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] lg:items-end">
                <div>
                  <p className="eyebrow">Next step</p>
                  <h2 className="mt-6 max-w-[22ch] font-display text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-ink sm:text-6xl">
                    See it against a repository you know.
                  </h2>
                  <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
                    Start with the demo, then connect GitHub or GitLab read access. No billing is
                    enabled in this build.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link href="/architecture" className={buttonStyles("outline", "lg", "w-full")}>
                    Architecture
                  </Link>
                  <Link href="/register" className={buttonStyles("primary", "lg", "group w-full")}>
                    Create account
                    <ArrowRight className="arrow-slide h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
