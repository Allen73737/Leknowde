import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Boxes,
  Braces,
  CheckCircle2,
  Compass,
  Cpu,
  Database,
  FileCode2,
  GitPullRequest,
  Layers,
  LockKeyhole,
  Network,
  Radar,
  Search,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";

import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { HeroVisual } from "@/components/site/hero-visual";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";

const capabilities = [
  {
    icon: Search,
    title: "Evidence-backed assistant",
    description:
      "Ask in plain language. Retrieval runs first; the answer arrives with cited file paths, line ranges and snippets. If evidence is missing, the assistant says so.",
    href: "/features#assistant",
  },
  {
    icon: Network,
    title: "Architecture studio",
    description:
      "Explore modules, APIs, entities and services as a navigable graph. Projections for architecture, module, file, symbol and test views.",
    href: "/features#architecture",
  },
  {
    icon: Radar,
    title: "Change impact",
    description:
      "See the blast radius before you edit: affected files with depth, path, evidence snippets and an additive risk score whose weights are printed.",
    href: "/features#impact",
  },
  {
    icon: Workflow,
    title: "Dependency intelligence",
    description:
      "Import graphs, coupling, cycles and unused-import candidates — computed deterministically from the parsed source, not guessed.",
    href: "/features#dependencies",
  },
  {
    icon: BookOpen,
    title: "Living documentation",
    description:
      "Generate architecture, API, database, onboarding and testing documents from indexed facts. Drift is detected when source structure moves.",
    href: "/features#documentation",
  },
  {
    icon: Activity,
    title: "Software health",
    description:
      "Pattern-based findings for security review, missing tests, duplication and unused imports — each with calibrated confidence and stated limits.",
    href: "/features#health",
  },
  {
    icon: Compass,
    title: "Developer onboarding",
    description:
      "A reading order derived from entry points and dependency degree: seven steps with estimated time, an exercise per step and the questions worth asking.",
    href: "/features#onboarding",
  },
  {
    icon: GitPullRequest,
    title: "Pull-request intelligence",
    description:
      "For connected providers, changed files are mapped to indexed modules, affected paths are resolved through the graph, and missing tests are highlighted.",
    href: "/features#pr",
  },
];

const facts = [
  "Symbols, line ranges and signatures",
  "Import and call relationships",
  "Route declarations and API call sites",
  "Schema tables and entities",
  "Dependency cycles and module coupling",
  "Risk factors with exposed weights",
];

const modelJobs = [
  "Explain a flow in readable prose",
  "Suggest an implementation sequence",
  "Draft documentation from verified facts",
  "Summarise trade-offs and uncertainty",
];

const proofPoints = [
  "Bundled demo repository",
  "GitHub & GitLab read access",
  "No code execution",
];

const guarantees = [
  {
    icon: Search,
    title: "Retrieval first",
    note: "No evidence, no generated answer.",
  },
  {
    icon: ShieldCheck,
    title: "Static analysis only",
    note: "Parsed, mapped, never executed.",
  },
  {
    icon: FileCode2,
    title: "Line-level citations",
    note: "Every claim maps to a file range.",
  },
  {
    icon: Database,
    title: "SQLite or PostgreSQL",
    note: "Runs locally or beside the code.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main id="main">
        {/* Hero ------------------------------------------------------------ */}
        <section className="relative overflow-hidden border-b border-line">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid-backdrop opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
          />
          <div className="container-wide relative grid grid-cols-[minmax(0,1fr)] gap-14 pb-16 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-center lg:gap-16 lg:pb-20 xl:gap-24">
            <div className="min-w-0">
              <Stagger gap={0.07}>
                <StaggerItem>
                  <p className="font-mono text-[0.75rem] uppercase tracking-[0.18em] text-faint">
                    Deterministic core · grounded AI
                  </p>
                </StaggerItem>
                <StaggerItem>
                  <h1 className="mt-5 max-w-[15ch] font-display text-[2.75rem] font-semibold leading-[1] tracking-[-0.045em] text-ink sm:text-[3.75rem] xl:text-[4.25rem]">
                    Learn the Code.
                    <br />
                    <span className="text-accent">Know the System.</span>
                  </h1>
                </StaggerItem>
                <StaggerItem>
                  <p className="mt-6 max-w-2xl text-lg leading-[1.6] text-muted">
                    LeKnowde turns a repository into a system you can inspect: structure,
                    dependencies, architecture, risk and documentation. Every AI answer is grounded
                    in retrieved source evidence, or it declines.
                  </p>
                </StaggerItem>
                <StaggerItem>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <Link href="/register" className={buttonStyles("primary", "lg", "group")}>
                      Create an account
                      <ArrowRight className="arrow-slide h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                    </Link>
                    <Link href="/features" className={buttonStyles("outline", "lg")}>
                      Explore the platform
                    </Link>
                  </div>
                </StaggerItem>
                <StaggerItem>
                  <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.8125rem] text-faint">
                    {proofPoints.map((point) => (
                      <span key={point} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                        {point}
                      </span>
                    ))}
                  </div>
                </StaggerItem>
              </Stagger>
            </div>
            <Reveal delay={0.15} y={26}>
              <HeroVisual />
            </Reveal>
          </div>
        </section>

        {/* Signal band ----------------------------------------------------- */}
        <section aria-label="Platform guarantees" className="border-b border-line">
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {guarantees.map((item, index) => (
              <Reveal
                key={item.title}
                delay={index * 0.05}
                className="group bg-surface px-6 py-7 transition-colors duration-300 hover:bg-shell xl:px-10"
              >
                <div className="flex items-center justify-between gap-3">
                  <item.icon
                    className="h-[1.125rem] w-[1.125rem] text-accent transition-transform duration-300 ease-smooth group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[0.75rem] tracking-[0.18em] text-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-5 font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                  {item.title}
                </p>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{item.note}</p>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="border-b border-line bg-shell">
          <div className="container-wide py-16 sm:py-20 lg:py-24">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
              <Reveal>
                <p className="eyebrow">Problem</p>
                <h2 className="mt-5 max-w-[20ch] font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-4xl">
                  Reading code is not the same as understanding a system.
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="space-y-6 text-lg leading-[1.7] text-muted">
                  <p>
                    A repository has two kinds of knowledge. The first is explicit: files, symbols,
                    imports, routes, tables. The second is relational: what calls what, what breaks
                    when a contract changes, which modules carry the risk.
                  </p>
                  <p>
                    Most tools answer questions without showing their work. LeKnowde indexes the
                    explicit knowledge first, builds the relationships into a graph, and only then
                    allows a language model to reason over retrieved evidence.
                  </p>
                  <p className="border-l-2 border-accent pl-5 text-lg leading-relaxed text-ink">
                    The result is not a chat window over a code search index. It is a system map with
                    an assistant attached.
                  </p>
                </div>
              </Reveal>
            </div>

            <Stagger className="mt-16 grid gap-0 overflow-hidden rounded-card border border-line bg-canvas shadow-card md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Index",
                  text: "Fetch the branch, parse supported languages with Tree-sitter, resolve imports and persist files, symbols and chunks.",
                  icon: FileCode2,
                },
                {
                  step: "02",
                  title: "Map",
                  text: "Build the graph: modules, files, symbols, APIs and entities, connected by CONTAINS, IMPORTS, CALLS, EXPOSES and TESTS.",
                  icon: Network,
                },
                {
                  step: "03",
                  title: "Reason",
                  text: "Retrieve evidence, compute impact deterministically, then ask a model to explain only what the evidence supports.",
                  icon: Search,
                },
              ].map((item, index) => (
                <StaggerItem
                  key={item.step}
                  className={`group p-7 transition-colors duration-300 hover:bg-surface ${
                    index < 2 ? "border-b border-line md:border-b-0 md:border-r" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.75rem] tracking-[0.18em] text-faint">
                      {item.step}
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-shell text-accent transition-transform duration-300 ease-smooth group-hover:-translate-y-0.5">
                      <item.icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-6 font-display text-xl font-semibold tracking-[-0.02em] text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">{item.text}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* Capabilities --------------------------------------------------- */}
        <section id="capabilities" className="border-b border-line">
          <div className="container-wide py-16 sm:py-20 lg:py-24">
            <Reveal className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Surfaces</p>
                <h2 className="mt-5 max-w-[24ch] font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-4xl">
                  One repository. Eight ways in.
                </h2>
              </div>
              <Link
                href="/features"
                className="group inline-flex items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-ink"
              >
                Full capability map
                <ArrowRight className="arrow-slide h-4 w-4" aria-hidden="true" />
              </Link>
            </Reveal>

            <Stagger className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4" gap={0.05}>
              {capabilities.map((capability) => (
                <StaggerItem key={capability.title} className="h-full">
                  <Link
                    href={capability.href}
                    className="card-hover group flex h-full flex-col rounded-card border border-line bg-surface p-6 shadow-card"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-shell text-accent transition-all duration-300 ease-smooth group-hover:border-accent/40 group-hover:bg-accent/10">
                      <capability.icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 font-display text-lg font-semibold tracking-[-0.015em] text-ink">
                      {capability.title}
                    </h3>
                    <p className="mt-2.5 flex-1 text-[0.9375rem] leading-relaxed text-muted">
                      {capability.description}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-faint transition-colors duration-200 group-hover:text-accent">
                      Inspect
                      <ArrowRight className="arrow-slide h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* Deterministic vs probabilistic --------------------------------- */}
        <section className="border-b border-line bg-shell">
          <div className="container-wide py-16 sm:py-20 lg:py-24">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-24">
              <Reveal>
                <p className="eyebrow">Two layers</p>
                <h2 className="mt-5 max-w-[26ch] font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-4xl">
                  Facts are computed. Prose is generated. The interface never confuses them.
                </h2>
              </Reveal>
              <Reveal delay={0.06}>
                <p className="max-w-xl text-lg leading-[1.65] text-muted">
                  The platform works without a model provider. Chat returns retrieved evidence with
                  an explicit notice, while graphs, impact analysis, health checks and documentation
                  fallback remain fully available.
                </p>
              </Reveal>
            </div>

            <div className="mt-14 grid gap-0 overflow-hidden rounded-card border border-line bg-canvas shadow-card md:grid-cols-2">
              <Reveal className="flex flex-col border-b border-line p-7 sm:p-9 md:border-b-0 md:border-r xl:p-11">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-base font-semibold text-ink">
                    <Terminal className="h-[1.125rem] w-[1.125rem] text-accent" aria-hidden="true" />
                    Deterministic
                  </span>
                  <Badge tone="success">always available</Badge>
                </div>
                <ul className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-0 pb-7 sm:grid-cols-2">
                  {facts.map((fact) => (
                    <li
                      key={fact}
                      className="flex items-start gap-3 border-t border-line/70 py-3 text-[0.9375rem] leading-relaxed text-muted"
                    >
                      <CheckCircle2
                        className="mt-1 h-4 w-4 shrink-0 text-success"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">{fact}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto border-t border-line pt-5 font-mono text-[0.75rem] leading-relaxed text-faint">
                  Parser fidelity is reported as tree-sitter or regex-fallback on every surface.
                </p>
              </Reveal>
              <Reveal delay={0.08} className="flex flex-col p-7 sm:p-9 xl:p-11">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-base font-semibold text-ink">
                    <Cpu className="h-[1.125rem] w-[1.125rem] text-accent" aria-hidden="true" />
                    Model-generated
                  </span>
                  <Badge tone="warning">requires provider</Badge>
                </div>
                <ul className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-0 pb-7 sm:grid-cols-2">
                  {modelJobs.map((job) => (
                    <li
                      key={job}
                      className="flex items-start gap-3 border-t border-line/70 py-3 text-[0.9375rem] leading-relaxed text-muted"
                    >
                      <span
                        className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">{job}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto border-t border-line pt-5 font-mono text-[0.75rem] leading-relaxed text-faint">
                  LiteLLM → Groq → Gemini fallback. Token usage is recorded per response.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Evidence example ---------------------------------------------- */}
        <section className="border-b border-line">
          <div className="container-wide grid grid-cols-[minmax(0,1fr)] gap-14 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-24 lg:py-28">
            <Reveal>
              <p className="eyebrow">Answers</p>
              <h2 className="mt-5 max-w-[24ch] font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-4xl">
                A confident answer is not the same as a correct one.
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Retrieval combines lexical scoring, hashed lexical vectors and symbol matches. The
                assistant receives a bounded evidence set. Citations are filtered to files that were
                actually supplied.
              </p>
              <div className="mt-9 space-y-5">
                {[
                  [
                    "Retrieval runs before generation",
                    "No evidence, no invented answer.",
                  ],
                  [
                    "Prompt injection is treated as data",
                    "Repository text cannot change system instructions.",
                  ],
                  [
                    "Confidence is explicit",
                    "High, medium, low or insufficient — with uncertainty stated.",
                  ],
                ].map(([title, text]) => (
                  <div key={title} className="flex gap-4">
                    <ShieldCheck
                      className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-base font-semibold text-ink">{title}</p>
                      <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-shell px-5 py-4">
                  <span className="flex items-center gap-2 text-[0.9375rem] font-medium text-ink">
                    <Search className="h-4 w-4 text-faint" aria-hidden="true" />
                    How is a refresh token replay handled?
                  </span>
                  <Badge>3 citations</Badge>
                </div>
                <div className="divide-y divide-line">
                  {[
                    {
                      path: "server/src/auth/refresh.ts",
                      lines: "55–59",
                      reason: "reuse branch revokes the token family",
                    },
                    {
                      path: "server/src/auth/tokens.ts",
                      lines: "35–43",
                      reason: "opaque 48-byte token, peppered SHA-256",
                    },
                    {
                      path: "server/test/auth.refresh.test.ts",
                      lines: "6–29",
                      reason: "test asserts replay detects reuse",
                    },
                  ].map((item, index) => (
                    <div
                      key={item.path}
                      className="group flex items-start gap-4 px-5 py-4 transition-colors duration-200 hover:bg-raised/40"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-shell font-mono text-[0.75rem] text-faint">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-mono text-[0.8125rem] text-ink">{item.path}</p>
                        <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">{item.reason}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[0.75rem] text-faint">{item.lines}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[0.75rem] text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          cited
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-shell px-5 py-3.5 font-mono text-[0.75rem] text-faint">
                  <span>Every citation maps to an indexed file and a real line range.</span>
                  <span className="text-accent">confidence: high</span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Architecture -------------------------------------------------- */}
        <section className="border-b border-line bg-shell">
          <div className="container-wide py-16 sm:py-20 lg:py-24">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <Reveal>
                <p className="eyebrow">Architecture</p>
                <h2 className="mt-5 max-w-[18ch] font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-4xl">
                  A boring, inspectable architecture.
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                  Next.js handles the product surface and a same-origin BFF. The Go API enforces
                  auth, permissions and data access. Python does parsing and model orchestration.
                  The platform runs locally with SQLite or PostgreSQL; the graph is stored in SQL
                  tables and traversed in Go.
                </p>
                <Link
                  href="/architecture"
                  className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-ink"
                >
                  Read the architecture
                  <ArrowRight className="arrow-slide h-4 w-4" aria-hidden="true" />
                </Link>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="rounded-card border border-line bg-canvas p-5 shadow-card">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[
                      {
                        icon: Layers,
                        label: "Next.js",
                        note: "App Router · BFF proxy · httpOnly session",
                      },
                      {
                        icon: Terminal,
                        label: "Go API",
                        note: "Gin · RBAC · audit · jobs · graph queries",
                      },
                      {
                        icon: Braces,
                        label: "Python",
                        note: "Tree-sitter · retrieval · LiteLLM gateway",
                      },
                      {
                        icon: Database,
                        label: "Storage",
                        note: "PostgreSQL or SQLite · SQL graph · JSON vectors",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg border border-line bg-surface p-4 transition-colors duration-200 hover:border-line-strong"
                      >
                        <div className="flex items-center gap-2.5">
                          <item.icon className="h-4 w-4 text-accent" aria-hidden="true" />
                          <span className="text-[0.9375rem] font-semibold text-ink">
                            {item.label}
                          </span>
                        </div>
                        <p className="mt-2 font-mono text-[0.75rem] leading-relaxed text-faint">
                          {item.note}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-shell px-3.5 py-2.5">
                    <span className="font-mono text-[0.75rem] uppercase tracking-[0.12em] text-faint">
                      browser
                    </span>
                    <span className="h-px flex-1 bg-line-strong" />
                    <span className="font-mono text-[0.75rem] uppercase tracking-[0.12em] text-muted">
                      BFF
                    </span>
                    <span className="h-px flex-1 bg-line-strong" />
                    <span className="font-mono text-[0.75rem] uppercase tracking-[0.12em] text-muted">
                      Go
                    </span>
                    <span className="h-px flex-1 bg-line-strong" />
                    <span className="font-mono text-[0.75rem] uppercase tracking-[0.12em] text-muted">
                      AI
                    </span>
                    <span className="h-px flex-1 bg-line-strong" />
                    <span className="font-mono text-[0.75rem] uppercase tracking-[0.12em] text-faint">
                      data
                    </span>
                  </div>
                  <p className="mt-3.5 text-[0.8125rem] leading-relaxed text-faint">
                    The JWT stays in an httpOnly cookie. The browser talks to the same origin; no
                    provider token is exposed to client JavaScript.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Security ------------------------------------------------------ */}
        <section className="border-b border-line">
          <div className="container-wide py-16 sm:py-20 lg:py-24">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
              <Reveal>
                <p className="eyebrow">Security</p>
                <h2 className="mt-5 max-w-[16ch] font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-4xl">
                  Untrusted code in. Bounded analysis out.
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                  Repository content is attacker-controlled input. The platform never executes
                  fetched code, never interpolates it into prompts without fencing, and never
                  returns provider credentials.
                </p>
                <div className="mt-8 flex max-w-lg items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                  <p className="text-[0.875rem] leading-relaxed text-muted">
                    Not in this build: SSO, SCIM provisioning and per-tenant encryption keys. Demo
                    accounts and the bundled repository are labelled wherever they appear.
                  </p>
                </div>
              </Reveal>
              <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3" gap={0.05}>
                {[
                  {
                    icon: LockKeyhole,
                    title: "bcrypt + JWT",
                    text: "Passwords hashed; sessions signed with HS256.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Encrypted tokens",
                    text: "Provider tokens sealed with AES-256-GCM at rest.",
                  },
                  {
                    icon: Boxes,
                    title: "Workspace RBAC",
                    text: "Every repository lookup is scoped to membership.",
                  },
                  {
                    icon: Search,
                    title: "Audit trail",
                    text: "Security-relevant actions recorded per organization.",
                  },
                  {
                    icon: GitPullRequest,
                    title: "Injection defence",
                    text: "Retrieved text is delimitable data, not instructions.",
                  },
                  {
                    icon: Network,
                    title: "No code execution",
                    text: "Static parsing only; no sandbox escape surface.",
                  },
                ].map((item) => (
                  <StaggerItem key={item.title}>
                    <div className="card-hover group h-full rounded-card border border-line bg-surface p-5 shadow-card">
                      <item.icon
                        className="h-[1.125rem] w-[1.125rem] text-accent transition-transform duration-300 ease-smooth group-hover:-translate-y-0.5"
                        aria-hidden="true"
                      />
                      <p className="mt-3.5 text-[0.9375rem] font-semibold text-ink">{item.title}</p>
                      <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
                        {item.text}
                      </p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </section>

        {/* CTA ----------------------------------------------------------- */}
        <section className="border-t border-line bg-shell">
          <div className="container-wide py-16 sm:py-20 lg:py-24">
            <Reveal>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)] lg:items-end">
                <div>
                  <p className="eyebrow">Start here</p>
                  <h2 className="mt-6 max-w-[24ch] font-display text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-ink sm:text-6xl xl:text-7xl">
                    Connect a repository, or start with the demo.
                  </h2>
                  <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
                    The demo repository is a small TypeScript notes service with refresh-token
                    authentication, deliberately containing a real flaw for impact analysis to find.
                    Commit and pull-request metadata for it are fixtures and are labelled as such.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link href="/register" className={buttonStyles("primary", "lg", "group w-full")}>
                    Create an account
                    <ArrowRight
                      className="arrow-slide h-[1.125rem] w-[1.125rem]"
                      aria-hidden="true"
                    />
                  </Link>
                  <Link href="/login" className={buttonStyles("outline", "lg", "w-full")}>
                    Sign in
                  </Link>
                  <p className="mt-2 font-mono text-[0.75rem] uppercase tracking-[0.14em] text-faint">
                    No billing in this build
                  </p>
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
