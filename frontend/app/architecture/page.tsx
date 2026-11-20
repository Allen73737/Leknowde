import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Braces,
  Database,
  GitBranch,
  Layers,
  LockKeyhole,
  Network,
  Server,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";

import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "How LeKnowde is built: Next.js BFF, Go API, Python intelligence service, SQL storage, graph model and grounded retrieval.",
};

const layers = [
  {
    name: "Presentation",
    icon: Layers,
    stack: "Next.js 15 App Router · React 19 · TypeScript strict · Tailwind · Framer Motion",
    role: "Public site and authenticated workspace. Server components fetch with the session cookie; client mutations go through the same-origin BFF.",
  },
  {
    name: "API boundary",
    icon: Server,
    stack: "Go 1.27 · Gin · JWT HS256 · bcrypt · AES-256-GCM",
    role: "Authentication, workspace RBAC, repository ingestion, graph queries, jobs, audit logs, notifications and all persistence.",
  },
  {
    name: "Intelligence",
    icon: Braces,
    stack: "Python 3.11 · FastAPI · Tree-sitter · LiteLLM → Groq → Gemini",
    role: "Structural parsing, lexical embeddings, retrieval orchestration and bounded model calls. The service is internal-token protected.",
  },
  {
    name: "Storage",
    icon: Database,
    stack: "PostgreSQL + pgvector · Neo4j-ready graph layer · SQLite fallback",
    role: "One portable SQL schema runs on PostgreSQL and SQLite. Graph adjacency is stored in graph_nodes/graph_edges with recursive traversal; vectors are JSON with in-process cosine.",
  },
];

const flow = [
  "Browser requests /app/...",
  "Middleware checks the httpOnly session cookie",
  "Server component calls the Go API with Authorization",
  "Go enforces workspace membership on every repository lookup",
  "Repository data, graph and findings are returned",
  "Client mutations use /api/lk/* and never see the JWT",
];

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main id="main">
        <section className="border-b border-line bg-shell">
          <div className="container-wide py-16 sm:py-20">
            <p className="eyebrow">System architecture</p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink sm:text-5xl">
              Separate the product, the policy and the parser.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              LeKnowde is deliberately split along trust boundaries. The browser never holds a JWT or a provider
              token. The Go API owns authorization and persistence. The Python service owns parsing and model
              orchestration, and accepts only internal calls.
            </p>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="container-wide py-16">
            <div className="grid gap-3 md:grid-cols-2">
              {layers.map((layer) => (
                <div key={layer.name} className="rounded-card border border-line bg-surface p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded border border-line bg-shell text-accent">
                      <layer.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-[0.75rem] uppercase tracking-[0.14em] text-faint">{layer.name}</span>
                  </div>
                  <p className="mt-4 font-mono text-[0.75rem] leading-relaxed text-accent">{layer.stack}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{layer.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-shell">
          <div className="container-wide grid gap-12 py-16 sm:py-20 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <p className="eyebrow">Request path</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
                One origin, one session, no token in JavaScript.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                The App Router server components call the Go API directly while the session cookie is available.
                Interactive mutations use a catch-all route handler that attaches the Authorization header upstream.
                The browser only ever sees an httpOnly cookie.
              </p>
              <div className="mt-6 overflow-hidden rounded-card border border-line bg-canvas">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <span className="font-mono text-[0.75rem] text-faint">request lifecycle</span>
                  <Badge tone="success">same-origin</Badge>
                </div>
                <ol className="divide-y divide-line">
                  {flow.map((step, index) => (
                    <li key={step} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="mt-0.5 font-mono text-[0.75rem] text-faint">{String(index + 1).padStart(2, "0")}</span>
                      <span className="text-xs leading-relaxed text-muted">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div>
              <p className="eyebrow">Graph model</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
                The relationships are the product.
              </h2>
              <div className="mt-4 space-y-2">
                {[
                  ["CONTAINS", "module → file, file → symbol"],
                  ["IMPORTS", "file → file, with source line"],
                  ["CALLS", "symbol/file → symbol, with source line"],
                  ["EXPOSES", "module → api endpoint"],
                  ["CONSUMES", "file → api endpoint"],
                  ["TESTS", "test → file"],
                  ["DEPENDS_ON", "module → module"],
                ].map(([relation, shape]) => (
                  <div key={relation} className="flex items-center gap-3 rounded border border-line bg-canvas px-3 py-2">
                    <span className="w-24 shrink-0 font-mono text-[0.75rem] text-accent">{relation}</span>
                    <span className="text-[0.8125rem] text-muted">{shape}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-faint">
                Stored as an adjacency list in portable SQL. Traversal is recursive in Go, so the same code works with
                SQLite locally and PostgreSQL in deployment. A Neo4j adapter can implement the same graph contract
                without changing the product surface.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="container-wide py-16">
            <p className="eyebrow">Ingestion pipeline</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
              Deterministic before generative.
            </h2>
            <div className="mt-6 grid gap-2 lg:grid-cols-5">
              {[
                { icon: GitBranch, title: "Fetch", text: "Provider tree, branch and commits. File and size caps enforced." },
                { icon: Braces, title: "Parse", text: "Tree-sitter per language; regex fallback recorded as fidelity." },
                { icon: Network, title: "Resolve", text: "Relative imports, module roots, call targets, route declarations." },
                { icon: Database, title: "Persist", text: "Files, symbols, chunks, embeddings, findings and graph nodes." },
                { icon: Workflow, title: "Analyse", text: "Health, onboarding, documentation facts and impact readiness." },
              ].map((step, index) => (
                <div key={step.title} className="rounded-card border border-line bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <step.icon className="h-4 w-4 text-accent" aria-hidden="true" />
                    <span className="font-mono text-[0.75rem] text-faint">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-ink">{step.title}</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{step.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded border border-line bg-shell px-4 py-3 text-[0.8125rem] leading-relaxed text-faint">
              Jobs are leased and heartbeated in the database. There is no Redis or Kafka dependency for the indexing
              queue; the worker pool polls a queued job, renews its lease and records progress.
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-shell">
          <div className="container-wide grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="eyebrow">Trust boundaries</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
                Repository content is data, never an instruction.
              </h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {[
                  { icon: LockKeyhole, title: "Session isolation", text: "JWT in httpOnly cookie; BFF attaches it upstream." },
                  { icon: ShieldCheck, title: "RBAC everywhere", text: "Repository access resolves through workspace membership." },
                  { icon: Boxes, title: "Encrypted integration tokens", text: "AES-256-GCM at rest; never returned by the API." },
                  { icon: Network, title: "Internal AI token", text: "The Python service rejects calls without X-Internal-Token." },
                ].map((item) => (
                  <div key={item.title} className="rounded border border-line bg-canvas p-3.5">
                    <item.icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <p className="mt-2 text-[0.8125rem] font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-card border border-line bg-surface p-5">
              <p className="eyebrow">Deployment shapes</p>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                    <Terminal className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Local development
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                    Go API + Python service + Next.js. SQLite file database. No external services required.
                  </p>
                </div>
                <div className="border-t border-line pt-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                    <Server className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Managed services
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                    PostgreSQL with pgvector for relational and vector data, Neo4j for graph traversal, Redis for
                    caching and rate limits, LiteLLM proxy for provider routing.
                  </p>
                </div>
                <div className="border-t border-line pt-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                    <Database className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Portable schema
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                    The same migrations run on both drivers through a dialect-aware rebind layer. UUID ids and RFC3339
                    timestamps are stored as text for portability.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="container-wide flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <p className="eyebrow">Inspect the claims</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
                The implementation is in the repository.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted">
                Feature pages cite implementation paths. This page describes the actual deployed boundaries, not an
                aspirational diagram.
              </p>
            </div>
            <Link href="/features" className={buttonStyles("primary", "md")}>
              Feature map <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
