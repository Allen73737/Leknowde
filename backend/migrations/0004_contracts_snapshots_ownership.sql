-- 0004: cross-repository API contracts, temporal architecture snapshots and
-- commit-file ownership evidence.
--
-- These tables are deliberately additive. They store only facts produced by the
-- deterministic indexing pipeline so every downstream report can point back to
-- the source file and commit that supplied the evidence.

CREATE TABLE IF NOT EXISTS api_contracts (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  normalized_path TEXT NOT NULL,
  operation TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  line INTEGER NOT NULL DEFAULT 0,
  handler TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'parser',
  updated_at TEXT NOT NULL,
  UNIQUE (repository_id, branch, direction, operation, file_path)
);

CREATE INDEX IF NOT EXISTS idx_api_contracts_repo ON api_contracts (repository_id, branch, direction);
CREATE INDEX IF NOT EXISTS idx_api_contracts_operation ON api_contracts (normalized_path, method);

CREATE TABLE IF NOT EXISTS commit_files (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (repository_id, commit_sha, path)
);

CREATE INDEX IF NOT EXISTS idx_commit_files_repo ON commit_files (repository_id, path);

CREATE TABLE IF NOT EXISTS architecture_snapshots (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  nodes INTEGER NOT NULL DEFAULT 0,
  edges INTEGER NOT NULL DEFAULT 0,
  files INTEGER NOT NULL DEFAULT 0,
  modules INTEGER NOT NULL DEFAULT 0,
  api_producers INTEGER NOT NULL DEFAULT 0,
  api_consumers INTEGER NOT NULL DEFAULT 0,
  cycles INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (repository_id, branch, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_repo ON architecture_snapshots (repository_id, branch, created_at);
