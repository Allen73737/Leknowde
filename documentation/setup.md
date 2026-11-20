# Setup

This guide runs the full stack natively on Windows, macOS or Linux. For
containers see [deployment.md](deployment.md).

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 22.x | Next.js 15 |
| Go | 1.25+ | API |
| Python | 3.11+ | Intelligence service |
| Git | any recent | Repository fetching |

No database server is required for local use: the API defaults to SQLite at
`backend/data/leknowde.db`.

## 1. API

```powershell
cd backend
$env:DATABASE_URL = "file:./data/leknowde.db"
$env:PORT = "8080"
go run ./cmd/server
```

The server creates the schema on start (idempotent migrations embedded in the
binary). Health: <http://localhost:8080/health>.

Development defaults:

- JWT secret: an insecure fallback is used unless `JWT_SECRET` is set. The
  process refuses to start with that fallback when `LEKNOWDE_ENV=production`.
- Provider tokens: `ENCRYPTION_KEY` empty means a development key derived for
  local use; set a real 64-hex-character key before storing real tokens.
- CORS accepts any `http://localhost:*` origin only while `LEKNOWDE_DEV_MODE`
  is on.

## 2. Intelligence service

```powershell
cd ai-services
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env      # optional; defaults work without keys
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Health: <http://localhost:8000/health>. The response reports which parser is
loaded and whether an LLM provider is configured; it never claims a model is
available when no key is present.

`ai-services/.env` is the natural place for `GROQ_API_KEY`, `GEMINI_API_KEY` or
`LITELLM_*`. The Go API must share `AI_INTERNAL_TOKEN` with the service
(default `dev-internal-token`).

## 3. Web app

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. The app talks to the API through its own
same-origin proxy (`/api/lk/*`), configured by `LEKNOWDE_API_URL`
(default `http://localhost:8080`).

## 4. First run

1. Register an account. A default workspace is created automatically.
2. On the dashboard choose **Connect demo repository**.
3. Wait for the indexing job (seconds). The repository appears with file,
   symbol, graph and health counts.
4. Explore **Overview**, **Explorer**, **Symbols**, **Architecture**,
   **Dependencies**, **Change impact**, **Documentation**, **Health**,
   **Assistant**, **Onboarding**, **Digital twin** and **Pull requests**.
5. Check **Notifications**, **Audit log**, **Integrations** and **Settings**
   from the account menu.

## Environment variables

The authoritative list with comments is [.env.example](../.env.example). The
minimum for a real deployment:

```
LEKNOWDE_ENV=production
JWT_SECRET=<32+ chars>
ENCRYPTION_KEY=<64 hex chars>
DATABASE_URL=postgres://...
AI_SERVICE_URL=...
AI_INTERNAL_TOKEN=...
ALLOWED_ORIGINS=https://your-domain
```

## Running the checks

```powershell
# API end-to-end: registers a throwaway account, indexes the demo, verifies
# every surface, then deletes the repository and account.
cd backend
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1

# Python
cd ai-services
.\.venv\Scripts\python -m pytest -q

# Frontend
cd frontend
npm run typecheck
npm run build
```

The smoke script needs a running API at `http://localhost:8080` and the
intelligence service at `http://localhost:8000`. It prints one line per
assertion and ends with `SMOKE_OK checks=<n>`.

## Resetting local data

Delete `backend/data/leknowde.db` (and any `-shm`/`-wal` files) while the API is
stopped. The schema is recreated on the next start.
