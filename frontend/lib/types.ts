export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Confidence = "high" | "medium" | "low" | "insufficient";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role?: string;
  created_at?: string;
}

export interface Preferences {
  theme: "dark" | "light";
  default_workspace_id: string;
}

export interface MeResponse {
  user: User;
  organization: Organization | Record<string, never>;
  preferences: Preferences;
}

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string;
  role: string;
  repository_count: number;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  user_id: string;
  email: string;
  name: string;
  role: string;
  joined_at: string;
}

export interface Integration {
  id: string;
  provider: string;
  account_login: string;
  scopes: string;
  expires_at: string;
  created_at: string;
}

export type RepositoryStatus = "pending" | "indexing" | "ready" | "failed";

export interface Repository {
  id: string;
  workspace_id: string;
  provider: string;
  owner: string;
  name: string;
  full_name: string;
  description: string;
  language: string;
  visibility: string;
  html_url: string;
  default_branch: string;
  status: RepositoryStatus | string;
  parser_mode: string;
  last_indexed_at: string;
  last_indexed_commit: string;
  is_demo: boolean;
  file_count: number;
  symbol_count: number;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  name: string;
  head_sha: string;
  is_default: boolean;
}

export interface Commit {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  committed_at: string;
}

export interface CodeFile {
  id: string;
  path: string;
  size: number;
  language: string;
  is_binary: boolean;
  line_count: number;
  content_sha: string;
  content?: string;
}

export interface TreeNode {
  path: string;
  name: string;
  type: "dir" | "file";
  language?: string;
  size?: number;
  children?: TreeNode[];
}

export interface Symbol {
  id: string;
  file_id: string;
  file_path: string;
  kind: string;
  name: string;
  qualified_name: string;
  signature: string;
  start_line: number;
  end_line: number;
  exported: boolean;
  doc_comment: string;
  parent_id?: string;
}

export interface GraphNode {
  id: string;
  kind: string;
  key: string;
  label: string;
  file_path: string;
  metadata?: Record<string, unknown> | null;
  in_degree: number;
  out_degree: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  weight: number;
  line?: number;
  file_path?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface GraphResponse {
  graph: Graph;
  view: string;
}

export interface Job {
  id: string;
  repository_id: string;
  branch: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  progress: number;
  current_step: string;
  files_total: number;
  files_processed: number;
  symbols_found: number;
  error: string;
  logs: string[];
  attempts: number;
  started_at: string;
  completed_at: string;
  created_at: string;
}

export interface Evidence {
  file_path: string;
  start_line: number;
  end_line: number;
  symbol?: string;
  snippet: string;
  reason: string;
  kind: string;
}

export interface RepoStats {
  files: number;
  symbols: number;
  functions: number;
  classes: number;
  components: number;
  apis: number;
  tests: number;
  lines: number;
  edges: number;
  nodes: number;
  chunks: number;
  languages: Record<string, number>;
  top_files: FileMatch[];
  disk_bytes: number;
  findings: number;
  critical_findings: number;
}

export interface FileMatch {
  path: string;
  language: string;
  line_count: number;
  matches: number;
  preview: string;
  line: number;
}

export interface RepositoryResponse {
  repository: Repository;
  stats: RepoStats;
  branches: Branch[];
  jobs: Job[];
  commits: Commit[];
  branch: string;
}

export interface OverviewResponse {
  repository: Repository;
  branch: string;
  stats: RepoStats;
  commits: Commit[];
  endpoints: string[];
  graph: { nodes: number; edges: number };
}

export interface TreeResponse {
  branch: string;
  count: number;
  tree: TreeNode[];
  files: CodeFile[];
}

export interface FileResponse {
  file: CodeFile;
  symbols: Symbol[];
  dependencies: DependencyRef[];
  evidence?: Evidence[];
}

export interface DependencyRef {
  from: string;
  to: string;
  relation: string;
  direction: "incoming" | "outgoing" | string;
  counterpart: string;
  counterpart_label: string;
  is_file: boolean;
  line: number;
  confidence: number;
}

export interface SearchResponse {
  query: string;
  files: FileMatch[];
  symbols: Symbol[];
  evidence: Evidence[];
  strategy: string;
  candidates: number;
}

export interface DependencyRelationCount {
  relation: string;
  count: number;
}

export interface DependencyTopFile {
  path: string;
  in_degree: number;
}

export interface DependencySummaryResult {
  total: number;
  relations: DependencyRelationCount[];
  top_files: DependencyTopFile[];
}

export interface ModuleEdge {
  from: string;
  to: string;
  count: number;
}

export interface UnusedImport {
  file: string;
  line: number;
  imports: string;
  confidence: number;
  reason: string;
}

export interface DependenciesResponse {
  summary: DependencySummaryResult;
  modules: ModuleEdge[];
  cycles: string[][];
  unused_imports: UnusedImport[];
}

export interface Finding {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  description: string;
  file_path: string;
  start_line: number;
  end_line: number;
  status: string;
  evidence: string;
}

export interface HealthResponse {
  analyzed_at: string;
  cycles: string[][] | null;
  findings: Finding[];
  parser: string;
  stats: RepoStats;
  summary: {
    score: number;
    grade: string;
    findings: number;
    by_severity: Record<string, number>;
    by_kind: Record<string, number>;
    penalties: { label: string; points: number; count: number }[];
    limitations: string[];
    metrics: {
      files: number;
      lines: number;
      functions: number;
      average_function_length: number;
      max_cyclomatic_complexity: number;
      average_cyclomatic_complexity: number;
      duplicate_blocks: number;
      circular_groups: number;
      untested_files: number;
      comment_ratio: number;
    };
  };
  unused_import_candidates: {
    confidence: number;
    file: string;
    imports: string;
    line: number;
    reason: string;
  }[];
}

export interface OnboardingResponse {
  overview: string[];
  architecture: string[];
  steps: {
    order: number;
    title: string;
    why: string;
    files: string[];
    exercise: string;
  }[];
  key_files: {
    path: string;
    language: string;
    lines: number;
    in_degree: number;
    out_degree: number;
    role: string;
  }[];
  questions_to_ask_the_codebase: string[];
  estimated_hours: number;
  facts: {
    repository: Repository;
    branch: string;
    stats: RepoStats;
    modules: string[];
    entry_points: string[];
    endpoints: string[];
    entities: string[];
    tests: string[];
    languages: Record<string, number>;
    dependency_counts: Record<string, number>;
  };
}

export interface TwinResponse {
  nodes: number;
  edges: number;
  kinds: { kind: string; count: number; edges: number }[];
  graph: Graph;
  repository: {
    id: string;
    full_name: string;
    branch: string;
    status: string;
    parser: string;
  };
}

export interface RiskFactor {
  label: string;
  weight: number;
  evidence: string;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  rationale: string;
  formula: string;
}

export interface ImpactSeed {
  key: string;
  label: string;
  kind: string;
  file_path: string;
  why: string;
}

export interface ImpactFile {
  path: string;
  depth: number;
  via: string;
  relation: string;
  reason?: string;
}

export interface ImpactAnalysis {
  request: string;
  parser: string;
  strategy: string;
  seeds: ImpactSeed[];
  affected_files: ImpactFile[];
  affected_symbols: { key: string; label: string; kind: string; file_path: string }[];
  affected_apis: string[];
  affected_entities: string[];
  affected_services: string[];
  existing_tests: string[];
  recommended_tests: string[];
  test_plan: string[];
  implementation_sequence: string[];
  rollback_considerations: string[];
  documentation_updates: string[];
  recent_commits: Commit[];
  evidence: Evidence[];
  graph: Graph;
  risk: RiskAssessment;
  uncertainty: string[];
  ai_narrative: Record<string, unknown>;
  ai_narrative_status: string;
}

export interface ImpactReport {
  id: string;
  repository_id: string;
  user_id: string;
  title: string;
  request: string;
  summary: string;
  risk_level: RiskLevel;
  risk_rationale: string;
  payload: string;
  confidence: string;
  created_at: string;
}

export interface CreateImpactResponse {
  analysis: ImpactAnalysis;
  report: ImpactReport;
}

export interface ImpactListResponse {
  reports: ImpactReport[];
}

export interface ImpactDetailResponse {
  report: ImpactReport;
  analysis: ImpactAnalysis;
}

export interface DocumentRecord {
  id: string;
  repository_id: string;
  kind: string;
  title: string;
  path: string;
  content: string;
  status: string;
  source_fingerprint: string;
  drift: string;
  created_by: string;
  updated_at: string;
  created_at: string;
}

export interface DocumentsResponse {
  documents: DocumentRecord[];
  kinds: { kind: string; title: string; description: string; requires_llm: boolean }[];
  source_fingerprint: string;
}

export interface DocumentResponse {
  document: DocumentRecord;
  drifted: boolean;
  repository: Repository;
}

export interface ChatResponse {
  conversation_id: string;
  completed: boolean;
  answer: string;
  notice?: string;
  detail?: string;
  evidence: Evidence[];
  symbols?: Symbol[];
  strategy?: string;
  candidates?: number;
  confidence: Confidence | string;
  uncertainty?: string;
  model?: string;
  provider?: string;
  tokens_in?: number;
  tokens_out?: number;
}

export interface Conversation {
  id: string;
  repository_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence: Evidence[];
  uncertainty: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  author: string;
  branch: string;
  base: string;
  additions: number;
  deletions: number;
  changed_files: number;
  url: string;
  created_at: string;
  body: string;
}

export interface PullRequestAnalysis {
  number: number;
  title: string;
  files: { path: string; status: string; additions: number; deletions: number; patch: string }[];
  changed_paths: string[];
  modules: string[];
  impact: {
    path: string;
    depth: number;
    via: string;
    relation: string;
    risk?: string;
  }[];
  risk: RiskAssessment;
  missing_tests: string[];
  review_recommendations: string[];
  evidence: Evidence[];
  uncertainty: string[];
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  actor_email: string;
  metadata: string;
  ip: string;
  created_at: string;
}

export interface DashboardResponse {
  stats: {
    workspaces: number;
    repositories: number;
    ready_repositories: number;
    files: number;
    symbols: number;
    findings: number;
    critical_findings: number;
    active_jobs: number;
    conversations: number;
    impact_reports: number;
  };
  recent_repositories: Repository[];
  notifications: Notification[];
}

export interface MetaResponse {
  product?: string;
  tagline?: string;
  service?: string;
  version: string;
  environment?: string;
  api_version?: string;
  capabilities: Record<string, unknown>;
  llm?: { configured: boolean; provider: string; model: string; reason?: string };
  embeddings?: { mode: string; model: string };
  parser?: string;
  integrations?: Record<string, boolean>;
  ai_service?: { status: string; error?: string };
  ai?: Record<string, unknown>;
}

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

export interface WorkspaceDetailResponse {
  workspace: Workspace;
  repositories: Repository[];
}

export interface MembersResponse {
  members: Member[];
}

export interface IntegrationsResponse {
  integrations: Integration[];
  github_oauth_enabled: boolean;
}

export interface RepositoriesResponse {
  repositories: Repository[];
}

export interface BranchesResponse {
  branches: Branch[];
}

export interface JobsResponse {
  jobs: Job[];
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface MessagesResponse {
  conversation: Conversation;
  messages: Message[];
}

export interface PullRequestsResponse {
  pull_requests: PullRequest[];
  provider: string;
  demo: boolean;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unread: number;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
}

export interface GenerateDocumentResponse {
  document: DocumentRecord;
  generated_by_model: boolean;
  provider: string;
  note: string;
  drifted?: boolean;
}

export interface AboutMetadata {
  description: string;
  topics: string[];
  source: string;
  source_fingerprint: string;
  limits: string[];
}

export interface ReadmeResponse {
  title: string;
  markdown: string;
  about: AboutMetadata;
  repository: Repository;
  has_readme: boolean;
  license_file: string;
  manifests: string[];
  saved_document_id: string;
  source_fingerprint: string;
  generated_by: string;
  max_topics: number;
  max_description: number;
}

export interface SaveReadmeResponse {
  document: DocumentRecord;
  about: AboutMetadata;
  markdown: string;
}

export interface SaveAboutResponse {
  description: string;
  topics: string[];
  source: string;
}

export interface ProviderRepository {
  owner: string;
  name: string;
  full_name: string;
  description: string;
  language: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  external_id: string;
}

export interface ProviderRepositoriesResponse {
  repositories: ProviderRepository[];
  provider: string;
}

export interface ApiErrorPayload {
  error: string;
  message: string;
  document_id?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// API contracts (cross-repository)
// ---------------------------------------------------------------------------

export interface Contract {
  id: string;
  repository_id: string;
  repository_name?: string;
  branch: string;
  commit_sha?: string;
  direction: string;
  method: string;
  path: string;
  normalized_path: string;
  operation: string;
  file_path: string;
  line: number;
  handler?: string;
  source?: string;
}

export interface ContractLink {
  producer_repository_id: string;
  producer_repository_name: string;
  producer_file: string;
  producer_line: number;
  consumer_repository_id: string;
  consumer_repository_name: string;
  consumer_file: string;
  consumer_line: number;
  method: string;
  path: string;
  operation: string;
  match: string;
  confidence: number;
  cross_repository: boolean;
}

export interface ContractSurface {
  producers: Contract[];
  consumers: Contract[];
  links: ContractLink[];
  unmatched_consumers: Contract[];
  orphan_producers: Contract[];
  cross_repo_links: number;
  totals: { producers: number; consumers: number };
  analyzed_at: string;
  limitations: string[];
}

export interface ContractRepository {
  repository: Repository;
  branch: string;
  indexed: boolean;
  producers: Contract[];
  consumers: Contract[];
}

export interface ContractWorkspace {
  workspace_id: string;
  repositories: ContractRepository[];
  surface: ContractSurface;
  summary: {
    repositories: number;
    indexed_repositories: number;
    producers: number;
    consumers: number;
    links: number;
    cross_repo_links: number;
    unmatched_consumers: number;
    orphan_producers: number;
  };
  limitations: string[];
}

export interface ContractEndpoint {
  method: string;
  path: string;
  file: string;
  line: number;
}

export interface ContractBreakingChange {
  kind: string;
  severity: string;
  method: string;
  path: string;
  detail: string;
  base_file?: string;
  head_file?: string;
  consumers?: ContractLink[];
}

export interface ContractDiff {
  repository: Repository;
  base_branch: string;
  head_branch: string;
  base_commit: string;
  head_commit: string;
  diff: {
    base_commit?: string;
    head_commit?: string;
    added: ContractEndpoint[];
    removed: ContractEndpoint[];
    renamed_parameters: ContractBreakingChange[];
    breaking: ContractBreakingChange[];
    unchanged: number;
    base_total: number;
    head_total: number;
    limitations: string[];
  };
  affected_repositories: string[];
  missing_branches: string[];
  limitations: string[];
}

// ---------------------------------------------------------------------------
// Architecture snapshots and temporal diff
// ---------------------------------------------------------------------------

export interface SnapshotRef {
  id: string;
  commit_sha: string;
  branch: string;
  label: string;
  created_at: string;
  nodes: number;
  edges: number;
  files: number;
  modules: number;
  api_producers: number;
  api_consumers: number;
  cycles: number;
}

export interface ModuleEdgeChange {
  from: string;
  to: string;
  before: number;
  after: number;
  delta: number;
}

export interface DriftFactor {
  label: string;
  points: number;
  detail: string;
}

export interface ArchitectureSnapshot {
  id: string;
  repository_id: string;
  branch: string;
  commit_sha: string;
  label: string;
  nodes: number;
  edges: number;
  files: number;
  modules: number;
  api_producers: number;
  api_consumers: number;
  cycles: number;
  created_at: string;
  payload?: {
    files: string[];
    modules: string[];
    module_edges: ModuleEdge[];
    cycles: string[][];
    producers: string[];
    consumers: string[];
    top_files: { path: string; in_degree: number }[];
    imports: number;
    symbols: number;
    cross_module_edges: number;
  };
}

export interface TemporalDiff {
  base: SnapshotRef;
  head: SnapshotRef;
  added_files: string[];
  removed_files: string[];
  added_module_edges: ModuleEdgeChange[];
  removed_module_edges: ModuleEdgeChange[];
  changed_module_edges: ModuleEdgeChange[];
  new_cycles: string[][];
  resolved_cycles: string[][];
  added_apis: string[];
  removed_apis: string[];
  coupling_delta: number;
  cross_module_delta: number;
  edge_delta: number;
  file_delta: number;
  drift_score: number;
  drift_level: string;
  drift_factors: DriftFactor[];
  summary: string[];
  limitations: string[];
}

// ---------------------------------------------------------------------------
// Ownership / hotspots / bus factor
// ---------------------------------------------------------------------------

export interface AuthorShare {
  name: string;
  email: string;
  touches: number;
  additions: number;
  deletions: number;
  share: number;
}

export interface AuthorOwnership {
  name: string;
  email: string;
  commits: number;
  files: number;
  touches: number;
  additions: number;
  deletions: number;
  share: number;
  last_active: string;
}

export interface FileOwnership {
  path: string;
  touches: number;
  additions: number;
  deletions: number;
  lines: number;
  fan_in: number;
  findings: number;
  authors: AuthorShare[];
  top_author: string;
  top_author_email: string;
  top_share: number;
  bus_factor: number;
  last_touched: string;
}

export interface ModuleOwnership {
  module: string;
  files: number;
  touches: number;
  top_author: string;
  top_email: string;
  top_share: number;
  bus_factor: number;
  hotspot_sum: number;
}

export interface Hotspot {
  path: string;
  score: number;
  breakdown: Record<string, number>;
  reason: string;
  top_author: string;
  bus_factor: number;
}

export interface CodeownerRule {
  pattern: string;
  handle: string;
  owner: string;
  share: number;
  touches: number;
  line: string;
}

export interface OwnershipReport {
  repository: Repository;
  branch: string;
  authors: AuthorOwnership[];
  files: FileOwnership[];
  modules: ModuleOwnership[];
  hotspots: Hotspot[];
  unowned_hotspots: string[];
  codeowners: CodeownerRule[];
  repo_bus_factor: number;
  top_author_share: number;
  total_touches: number;
  commits_with_file_evidence: number;
  total_stored_commits: number;
  limitations: string[];
}

// ---------------------------------------------------------------------------
// Test impact selection
// ---------------------------------------------------------------------------

export interface TestReason {
  test: string;
  covers: string;
  hops: number;
  chain: string[];
  confidence: string;
  evidence: string;
}

export interface TestSelection {
  repository: Repository;
  branch: string;
  changed_files: string[];
  affected_files: { path: string; depth: number; via: string; why: string; chain: string[] }[];
  direct_tests: string[];
  transitive_tests: string[];
  selected_tests: string[];
  reasons: TestReason[];
  unmapped_files: string[];
  runner: string;
  command: string;
  full_suite_command: string;
  command_rationale: string;
  confidence: string;
  confidence_score: number;
  caveats: string[];
}

// ---------------------------------------------------------------------------
// CI / check gate
// ---------------------------------------------------------------------------

export interface Violation {
  code: string;
  severity: string;
  message: string;
  file?: string;
  line?: number;
  end_line?: number;
  rule: string;
}

export interface CheckResult {
  repository: Repository;
  branch: string;
  verdict: string;
  passed: boolean;
  health: {
    score: number;
    grade: string;
    findings: number;
    by_severity: Record<string, number>;
    by_kind: Record<string, number>;
    penalties: { label: string; points: number; count: number }[];
    limitations: string[];
    metrics: any;
  };
  violations: Violation[];
  counts: { [key: string]: number };
  policy: any;
  generated_at: string;
  limitations: string[];
}
