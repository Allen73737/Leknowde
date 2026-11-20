# Security

This document states what the build enforces, and where the limits are. It is
written to be checkable against the code, not aspirational.

## Authentication

- Passwords are hashed with bcrypt (cost 12).
- Sessions are signed JWTs (HS256) with a 12-hour expiry, carrying user,
  email, name and organisation.
- The browser never receives the JWT. Next.js exchanges credentials at
  `/api/session/login`, stores the token in an `httpOnly`, `sameSite=lax` cookie
  and proxies API calls through `/api/lk/*`. Client JavaScript cannot read it.
- Login failures return a generic message; the audit log records the attempt
  where a user is known.
- Password reset uses single-use, expiring tokens. In development the token is
  returned in the API response because no email provider exists; production
  builds must wire an email sender before exposing the flow.

## Authorization

- Every repository route resolves the repository through a workspace membership
  check (`requireRepository`); there is no global repository id space that skips
  access control.
- Workspace roles are `owner`, `admin`, `member`, `viewer`; owner-only actions
  (deleting a workspace, changing membership) are enforced server-side.
- Documents, impact reports, conversations and jobs are fetched with their owner
  or workspace scope, so a guessed id does not grant access.

## Secrets and provider tokens

- Provider tokens (GitHub/GitLab PATs and OAuth tokens) are encrypted with
  AES-256-GCM using `ENCRYPTION_KEY`. The plaintext is never returned by any
  response; the integrations endpoint reports connection status only.
- Tokens are verified against the provider before storage, so an invalid token
  is not persisted.
- OAuth uses a single-use `state` value bound to the initiating user and
  organisation, with a 10-minute expiry. The callback redirects to
  `/app/integrations`.
- LLM and provider API keys are read from the environment by the intelligence
  service only. They are never sent to the browser.

## Network boundary

- CORS is an explicit allowlist (`ALLOWED_ORIGINS`). The development wildcard
  applies only to `http://localhost:*` while `LEKNOWDE_DEV_MODE` is on.
- The API enforces a per-IP rate limit (`RATE_LIMIT_PER_MINUTE`, default 240/min)
  and returns `Retry-After` on 429.
- The intelligence service requires `X-Internal-Token` on every non-health
  route and refuses to start with the default token when
  `ENVIRONMENT=production`.

## AI-specific defences

- **Retrieval first.** Evidence is assembled deterministically before a model is
  called. Answers must cite retrieved file paths, line ranges and snippets.
- **Prompt-injection fencing.** Repository content is passed to the model inside
  fenced evidence blocks and the system prompt states that file content is data,
  never instructions. The model cannot trigger tool calls or code execution.
- **No code execution.** LeKnowde never runs fetched repository code, tests or
  scripts. "Existing tests" are listed from static detection.
- **Honest degradation.** Without a provider key the API returns the retrieved
  evidence with `completed:false` and a notice; it does not fabricate an answer.
- **Deterministic vs generated separation.** Risk scores, findings and graph
  structure are computed and labelled deterministic. Model prose is labelled
  with provider/model and an uncertainty statement.

## Audit log

The following actions are written inside the request that performs them, with
actor, organisation, target, IP address, user agent and timestamp:

authentication (sign-in, password reset), workspace create/update/delete and
membership changes, repository connect/delete/index start/document publish,
integration connect/disconnect, profile update and account deletion.

The audit table is append-only through the API; there is no endpoint to edit or
delete individual rows. It is not cryptographically signed or tamper-evident —
an operator with database access can alter it.

## Data handling

- Repository files are stored in the database for the indexed branch (bounded by
  `MAX_FILES_PER_REPO` and `MAX_FILE_BYTES`). They are not written to disk.
- Deleting an account cascades its notifications, conversations and documents;
  deleting a repository cascades its files, symbols, graph and analyses.
- No telemetry is sent anywhere. There is no analytics script, no third-party
  font fetch at runtime (fonts are bundled at build), and no outbound webhook.

## Known gaps

- No email delivery, so password reset and notifications are in-app only.
- No 2FA, no OAuth sign-in, no session revocation list (JWTs remain valid until
  expiry; logout is audit-only).
- The in-memory rate limiter is per-process. Behind multiple replicas it is
  weaker than the configured number suggests.
- The session cookie is not `secure` in development; set it for HTTPS.
- Legal pages are implementation-accurate templates, not reviewed legal advice.

## Reporting

This build has no security contact configured. Add one before exposing it
publicly.
