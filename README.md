# LeKnowde

**Learn the Code. Know the System.**

LeKnowde turns a repository into a system you can inspect: files, symbols,
imports, routes, data entities, dependency edges, risk findings, documentation
and a grounded assistant. Deterministic analysis runs first; a language model
may explain the result, but only over retrieved evidence, and every generated
claim is labelled as generated.

The project is a working, self-hostable application, not a landing page. A
bundled demo repository (`leknowde/mineral-notes`) exercises the complete
pipeline — ingest → parse → graph → retrieval → impact → documentation —
without any external credentials.

---

## Stack

| Layer | Technology | Runs in this build |
| --- | --- | --- |
| Web | Next.js 15 (App Router), React 19, TypeScript 5.9, Tailwind 3.4 | Yes |
| UI | Framer Motion, React Flow (`@xyflow/react`), Monaco, Recharts, Lucide | Yes |
| API | Go 1.25 + Gin, JWT, bcrypt, AES-256-GCM | Yes |
| Storage | PostgreSQL (`pgx`) or SQLite (`modernc.org/sqlite`), one SQL schema | SQLite verified; PostgreSQL implemented |
| Graph | `graph_nodes` / `graph_edges` with recursive traversal in Go | Yes |
| Search | Full-text + JSON vectors + cosine similarity in Go | Yes (lexical mode) |
| Intelligence | Python 3.11 + FastAPI + Tree-sitter | Yes |
| LLM gateway | LiteLLM → Groq → Gemini (first configured wins) | Configured at runtime; no keys in this environment |

The web app is a BFF: the browser talks only to Next.js, which holds an
`httpOnly` session cookie and proxies API calls. The JWT never touches client
JavaScript.

---

## Quick start (native, no Docker)

Requirements: Node 22+, Go 1.25+, Python 3.11+.

```powershell
# 1. API (http://localhost:8080)
cd backend
$env:DATABASE_URL = "file:./data/leknowde.db"
$env:PORT = "8080"
go run ./cmd/server

# 2. Intelligence service (http://localhost:8000)
cd ai-services
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000

# 3. Web app (http://localhost:3000)
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>, create an account, then choose
**Connect demo repository** on the dashboard. Indexing runs in the background
(seconds for the demo) and every repository surface becomes available.

### Optional model keys

With no keys, retrieval, graphs, health, dependencies, impact and the
deterministic documentation fallback all work; chat and generated narratives
return an explicit "no provider configured" notice plus the evidence they
retrieved. To enable generated text, set **one** of:

```
GROQ_API_KEY=...
GEMINI_API_KEY=...
LITELLM_BASE_URL=... / LITELLM_API_KEY=... / LITELLM_MODEL=...
```

in `ai-services/.env` or the process environment.

### Docker

```powershell
copy .env.example .env      # then set JWT_SECRET and ENCRYPTION_KEY
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

`JWT_SECRET` must be at least 32 characters and `ENCRYPTION_KEY` must be 64 hex
characters (`openssl rand -hex 32`). See
[documentation/deployment.md](documentation/deployment.md) for profiles,
PostgreSQL notes and reverse-proxy guidance.

---

## What is implemented

All of the following was exercised in a real browser session against the
running stack, with zero page errors, plus a 57-assertion API smoke test.

### Public site
- `/` — product narrative, live evidence/citation treatment, graph context.
- `/features`, `/architecture` — capability and design pages.
- `/login`, `/register`, `/forgot-password`, `/reset-password`.
- `/legal/privacy`, `/legal/terms` — written to match the implementation and
  explicitly marked as templates requiring legal review.
- Original animated logo (L + node network), light/dark themes, reduced-motion
  support, SVG favicon.

### Interface and design system
- "Mineral Signal" identity: Sora for display, Manrope for text, IBM Plex Mono
  for code and identifiers; sans-serif labels for interface metadata; stone and
  sage palette; no gradients, glows or translucent cards.
- Type scale from 12px micro-labels to 64px display, 17px body base, 12px floor
  across every route (verified by DOM measurement, not by eye; the interactive
  graph canvas scales as a unit when fitted or zoomed).
- Channel-form colour tokens (`--line-rgb` + `rgb(var(--line-rgb) / <alpha-value>)`)
  so opacity modifiers such as `border-line/70` compile and render.
- Motion vocabulary in `components/motion/reveal.tsx`: `Reveal`, `Stagger`,
  `StaggerItem`, `CountUp`, `Press`, plus route-level transitions and
  `layoutId` pills in the app shell. Every one checks
  `prefers-reduced-motion` through a hydration-safe hook.
- The brand mark doubles as the loading state (`components/brand/logo-loader.tsx`):
  a looping ring, redrawn "L" and settling nodes for route loads, dashboard and
  repository skeletons, file loading, assistant retrieval and analysis waits.
  Reduced motion renders the mark still and the label only.
- Logged-in chrome is deliberately flat: a compact repository identity band and
  one hairline tab strip with a sliding active rule, edge arrows when the twelve
  sections overflow, and a live indexing strip that appears only while a job is
  queued, running or failed.
- Responsive audit at 1920×842 and 390×844, dark and light: 36 application and
  marketing routes plus the four auth screens, zero console/page errors, zero
  horizontal page overflow. Wide tables and code blocks scroll inside their own
  containers rather than pushing the page.

### Application
- Dashboard reduced to four blocks: a workspace pulse line, four computed
  statistics, the repository list and a two-column Activity/Runtime rail. Account
  shortcuts and duplicate "where to go next" cards were removed.
- Workspaces: create, rename, members and roles, delete.
- Repositories: demo dataset, GitHub OAuth, GitHub/GitLab personal access
  tokens, manual `owner/name`, re-index, delete.
- Repository overview: composition, fan-in leaders, detected routes, commits
  (demo history labelled as fixtures), and merged health signals with deductions.
- Explorer with Monaco and file tree; symbol index; dependency summary with
  cycles and unused-import candidates.
- Architecture studio: React Flow graph with deterministic layout, architecture
  / module / file / symbol / test projections.
- Change impact: transparent additive risk model, affected files with depth and
  path, evidence snippets, existing tests, optional AI narrative.
- Documentation studio: verified facts first, model prose second (clearly
  separated), persisted documents.
- README and About studio: deterministic README draft plus a GitHub About panel
  with up to 20 generated topics, editable description, persisted overrides and
  save-to-documentation flow.
- Health report: 18 findings on the demo, severity chart, penalties and stated
  limitations.
- Assistant: retrieval-first answers, per-citation file/line/snippet/reason,
  conversations persisted, `?q=` deep-link prefill, prompt-injection fencing.
- Onboarding plan: 7 deterministic steps with exercises and browser-local
  progress.
- Digital twin: queryable static graph projection with node-kind statistics and
  explicit "not a simulation" wording.
- Pull-request analysis: deterministic change-impact plus optional narrative.
- Notifications with server-side read state; audit log with filters;
  integrations with token verification/encryption; account settings including
  password-reset token flow and confirmed account deletion.

---

## Repository layout

```
backend/                 Go API, migrations, demo provider, smoke script
  cmd/server/            entrypoint
  internal/              httpapi, store, index, analysis, retrieval, gitprov, secure
  migrations/            one dialect-aware SQL schema (SQLite + PostgreSQL)
frontend/                Next.js app, BFF session routes, components, lib
ai-services/             FastAPI parser/embeddings/chat/docs/impact contracts
shared/                  cross-service contracts and notes
documentation/           setup, deployment, security, delivery report
infrastructure/docker/   Dockerfiles + compose (core and optional profiles)
samples/                 sample requests/payloads
```

---

## Verification

```powershell
# API end-to-end (starts its own account, indexes the demo, removes it after)
cd backend
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
# => SMOKE_OK checks=57

# Intelligence service
cd ai-services
.\.venv\Scripts\python -m pytest -q          # 11 passed

# Type checking and production build
cd frontend
npm run typecheck
npm run build
```

Last full run in this environment:

| Check | Result |
| --- | --- |
| `go build ./...` | pass |
| `go vet ./...` | pass |
| `backend/scripts/smoke.ps1` | `SMOKE_OK checks=57` |
| `pytest` (ai-services) | 11 passed |
| `npm run typecheck` | pass |
| `npm run build` | pass (36 routes) |
| Browser smoke (Chrome, live stack) | pass, 0 page errors |

---

## Honest status

Implemented and verified locally: everything listed above, on SQLite, with the
deterministic analysers and the lexical embedding mode.

Implemented but not exercised here: the PostgreSQL code path (same schema,
`Rebind` dialect layer) — no PostgreSQL server was available in this
environment.

Not implemented in this build:

- Neo4j and Redis adapters. The graph lives in SQL tables with recursive Go
  traversal; background jobs use a DB-backed queue with leases. Compose ships
  optional Neo4j/Redis services, clearly marked as not wired in.
- pgvector indexing. Vectors are stored as JSON and compared with in-Go cosine
  similarity; `pgvector` is available in the database image for a future
  migration.
- Outbound email/push/webhook delivery. Notifications are database rows.
- Repository code execution. LeKnowde never runs fetched code; tests are listed
  from static detection only.
- Billing. No payment integration exists, and this build has no pricing or
  checkout surface.
- OAuth sign-in with GitHub (only repository access OAuth is implemented).

Known deliberate fixture: the demo repository's `server/src/routes/auth.ts`
calls `findUserById(rotated.familyId)`. It is a real bug in the fixture, kept so
the reviewer can see the analysis find something true.

---

## Documentation

- [Setup](documentation/setup.md)
- [Deployment](documentation/deployment.md)
- [Security](documentation/security.md)
- [Delivery report](documentation/delivery-report.md)
- [API surface](documentation/api.md)

## License

No license has been granted for redistribution. Treat the source as
all-rights-reserved until the operator adds one.
