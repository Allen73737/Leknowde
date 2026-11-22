# API surface (v1)

Base URL: `http://localhost:8080/api/v1` (direct) or `/api/lk/...` through the
Next.js BFF. All authenticated routes expect `Authorization: Bearer <jwt>` or
the `lk_session` cookie. Errors use:

```json
{ "error": "code", "message": "Human-readable explanation." }
```

List responses are wrapped in a named key (`workspaces`, `repositories`,
`symbols`, `messages`, ...). Single-resource creation returns the resource or a
named wrapper; the smoke script in `backend/scripts/smoke.ps1` documents the
exact shape of every response.

## System

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Database, AI service and LLM capability snapshot. |
| GET | `/meta` | Product capabilities, integrations and parser status. |

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | Creates user + default workspace; returns token and organisation. |
| POST | `/auth/login` | Returns JWT. |
| POST | `/auth/logout` | Audit-only; JWTs are stateless. |
| POST | `/auth/forgot-password` | In development, returns the reset token in the response. |
| POST | `/auth/reset-password` | Consumes a single-use token. |
| GET | `/auth/me` | User, organisation, preferences. |

## Account

| Method | Path | Notes |
| --- | --- | --- |
| PATCH | `/users/me` | Display name, avatar URL. |
| DELETE | `/users/me` | Requires `{confirmation:"DELETE", password:"..."}`. |
| GET/PUT | `/users/me/preferences` | Theme, default workspace. |

## Workspaces

`GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/:id`,
`GET /workspaces/:id/members`, `POST /workspaces/:id/members`,
`DELETE /workspaces/:id/members/:userID`,
`GET /workspaces/:id/repositories`.

Roles: `owner`, `admin`, `member`, `viewer`. Repository routes check
workspace membership on every call.

## Integrations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/integrations` | Connection status per provider (never the secret). |
| POST | `/integrations/:provider/token` | Verifies then encrypts a PAT. |
| GET | `/integrations/:provider/repositories` | Lists provider repositories. |
| DELETE | `/integrations/:provider` | Deletes the stored token. |
| GET | `/integrations/github/authorize` | Starts GitHub OAuth (requires config). |
| GET | `/integrations/github/callback` | Exchanges the code, stores an encrypted token, redirects to the app. |

`:provider` is `github` or `gitlab`.

## Repositories

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/repositories` | `{workspace_id, provider, full_name}`; queues indexing. |
| POST | `/repositories/demo` | `{workspace_id}`; bundles `leknowde/mineral-notes`. |
| GET | `/repositories/:id` | Repository record. |
| DELETE | `/repositories/:id` | Cascades files, symbols, graph, documents. |
| GET | `/repositories/:id/branches` | Provider branches. |
| POST | `/repositories/:id/index` | Queue a re-index; returns the job. |
| GET | `/repositories/:id/jobs` | Recent jobs for the repository. |
| GET | `/repositories/:id/tree` | Indexed file tree. |
| GET | `/repositories/:id/file?path=` | File content (bounded). |
| GET | `/repositories/:id/symbols` | Symbol index. |
| GET | `/repositories/:id/search?q=` | FTS + vector + symbol search; returns `evidence`, `strategy`, `candidates`. |
| GET | `/repositories/:id/overview` | Stats, languages, fan-in leaders, routes, commits. |
| GET | `/repositories/:id/graph?view=` | Graph projection (`architecture`, `module`, `file`, `symbol`, `test`). |
| GET | `/repositories/:id/dependencies` | Modules, cycles, unused-import candidates. |
| GET | `/repositories/:id/cycles` | Cycle list only. |
| GET | `/repositories/:id/health` | Findings, penalties, metrics, stated limitations. |
| GET | `/repositories/:id/onboarding` | Deterministic 7-step reading plan. |
| GET | `/repositories/:id/twin` | Static graph projection with node-kind statistics. |
| GET/POST | `/repositories/:id/impact` | List saved reports / run a new analysis. |
| GET/POST | `/repositories/:id/documents` | List documents / generate one (`architecture`, `readme`, `api`, `onboarding`). |
| GET/POST | `/repositories/:id/readme` | Deterministic README draft from indexed facts / save it as a document. |
| GET/PUT | `/repositories/:id/about` | GitHub About payload: description, up to 20 topics, licence and manifest signals. |
| GET/POST | `/repositories/:id/conversations` | List/create conversations. |
| POST | `/repositories/:id/chat` | Retrieval-first answer; returns evidence even without an LLM. |
| GET | `/repositories/:id/pull-requests` | Provider PR list (demo = fixtures). |
| POST | `/repositories/:id/pull-requests/:number/analyze` | Deterministic PR impact + optional narrative. |

Standalone resources: `GET/PATCH/DELETE /documents/:id`,
`GET /impact/:id`, `GET /jobs/:id`, `GET /conversations/:id/messages`.

## Platform

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications` | Unread count + rows. |
| POST | `/notifications/read` | `{ids:[...]}` or `{all:true}`. |
| GET | `/audit-logs?action=&target_type=` | Most recent 300 events. |
| GET | `/dashboard` | Cross-workspace totals and recent repositories. |

## Envelopes worth knowing

- `graph` → `{ graph: { nodes, edges, truncated }, view }`
- `twin` → `{ nodes, edges, kinds, graph, repository }`
- `symbols` → `{ symbols, count }`
- `search` → `{ query, files, symbols, evidence, strategy, candidates }`
- `overview` → `{ repository, branch, stats, commits, endpoints, graph }`
- `health` → `{ summary: { score, grade, findings, by_severity, by_kind, penalties, limitations, metrics }, findings, cycles, unused_import_candidates, stats, analyzed_at, parser }`
- documents create → `{ document, generated_by_model, provider, note }`
- readme → `{ markdown, title, source, about }`; `about` is the stored override when
  present, otherwise a generated draft. `?source=generated` bypasses the override.
- about → `{ description, topics, max_description, max_topics, license, manifests, has_readme, source }`.
- impact create → `{ report, analysis }` where `analysis.ai_narrative_status`
  states whether a model narrative was generated or why it was not.
- PR analyze → flat analysis object.
- chat → `{ conversation_id, completed, answer, notice?, evidence, symbols, strategy, ... }`

## Graph node identity

Graph nodes expose `key` (not `id`); the frontend uses it as the React Flow node
id. Node kinds include `module`, `file`, `function`, `class`, `interface`,
`component`, `api`, `entity`, `test`, `service`, `table`.
