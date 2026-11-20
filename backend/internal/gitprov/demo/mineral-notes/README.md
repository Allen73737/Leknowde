# Mineral Notes (LeKnowde demo dataset)

This repository is bundled with LeKnowde so the ingestion, parsing, dependency
and impact pipelines can be exercised without connecting an external Git
provider. It contains real, parseable source code.

**It is demo data.** The commit history and pull request metadata served for
this repository are illustrative fixtures, and the UI labels them as such.

## Layout

- `server/src` — Express API with refresh-token rotation.
- `server/src/db` — PostgreSQL schema and query helpers.
- `server/test` — refresh-token rotation tests.
- `web/src` — React client that consumes the API.

## Authentication flow

1. `POST /api/v1/auth/login` issues an access token and a refresh token family.
2. `POST /api/v1/auth/refresh` rotates the refresh token.
3. Replaying a rotated token revokes the entire family.

## Local development

```bash
npm install
npm run dev
```
