# Deployment

The compose stack lives at `infrastructure/docker/docker-compose.yml` and builds
three images:

| Image | Dockerfile | Port |
| --- | --- | --- |
| API | `api.Dockerfile` | 8080 |
| Intelligence | `ai.Dockerfile` | 8000 |
| Web | `frontend.Dockerfile` | 3000 |

## First start

```powershell
copy .env.example .env
# set JWT_SECRET and ENCRYPTION_KEY
openssl rand -hex 32        # paste into ENCRYPTION_KEY
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

What the stack does:

1. Starts PostgreSQL 16 with the pgvector extension available.
2. Starts the intelligence service; it reports `llm.configured=false` unless a
   provider key is present.
3. Starts the API against PostgreSQL, running the same embedded migrations used
   for SQLite.
4. Starts Next.js with `LEKNOWDE_API_URL=http://api:8080`.

The demo repository is embedded in the API binary, so the demo flow works
inside containers without volumes.

## Required secrets

| Variable | Rule |
| --- | --- |
| `JWT_SECRET` | ≥ 32 characters. The API panics at startup in production if unset. |
| `ENCRYPTION_KEY` | 64 hex characters (AES-256-GCM). Tokens cannot be recovered if changed. |
| `POSTGRES_PASSWORD` | Optional locally; set it in any shared environment. |
| `AI_INTERNAL_TOKEN` | Shared secret between API and intelligence service. |

## PostgreSQL notes

- The schema is identical for SQLite and PostgreSQL. Statements are written with
  `?` placeholders and rebound by the store layer (`platform.DB.Rebind`).
- UUIDs are stored as `TEXT`, timestamps as RFC3339 `TEXT`, booleans as
  `INTEGER`. This keeps one schema portable; it is not the most space-efficient
  PostgreSQL layout.
- The PostgreSQL path is implemented but was not exercised in the authoring
  environment (no PostgreSQL server available). Treat the first production
  deployment as a migration test and run `backend/scripts/smoke.ps1` against it.
- `pgvector` is present in the image but unused: vectors are JSON arrays and
  cosine similarity is computed in Go. A future migration can add a
  `vector(256)` column without changing the API.

## Optional profiles

```powershell
docker compose --profile extensions up      # neo4j + redis
docker compose --profile observability up   # otel-collector + grafana
```

These services are **not consumed by the current code**. They exist so the
topology matches the target architecture and so adapters can be added without
editing compose. Do not assume graph traversal or job scheduling moves into
them; today both live in SQL.

## Reverse proxy

Terminate TLS at your proxy and forward:

- `/` → `web:3000`
- `/api/lk/*` is internal to the web app; the public API can be exposed at
  `/api/v1/*` → `api:8080` if you want direct access.
- Set `NEXT_PUBLIC_SITE_URL` to the public origin at build time (it feeds
  metadata) and `FRONTEND_URL`/`ALLOWED_ORIGINS` for the API.

The session cookie is `httpOnly` with `sameSite=lax`; it is not marked `secure`
in development. If you serve over HTTPS, set the `secure` flag in
`frontend/lib/config.ts` or in the cookie helper before going live.

## Scaling

- API: stateless apart from the in-memory rate limiter and OAuth state. Run one
  replica or move rate limiting to Redis before scaling horizontally.
- Workers: `INDEX_WORKER_COUNT` controls how many queue leases a single API
  process claims. Leases and heartbeats live in `indexing_jobs`.
- Intelligence service: stateless; scale horizontally behind the API's URL.

## Backups

Back up the database only. Uploaded files do not exist (repository content is
stored in the database); generated documents and audit rows are inside it.

## Health checks

- API: `GET /health` returns 200 when the database is reachable.
- Intelligence: `GET /health`.
- Web: `GET /` returns 200.
