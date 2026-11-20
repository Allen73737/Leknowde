-- LeKnowde core relational schema.
-- Written in a portable SQL subset so the same schema runs on PostgreSQL
-- (production) and SQLite (zero-dependency local development).
-- Identifiers are application-generated UUID strings; timestamps are RFC3339 text.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_login TEXT NOT NULL DEFAULT '',
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  scopes TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, organization_id, provider)
);

CREATE TABLE IF NOT EXISTS repository_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  integration_id TEXT,
  provider TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  external_id TEXT NOT NULL DEFAULT '',
  html_url TEXT NOT NULL DEFAULT '',
  default_branch TEXT NOT NULL DEFAULT 'main',
  private INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  connection_id TEXT,
  provider TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  html_url TEXT NOT NULL DEFAULT '',
  default_branch TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'pending',
  last_indexed_at TEXT,
  last_indexed_commit TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (workspace_id, full_name)
);
CREATE INDEX IF NOT EXISTS idx_repositories_workspace ON repositories (workspace_id);

CREATE TABLE IF NOT EXISTS repository_branches (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  name TEXT NOT NULL,
  head_sha TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (repository_id, name)
);

CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  sha TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL DEFAULT '',
  committed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (repository_id, sha)
);
CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits (repository_id, committed_at);

CREATE TABLE IF NOT EXISTS repository_files (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  blob_sha TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT '',
  is_binary INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  line_count INTEGER NOT NULL DEFAULT 0,
  content TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (repository_id, branch, path)
);
CREATE INDEX IF NOT EXISTS idx_files_repo_branch ON repository_files (repository_id, branch);

CREATE TABLE IF NOT EXISTS code_symbols (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  signature TEXT NOT NULL DEFAULT '',
  start_line INTEGER NOT NULL DEFAULT 0,
  end_line INTEGER NOT NULL DEFAULT 0,
  parent_symbol_id TEXT,
  exported INTEGER NOT NULL DEFAULT 0,
  doc_comment TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_symbols_repo ON code_symbols (repository_id, kind);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON code_symbols (file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols (repository_id, name);

CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  UNIQUE (repository_id, kind, key)
);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_repo ON graph_nodes (repository_id, kind);

CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  from_key TEXT NOT NULL,
  to_key TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 1,
  file_path TEXT NOT NULL DEFAULT '',
  line INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  UNIQUE (repository_id, from_key, to_key, relation)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges (repository_id, from_key);
CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges (repository_id, to_key);

CREATE TABLE IF NOT EXISTS indexing_jobs (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'index',
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  current_step TEXT NOT NULL DEFAULT '',
  files_total INTEGER NOT NULL DEFAULT 0,
  files_processed INTEGER NOT NULL DEFAULT 0,
  symbols_found INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  logs TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_by TEXT,
  locked_until TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_repo ON indexing_jobs (repository_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON indexing_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '[]',
  uncertainty TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  vector TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'lexical-hash-v1',
  dim INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (repository_id, source_kind, source_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_repo ON embeddings (repository_id);

CREATE TABLE IF NOT EXISTS generated_documents (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  drift TEXT NOT NULL DEFAULT '{}',
  source_fingerprint TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_repo ON generated_documents (repository_id, kind);

CREATE TABLE IF NOT EXISTS analysis_findings (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  start_line INTEGER NOT NULL DEFAULT 0,
  end_line INTEGER NOT NULL DEFAULT 0,
  evidence TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_repo ON analysis_findings (repository_id, severity);

CREATE TABLE IF NOT EXISTS impact_reports (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  request TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'unknown',
  risk_rationale TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  confidence TEXT NOT NULL DEFAULT 'deterministic',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_impact_repo ON impact_reports (repository_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'dark',
  default_workspace_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  organization_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs (organization_id, created_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
