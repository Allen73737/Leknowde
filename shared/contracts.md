# Cross-service contracts

The browser never calls these; they are internal API and service contracts kept
here so the Go and Python sides stay aligned.

## Go API → intelligence service

All non-health routes require `X-Internal-Token: $AI_INTERNAL_TOKEN`.

### `POST /v1/parse`

```json
{ "files": [{ "path": "src/a.ts", "language": "typescript", "content": "..." }], "include_metrics": true }
```

Returns `{ parser, files: [{ path, language, symbols: [...], imports: [...], metrics }], warnings, duration_ms }`.

### `POST /v1/embed`

```json
{ "texts": ["chunk one", "chunk two"] }
```

Returns `{ mode, model, dim, vectors: [[...]], degraded }`. `mode` is
`lexical` when no embedding provider is configured — this is reported, never
disguised as semantic.

### `POST /v1/chat`

```json
{
  "question": "...",
  "repository": { "id": "...", "full_name": "owner/name", "branch": "main", "language": "typescript", "file_count": 19, "symbol_count": 62, "languages": { "typescript": 17 } },
  "evidence": [{ "file_path": "...", "start_line": 5, "end_line": 15, "symbol": "...", "snippet": "...", "reason": "...", "kind": "symbol" }],
  "history": [{ "role": "user", "content": "..." }],
  "task": "explain",
  "instructions": ""
}
```

Returns `{ answer, evidence, confidence, uncertainty, model, provider, tokens_in, tokens_out, grounded }`.
With no provider configured it returns HTTP 503; the Go API converts that into
`completed:false` plus the retrieved evidence and an explicit notice.

### `POST /v1/impact`

Same `repository` object (including `languages`), plus `seeds`, `impacts`,
`evidence`, `tests`, `history`. Returns summary, risk level/rationale,
implementation plan, test recommendations, rollback considerations,
documentation updates, uncertainty, model and provider. Validation is covered
by smoke assertion #57 ("impact narrative payload is accepted").

### `POST /v1/docs/generate`

`{ kind, repository, facts, evidence, existing }` → `{ title, markdown, model,
provider, generated, note }`.

## Invariants

- `repository.languages` is always a map. A nil Go map marshals to `null`, and
  the Python schema coerces `null` to `{}`; both sides are defensive.
- Evidence line ranges are 1-based and inclusive.
- Model prose is never merged into deterministic fields; it lives in separate
  keys and carries provider/model metadata.
- Repository content is always fenced as data in prompts. It is never treated as
  instructions, and the intelligence service has no tool-execution surface.
