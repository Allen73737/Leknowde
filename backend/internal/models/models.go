package models

// User is an authenticated platform account.
type User struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	CreatedAt string `json:"created_at"`
}

type Organization struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	Role      string `json:"role,omitempty"`
	CreatedAt string `json:"created_at"`
}

type Workspace struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Description    string `json:"description"`
	Role           string `json:"role,omitempty"`
	RepositoryCount int   `json:"repository_count"`
	MemberCount    int    `json:"member_count"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

type Member struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	JoinedAt  string `json:"joined_at"`
}

type Integration struct {
	ID           string `json:"id"`
	Provider     string `json:"provider"`
	AccountLogin string `json:"account_login"`
	Scopes       string `json:"scopes"`
	ExpiresAt    string `json:"expires_at"`
	CreatedAt    string `json:"created_at"`
}

type Repository struct {
	ID               string `json:"id"`
	WorkspaceID      string `json:"workspace_id"`
	Provider         string `json:"provider"`
	Owner            string `json:"owner"`
	Name             string `json:"name"`
	FullName         string `json:"full_name"`
	Description      string `json:"description"`
	Language         string `json:"language"`
	Visibility       string `json:"visibility"`
	HTMLURL          string `json:"html_url"`
	DefaultBranch    string `json:"default_branch"`
	Status           string `json:"status"`
	ParserMode       string `json:"parser_mode"`
	LastIndexedAt    string `json:"last_indexed_at"`
	LastIndexedCommit string `json:"last_indexed_commit"`
	IsDemo           bool   `json:"is_demo"`
	FileCount        int    `json:"file_count"`
	SymbolCount      int    `json:"symbol_count"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
}

type Branch struct {
	Name      string `json:"name"`
	HeadSHA   string `json:"head_sha"`
	IsDefault bool   `json:"is_default"`
}

type Commit struct {
	SHA         string `json:"sha"`
	Message     string `json:"message"`
	AuthorName  string `json:"author_name"`
	AuthorEmail string `json:"author_email"`
	CommittedAt string `json:"committed_at"`
}

type File struct {
	ID         string `json:"id"`
	Path       string `json:"path"`
	Size       int    `json:"size"`
	Language   string `json:"language"`
	IsBinary   bool   `json:"is_binary"`
	LineCount  int    `json:"line_count"`
	ContentSHA string `json:"content_sha"`
	Content    string `json:"content,omitempty"`
}

type TreeNode struct {
	Path     string     `json:"path"`
	Name     string     `json:"name"`
	Type     string     `json:"type"`
	Language string     `json:"language,omitempty"`
	Size     int        `json:"size,omitempty"`
	Children []TreeNode `json:"children,omitempty"`
}

type Symbol struct {
	ID            string `json:"id"`
	FileID        string `json:"file_id"`
	FilePath      string `json:"file_path"`
	Kind          string `json:"kind"`
	Name          string `json:"name"`
	QualifiedName string `json:"qualified_name"`
	Signature     string `json:"signature"`
	StartLine     int    `json:"start_line"`
	EndLine       int    `json:"end_line"`
	Exported      bool   `json:"exported"`
	DocComment    string `json:"doc_comment"`
	ParentID      string `json:"parent_id,omitempty"`
}

type GraphNode struct {
	ID       string         `json:"id"`
	Kind     string         `json:"kind"`
	Key      string         `json:"key"`
	Label    string         `json:"label"`
	FilePath string         `json:"file_path"`
	Metadata map[string]any `json:"metadata"`
	InDegree int            `json:"in_degree"`
	OutDegree int           `json:"out_degree"`
}

type GraphEdge struct {
	From     string  `json:"from"`
	To       string  `json:"to"`
	Relation string  `json:"relation"`
	Weight   float64 `json:"weight"`
	Line     int     `json:"line,omitempty"`
	FilePath string  `json:"file_path,omitempty"`
}

type Graph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
	Truncated bool    `json:"truncated"`
}

type Job struct {
	ID             string   `json:"id"`
	RepositoryID   string   `json:"repository_id"`
	Branch         string   `json:"branch"`
	Kind           string   `json:"kind"`
	Status         string   `json:"status"`
	Progress       int      `json:"progress"`
	CurrentStep    string   `json:"current_step"`
	FilesTotal     int      `json:"files_total"`
	FilesProcessed int      `json:"files_processed"`
	SymbolsFound   int      `json:"symbols_found"`
	Error          string   `json:"error"`
	Logs           []string `json:"logs"`
	Attempts       int      `json:"attempts"`
	StartedAt      string   `json:"started_at"`
	CompletedAt    string   `json:"completed_at"`
	CreatedAt      string   `json:"created_at"`
}

type Conversation struct {
	ID           string `json:"id"`
	RepositoryID string `json:"repository_id"`
	Title        string `json:"title"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type Evidence struct {
	FilePath  string `json:"file_path"`
	StartLine int    `json:"start_line"`
	EndLine   int    `json:"end_line"`
	Symbol    string `json:"symbol,omitempty"`
	Snippet   string `json:"snippet"`
	Reason    string `json:"reason"`
	Kind      string `json:"kind"`
}

type Message struct {
	ID         string     `json:"id"`
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	Evidence   []Evidence `json:"evidence"`
	Uncertainty string    `json:"uncertainty"`
	Model      string     `json:"model"`
	TokensIn   int        `json:"tokens_in"`
	TokensOut  int        `json:"tokens_out"`
	CreatedAt  string     `json:"created_at"`
}

type Finding struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	Severity    string `json:"severity"`
	Title       string `json:"title"`
	Description string `json:"description"`
	FilePath    string `json:"file_path"`
	StartLine   int    `json:"start_line"`
	EndLine     int    `json:"end_line"`
	Status      string `json:"status"`
	Evidence    string `json:"evidence"`
}

type Document struct {
	ID                string `json:"id"`
	RepositoryID      string `json:"repository_id"`
	Kind              string `json:"kind"`
	Title             string `json:"title"`
	Path              string `json:"path"`
	Content           string `json:"content"`
	Status            string `json:"status"`
	SourceFingerprint string `json:"source_fingerprint"`
	Drift             string `json:"drift"`
	CreatedBy         string `json:"created_by"`
	UpdatedAt         string `json:"updated_at"`
	CreatedAt         string `json:"created_at"`
}

type ImpactReport struct {
	ID           string `json:"id"`
	RepositoryID string `json:"repository_id"`
	UserID       string `json:"user_id"`
	Title        string `json:"title"`
	Request      string `json:"request"`
	Summary      string `json:"summary"`
	RiskLevel    string `json:"risk_level"`
	RiskRationale string `json:"risk_rationale"`
	Payload      string `json:"payload"`
	Confidence   string `json:"confidence"`
	CreatedAt    string `json:"created_at"`
}

type Notification struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Link      string `json:"link"`
	Read      bool   `json:"read"`
	CreatedAt string `json:"created_at"`
}

type AuditLog struct {
	ID        string `json:"id"`
	Action    string `json:"action"`
	TargetType string `json:"target_type"`
	TargetID  string `json:"target_id"`
	ActorEmail string `json:"actor_email"`
	Metadata  string `json:"metadata"`
	IP        string `json:"ip"`
	CreatedAt string `json:"created_at"`
}

type Embedding struct {
	ID       string
	FilePath string
	Content  string
	Vector   []float64
	Kind     string
}
