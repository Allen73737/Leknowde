# Delivery report

Date: 2026-11-16 (interface revisions dated 2026-11-16 and 2026-11-18)
Product: LeKnowde — "Learn the Code. Know the System."
Scope delivered: complete web application, API, intelligence service, database
schema, demo dataset, tests, deployment artifacts and documentation.

This report uses four status words consistently:

- **Verified** — executed successfully in this environment and observed.
- **Implemented, unverified** — code exists and compiles, but the environment
  lacked the dependency needed to exercise it.
- **Scaffolded** — configuration or placeholder exists; no application logic
  depends on it.
- **Not implemented** — absent. No claim is made that it works.

---

## 1. Architecture

```
Browser
  │  httpOnly lk_session cookie (JWT never exposed to JS)
  ▼
Next.js 15 web app (port 3000)
  │  /api/lk/* same-origin proxy adds Authorization
  ▼
Go + Gin API (port 8080)
  ├── PostgreSQL (pgx) or SQLite (modernc) — one dialect-aware schema
  ├── graph_nodes / graph_edges + recursive Go traversal
  ├── JSON vectors + in-Go cosine similarity
  ├── DB-backed job queue (leases + heartbeats)
  └── Python FastAPI intelligence service (port 8000)
        ├── Tree-sitter parsing
        ├── retrieval / evidence assembly
        └── LiteLLM → Groq → Gemini (optional)
```

Deterministic analysis (parse, graph, dependencies, health, impact scoring,
onboarding plan, twin projection) never depends on a model. Generated prose is
additive and labelled with provider, model and uncertainty.

## 2. Verified

| Area | Evidence |
| --- | --- |
| API build | `go build ./...` → pass |
| API static analysis | `go vet ./...` → pass |
| API end-to-end | `SMOKE_OK checks=57`, including impact-narrative payload acceptance |
| Intelligence tests | 11 pytest tests pass |
| Frontend types | `npm run typecheck` → pass |
| Frontend production build | `npm run build` → 36 route entries (9 prerendered, 27 server-rendered) |
| Production server | `npm run start` → HTTP 200, signed-in dashboard renders |
| Browser flows (Chrome, live stack) | register → dashboard → connect demo → index → overview → onboarding (+progress persistence) → twin → assistant (`?q=` prefill, evidence, honest no-provider notice) → notifications mark-read → integrations → settings → audit → legal pages → architecture graph → light/dark toggle; 0 page errors |
| Responsive audit (headless Chromium, 1920×842 and 390×844) | 24 application and marketing routes plus four auth screens, dark and light: no console/page errors, no text below 12px, no horizontal page overflow; wide tables and code blocks scroll inside their own containers |
| Demo dataset | 19 files, 62 symbols, 92 graph nodes, 158 edges, 18 findings, health 80/"fair", 7 onboarding steps |
| Impact analysis | score 10 (medium), 14 seeds, 13 affected files on the demo query |
| Seed data honesty | demo commits/PRs labelled fixtures; demo repo badge on each surface |
| Dataset cleanup | smoke test deletes its repository and account; 4 stray verification accounts removed during the session |

Screenshot references (captured in-session, not committed): architecture page in
light and dark themes.

### 2.1 Interface revision (2026-11-16)

The interface was rebuilt on a single design system rather than patched page by
page:

- **Identity** — "Mineral Signal" kept intact: Sora display / Manrope text /
  IBM Plex Mono for code and identifiers, stone-and-sage palette, solid layered
  surfaces, inset highlights and elevation. No gradients, glow, glass or
  translucent cards.
- **Legibility** — type scale raised to 12/14/15/17/19/22/32/40/64px with a 12px
  floor. A DOM sweep asserts no rendered text below 12px on any route.
- **Colour tokens** — palette values moved to channel form
  (`--line-rgb: 53 66 59` plus `--line: rgb(var(--line-rgb))`) and Tailwind
  colours to `rgb(var(--x-rgb) / <alpha-value>)`, which fixed all opacity
  modifiers that had been silently dropped.
- **Motion** — shared `Reveal` / `Stagger` / `StaggerItem` / `CountUp` / `Press`
  primitives, route transitions, `layoutId` navigation pills, hover lifts and
  disclosure transitions. Each respects `prefers-reduced-motion`.
- **Responsive** — single-column grids now use `minmax(0, 1fr)` so long paths,
  tables and code cannot force the page wider than the viewport.

Defects found and fixed during the revision:

| Defect | Cause | Fix |
| --- | --- | --- |
| Dashboard stats froze near zero | `CountUp` recomputed its parse object every render, restarting the effect each frame | `useMemo` plus a final-value snap |
| `/dependencies` returned HTTP 500 | `FindCycles` returned a nil slice, serialising `cycles:null`, and the page read `.length` | Store returns an empty slice; page also defaults with `?? []` |
| Opacity utilities did not render | Hex tokens cannot take `/<alpha-value>` | Channel-form tokens (above) |
| Mobile page widened to 405–516px | Auto-sized grid tracks and unbreakable paths/tables | `minmax(0, 1fr)` tracks, `break-all`/`break-words`, internal scrollers |

Open item from the first revision, now resolved: production builds
intermittently logged React error #418 on the first sweep after a cold
`next start`. It reproduced every time the browser requested reduced motion:
framer-motion's `useReducedMotion` reads `matchMedia` during the first client
render, while the server can only assume motion, so the markup differed at
hydration. All eleven client components that branch on the preference now use
`useReducedMotionSafe` (`useSyncExternalStore` with a `false` server snapshot).
Three consecutive reduced-motion loads of `/app/repositories/:id` and standard
dark/light sweeps now log zero console or page errors.

### 2.2 Logged-in experience revision (2026-11-18)

The signed-in shell and its highest-traffic screens were rebuilt around one
question: what does a person need on this screen, and nothing else?

- **Shell** — the organisation text block became a compact workspace switcher
  with a monogram, workspace count and real destination. Sidebar links keep the
  sliding accent-bar pill; the footer is a single "Search everything ⌘K"
  control. The header gained a scroll shadow, a one-shot accent sweep per route
  change, and consistent 36px icon buttons. Breadcrumbs now read
  "Dashboard → Repositories → Repository → Explorer".
- **Dashboard** — reduced from eight stacked blocks to four: a workspace pulse
  line, four computed statistics, the repository list (with per-row file/symbol
  counts) and a two-column Activity/Runtime rail. Quick-link cards, the
  account-controls card and the default-workspace block were removed as
  duplicates of the sidebar.
- **Repository chrome** — the padded header card became a flat identity band:
  name, status, demo marker, one meta line, provider and re-index actions.
  Parser/provider trivia moved out of badges into that line; the demo
  disclaimer moved to the overview. A live job strip mounts only while a job is
  queued, running or failed.
- **Repository tabs** — twelve sections in one hairline strip with a sliding 2px
  accent rule, automatic centring of the active tab, and explicit edge arrows
  that appear only when the strip overflows.
- **Loading states** — the animated brand mark now carries every wait:
  `app/app/loading.tsx`, the repository body skeleton, explorer file loads,
  assistant retrieval and conversation loads, impact analysis and document
  generation. Route skeletons mirror the real layout so nothing jumps.
- **Motion and density** — staggered statistics and list rows, meters that grow
  in once, hover lifts on cards, press states on chrome controls, and 2×2
  statistic grids at 390px instead of four full-width rows.

Verification for this revision: typecheck clean, production build 36 routes,
Chromium sweeps at 1920×842, 1440×900 and 390×844 in dark and light, zero
console or page errors, no layout text below 12px, no page-level horizontal
overflow. (The interactive graph canvas scales as a unit when it is fitted or
zoomed; its node and edge labels are 12–14px at 100%.) The ⌘K palette returned the repository group and 12 repository-scoped
results for "refresh", with keyboard navigation intact. A throttled navigation
captured the loading boundary in the DOM (33 skeleton cells plus the live
"Loading repository data" status) before the explorer resolved.

Defects found and fixed during this revision:

| Defect | Cause | Fix |
| --- | --- | --- |
| React #418 under reduced motion | framer-motion reads `matchMedia` on the first client render; server assumes motion | `useReducedMotionSafe` (`useSyncExternalStore`, server snapshot `false`) in all eleven consumers |
| Language bars used blue, orange and violet | `languageColor` mirrored vendor brand colours | Mineral sage/stone ramp; no prohibited hue remains in the composition chart |
| Tab strip clipped at 1440px with no hint | Twelve fixed tabs, no overflow affordance | Edge arrows driven by scroll measurement, active tab centred on route change |
| Duplicate demo markers | Provider field itself reads "demo" beside the "demo dataset" badge | Provider badge hidden when it is the demo source |
| Card header actions jumped left on mobile | `flex-wrap` without alignment once the action wrapped | `ml-auto` on the action slot |
| Four tall statistic cards at 390px | Base grid started at one column | Two columns at base, four from `lg` |
| Graph edge labels rendered at 8px | Relationship caption predated the type-scale floor | Raised to 12px with matching padding |

The environment limitations in sections 3 and 8 are unchanged: PostgreSQL,
Neo4j/Redis, Docker and live model keys were still unavailable, and the report
does not claim them as exercised.

## 3. Database schema

26 tables, one schema for SQLite and PostgreSQL (UUID ids as `TEXT`,
timestamps as RFC3339 `TEXT`, booleans as `INTEGER`).

| Group | Tables |
| --- | --- |
| Identity | `users`, `user_preferences`, `password_resets` |
| Organisations & access | `organizations`, `organization_members`, `workspaces`, `workspace_members` |
| Sources | `repository_connections`, `integrations`, `repositories`, `repository_branches` |
| Indexed content | `repository_files`, `code_symbols`, `commits`, `embeddings` |
| Graph | `graph_nodes`, `graph_edges` |
| Analysis | `analysis_findings`, `impact_reports`, `generated_documents` |
| Assistant | `conversations`, `messages` |
| Operations | `indexing_jobs`, `notifications`, `audit_logs`, `schema_migrations` |

Migrations are embedded in the Go binary (`backend/migrations/0001_core.sql`,
`0002_repository_parser.sql`) and applied idempotently on start.

## 4. GitHub integration status

| Capability | Status | Notes |
| --- | --- | --- |
| Personal access token connect | Verified | Token verified against the provider, encrypted with AES-256-GCM before storage, never returned. |
| Repository listing | Verified | Read-only provider API call. |
| Branch tarball fetch + index | Verified | Used by the indexing pipeline; code is never executed. |
| GitHub OAuth authorize/callback | Implemented, unverified | Requires `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`. State is single-use, user/org bound, 10-minute expiry. Callback redirects to `/app/integrations`. |
| GitLab PAT connect | Implemented, unverified | Same encryption path; no live token was available. Self-hosted GitLab not supported. |
| Pull-request listing/analysis | Implemented | Demo repository returns labelled fixtures; live listing requires a connected provider. |
| Webhooks / push-to-reindex | Not implemented | Re-index is manual or on connect. |
| GitHub sign-in (OAuth identity) | Not implemented | Only repository-access OAuth exists. |

## 5. Docker, setup and environment

- `infrastructure/docker/api.Dockerfile` — multi-stage Go build, distroless
  static runtime, SQLite volume.
- `infrastructure/docker/ai.Dockerfile` — Python 3.11 slim, single worker.
- `infrastructure/docker/frontend.Dockerfile` — Next.js standalone-style
  multi-stage build.
- `infrastructure/docker/docker-compose.yml` — `db` (pgvector), `api`, `ai`,
  `web`; optional `extensions` (Neo4j, Redis) and `observability`
  (OTel collector, Grafana) profiles explicitly marked as not consumed by the
  current code.
- `.env.example` — every environment variable read by the three services, with
  comments and generation instructions.
- `documentation/setup.md`, `deployment.md`, `security.md`, `api.md`, this
  report.

Docker was **not executed** in this environment (no Docker daemon). The images
and compose file are written from the actual build commands and have not been
runtime-tested.

## 6. Security posture (summary)

Verified in code and behaviour: bcrypt cost 12; JWT HS256 with 12-hour expiry;
JWT held only in an httpOnly cookie by the BFF; workspace-scoped access checks
on every repository route; AES-256-GCM provider-token encryption; single-use
OAuth state; per-IP rate limiting; explicit CORS allowlist; audit logging of
security-relevant actions; prompt-injection fencing of retrieved content; no
repository code execution; honest no-provider behaviour.

Known gaps: no 2FA; no JWT revocation list; rate limiter is per-process; cookie
`secure` flag not set for production HTTPS; password reset token is returned in
API responses in development because no email provider exists; audit log is not
tamper-evident; legal pages are templates requiring review.

## 7. Credentials required for full function

| Credential | Enables | Without it |
| --- | --- | --- |
| `JWT_SECRET` | Production sessions | Development fallback; server refuses production start. |
| `ENCRYPTION_KEY` | Real provider-token storage | Development key; tokens not safe for real use. |
| `GROQ_API_KEY` or `GEMINI_API_KEY` or `LITELLM_*` | Generated answers, narratives, generated docs | Retrieval, evidence, deterministic analysis and fallback docs still work; chat states no provider configured. |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | GitHub OAuth connect | PAT connect still works. |
| GitHub/GitLab PAT | Live repository indexing | Demo repository still works. |
| PostgreSQL server | PostgreSQL deployment | SQLite works. |

## 8. Not implemented

- Neo4j graph adapter and Redis cache/queue. Compose services are scaffolded
  only; graph traversal and jobs run in SQL/Go today.
- pgvector indexing (JSON vectors + in-Go cosine today).
- Email/push/webhook notification delivery.
- Billing and plan enforcement. No payment integration or pricing surface
  exists in this build.
- Repository code execution or real test runs (deliberate).
- Webhooks, scheduled re-indexing, PR comments/checks.
- OAuth sign-in with GitHub/GitLab.
- Multi-tenant billing, SSO, SCIM.
- Full observability wiring (OTel pipeline scaffolded; services emit no spans).

## 9. Honest limitations of the analysis

- Tree-sitter + heuristics, not a compiler: dynamic imports, reflection and
  generated code can be missed. The UI states this on the health page.
- The parser covers the languages shipped in the language pack; unsupported
  files are listed, not guessed at.
- Lexical embeddings are deterministic and labelled `lexical-hash-v1`; they are
  not semantic embeddings. Semantic accuracy improves when
  `EMBEDDING_PROVIDER=gemini` is configured.
- Risk scoring is additive and transparent (weights exposed); it is a heuristic
  prioritisation aid, not a prediction.
- The demo repository contains a deliberate real bug
  (`findUserById(rotated.familyId)`) so analysis output can be checked against
  truth.

## 10. Next steps (ordered)

1. Run the compose stack on a machine with Docker; exercise the PostgreSQL path
   and re-run the smoke script against it.
2. Configure one LLM provider and verify generated chat, narratives and docs
   end-to-end; the payload contract is now smoke-tested.
3. Add an email sender and stop returning reset tokens in development
   responses; mark the cookie `secure` behind HTTPS.
4. Add a JWT revocation list or short-lived tokens with refresh rotation if
   session revocation is required.
5. Move rate limiting to Redis before running more than one API replica.
6. Implement the Neo4j adapter (or explicitly remove it from the roadmap) and a
   pgvector migration once vector volume justifies it.
7. Add webhook-driven re-indexing and PR annotations.
8. Obtain legal review of the privacy/terms templates.
9. Add CI: go build/vet/test, pytest, typecheck, build, smoke.
