package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/platform"
)

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

func (s *Store) UpsertIntegration(ctx context.Context, userID, orgID, provider, login, token, refresh, scopes, expiresAt string) (models.Integration, error) {
	encToken, err := s.Cipher.Encrypt(token)
	if err != nil {
		return models.Integration{}, err
	}
	encRefresh, err := s.Cipher.Encrypt(refresh)
	if err != nil {
		return models.Integration{}, err
	}
	now := platform.Now()
	id := NewID()
	_, err = s.DB.ExecContext(ctx, `INSERT INTO integrations (id, user_id, organization_id, provider, account_login, access_token_enc, refresh_token_enc, scopes, expires_at, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT (user_id, organization_id, provider) DO UPDATE SET account_login = excluded.account_login,
			access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc,
			scopes = excluded.scopes, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
		id, userID, orgID, provider, login, encToken, encRefresh, scopes, expiresAt, now, now)
	if err != nil {
		return models.Integration{}, err
	}
	return s.GetIntegration(ctx, userID, orgID, provider)
}

func (s *Store) GetIntegration(ctx context.Context, userID, orgID, provider string) (models.Integration, error) {
	var in models.Integration
	err := s.DB.QueryRowContext(ctx, `SELECT id, provider, account_login, scopes, COALESCE(expires_at,''), created_at
		FROM integrations WHERE user_id = ? AND organization_id = ? AND provider = ?`, userID, orgID, provider).
		Scan(&in.ID, &in.Provider, &in.AccountLogin, &in.Scopes, &in.ExpiresAt, &in.CreatedAt)
	if platform.IsNoRows(err) {
		return in, ErrNotFound
	}
	return in, err
}

// IntegrationToken decrypts the stored provider token for server-side API calls.
func (s *Store) IntegrationToken(ctx context.Context, orgID, provider string) (string, string, error) {
	var encToken, login string
	err := s.DB.QueryRowContext(ctx, `SELECT access_token_enc, account_login FROM integrations
		WHERE organization_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1`, orgID, provider).Scan(&encToken, &login)
	if platform.IsNoRows(err) {
		return "", "", ErrNotFound
	}
	if err != nil {
		return "", "", err
	}
	token, err := s.Cipher.Decrypt(encToken)
	return token, login, err
}

func (s *Store) ListIntegrations(ctx context.Context, orgID string) ([]models.Integration, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, provider, account_login, scopes, COALESCE(expires_at,''), created_at
		FROM integrations WHERE organization_id = ? ORDER BY provider`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Integration{}
	for rows.Next() {
		var in models.Integration
		if err := rows.Scan(&in.ID, &in.Provider, &in.AccountLogin, &in.Scopes, &in.ExpiresAt, &in.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, in)
	}
	return out, rows.Err()
}

func (s *Store) DeleteIntegration(ctx context.Context, orgID, provider string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM integrations WHERE organization_id = ? AND provider = ?`, orgID, provider)
	return err
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

type NewRepository struct {
	WorkspaceID   string
	Provider      string
	Owner         string
	Name          string
	Description   string
	Language      string
	Visibility    string
	HTMLURL       string
	DefaultBranch string
	ExternalID    string
	IntegrationID string
	Private       bool
	IsDemo        bool
}

func (s *Store) CreateRepository(ctx context.Context, in NewRepository) (models.Repository, error) {
	now := platform.Now()
	id := NewID()
	fullName := in.Owner + "/" + in.Name
	if in.Owner == "" {
		fullName = in.Name
	}
	var existing string
	err := s.DB.QueryRowContext(ctx, `SELECT id FROM repositories WHERE workspace_id = ? AND full_name = ? AND deleted_at IS NULL`, in.WorkspaceID, fullName).Scan(&existing)
	if err == nil {
		return s.GetRepository(ctx, existing)
	}
	if !platform.IsNoRows(err) {
		return models.Repository{}, err
	}

	// Reuse an existing connection row when one exists for this provider/owner/repo.
	var connID string
	err = s.DB.QueryRowContext(ctx, `SELECT id FROM repository_connections WHERE workspace_id = ? AND provider = ? AND owner = ? AND repo_name = ?`,
		in.WorkspaceID, in.Provider, in.Owner, in.Name).Scan(&connID)
	if platform.IsNoRows(err) {
		connID = NewID()
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO repository_connections (id, workspace_id, integration_id, provider, owner, repo_name, external_id, html_url, default_branch, private, created_at, updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, connID, in.WorkspaceID, in.IntegrationID, in.Provider, in.Owner, in.Name, in.ExternalID, in.HTMLURL, in.DefaultBranch, boolInt(in.Private), now, now); err != nil {
			return models.Repository{}, err
		}
	} else if err != nil {
		return models.Repository{}, err
	}

	visibility := in.Visibility
	if visibility == "" {
		if in.Private {
			visibility = "private"
		} else {
			visibility = "public"
		}
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO repositories (id, workspace_id, connection_id, provider, owner, name, full_name, description, language, visibility, html_url, default_branch, status, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, in.WorkspaceID, connID, in.Provider, in.Owner, in.Name, fullName, in.Description, in.Language, visibility, in.HTMLURL, in.DefaultBranch, "pending", now, now); err != nil {
		return models.Repository{}, err
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO repository_branches (id, repository_id, name, is_default, created_at) VALUES (?,?,?,?,?)
		ON CONFLICT (repository_id, name) DO NOTHING`, NewID(), id, in.DefaultBranch, 1, now); err != nil {
		return models.Repository{}, err
	}
	return s.GetRepository(ctx, id)
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

const repoSelect = `SELECT r.id, r.workspace_id, r.provider, r.owner, r.name, r.full_name, r.description, r.language, r.visibility,
	r.html_url, r.default_branch, r.status, r.parser_mode, COALESCE(r.last_indexed_at,''), COALESCE(r.last_indexed_commit,''), r.created_at, r.updated_at,
	(SELECT COUNT(1) FROM repository_files f WHERE f.repository_id = r.id AND f.is_binary = 0),
	(SELECT COUNT(1) FROM code_symbols c WHERE c.repository_id = r.id)`

func scanRepository(row interface {
	Scan(dest ...any) error
}) (models.Repository, error) {
	var r models.Repository
	var lastAt, lastSHA sql.NullString
	err := row.Scan(&r.ID, &r.WorkspaceID, &r.Provider, &r.Owner, &r.Name, &r.FullName, &r.Description, &r.Language, &r.Visibility,
		&r.HTMLURL, &r.DefaultBranch, &r.Status, &r.ParserMode, &lastAt, &lastSHA, &r.CreatedAt, &r.UpdatedAt, &r.FileCount, &r.SymbolCount)
	if platform.IsNoRows(err) {
		return r, ErrNotFound
	}
	if err != nil {
		return r, err
	}
	r.LastIndexedAt = platform.NullString(lastAt)
	r.LastIndexedCommit = platform.NullString(lastSHA)
	r.IsDemo = r.Provider == "demo"
	return r, nil
}

func (s *Store) GetRepository(ctx context.Context, id string) (models.Repository, error) {
	return scanRepository(s.DB.QueryRowContext(ctx, repoSelect+` FROM repositories r WHERE r.id = ? AND r.deleted_at IS NULL`, id))
}

// RepositoryForUser loads a repository only when the user is a workspace member.
func (s *Store) RepositoryForUser(ctx context.Context, repoID, userID string) (models.Repository, error) {
	repo, err := scanRepository(s.DB.QueryRowContext(ctx, repoSelect+` FROM repositories r
		JOIN workspace_members m ON m.workspace_id = r.workspace_id
		WHERE r.id = ? AND m.user_id = ? AND r.deleted_at IS NULL`, repoID, userID))
	if err == ErrNotFound {
		return repo, ErrForbidden
	}
	return repo, err
}

func (s *Store) ListRepositories(ctx context.Context, workspaceID string) ([]models.Repository, error) {
	rows, err := s.DB.QueryContext(ctx, repoSelect+` FROM repositories r WHERE r.workspace_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Repository{}
	for rows.Next() {
		r, err := scanRepository(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) ListAllRepositoriesForUser(ctx context.Context, userID string) ([]models.Repository, error) {
	rows, err := s.DB.QueryContext(ctx, repoSelect+` FROM repositories r
		JOIN workspace_members m ON m.workspace_id = r.workspace_id
		WHERE m.user_id = ? AND r.deleted_at IS NULL ORDER BY r.updated_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Repository{}
	for rows.Next() {
		r, err := scanRepository(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) SetRepositoryStatus(ctx context.Context, id, status, commit string) error {
	now := platform.Now()
	if status == "ready" {
		_, err := s.DB.ExecContext(ctx, `UPDATE repositories SET status = ?, last_indexed_at = ?, last_indexed_commit = ?, updated_at = ? WHERE id = ?`, status, now, commit, now, id)
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE repositories SET status = ?, updated_at = ? WHERE id = ?`, status, now, id)
	return err
}

func (s *Store) UpdateRepositoryMeta(ctx context.Context, id, description, language, visibility, htmlURL, defaultBranch string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE repositories SET description = ?, language = ?, visibility = ?, html_url = ?, default_branch = ?, updated_at = ? WHERE id = ?`,
		description, language, visibility, htmlURL, defaultBranch, platform.Now(), id)
	return err
}

func (s *Store) DeleteRepository(ctx context.Context, id string) error {
	now := platform.Now()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`UPDATE repositories SET deleted_at = ?, updated_at = ? WHERE id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, stmt, now, now, id); err != nil {
			return err
		}
	}
	for _, table := range []string{"embeddings", "graph_edges", "graph_nodes", "code_symbols", "repository_files", "analysis_findings", "generated_documents"} {
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`DELETE FROM %s WHERE repository_id = ?`, table), id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------------------------------------------------------------------------
// Branches & commits
// ---------------------------------------------------------------------------

func (s *Store) UpsertBranch(ctx context.Context, repoID, name, sha string, isDefault bool) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO repository_branches (id, repository_id, name, head_sha, is_default, created_at) VALUES (?,?,?,?,?,?)
		ON CONFLICT (repository_id, name) DO UPDATE SET head_sha = excluded.head_sha, is_default = excluded.is_default`,
		NewID(), repoID, name, sha, boolInt(isDefault), platform.Now())
	return err
}

func (s *Store) ListBranches(ctx context.Context, repoID string) ([]models.Branch, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT name, head_sha, is_default FROM repository_branches WHERE repository_id = ? ORDER BY is_default DESC, name ASC`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Branch{}
	for rows.Next() {
		var b models.Branch
		var def int
		if err := rows.Scan(&b.Name, &b.HeadSHA, &def); err != nil {
			return nil, err
		}
		b.IsDefault = def == 1
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) BranchHead(ctx context.Context, repoID, branch string) string {
	var sha string
	_ = s.DB.QueryRowContext(ctx, `SELECT head_sha FROM repository_branches WHERE repository_id = ? AND name = ?`, repoID, branch).Scan(&sha)
	return sha
}

func (s *Store) UpsertCommit(ctx context.Context, repoID string, c models.Commit, branch string) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO commits (id, repository_id, sha, branch, message, author_name, author_email, committed_at, created_at)
		VALUES (?,?,?,?,?,?,?,?,?)
		ON CONFLICT (repository_id, sha) DO NOTHING`,
		NewID(), repoID, c.SHA, branch, c.Message, c.AuthorName, c.AuthorEmail, c.CommittedAt, platform.Now())
	return err
}

func (s *Store) ListCommits(ctx context.Context, repoID string, limit int) ([]models.Commit, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT sha, message, author_name, author_email, committed_at FROM commits
		WHERE repository_id = ? ORDER BY committed_at DESC LIMIT ?`, repoID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Commit{}
	for rows.Next() {
		var c models.Commit
		if err := rows.Scan(&c.SHA, &c.Message, &c.AuthorName, &c.AuthorEmail, &c.CommittedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

type FileInput struct {
	Path      string
	BlobSHA   string
	Size      int
	Language  string
	IsBinary  bool
	Content   string
	LineCount int
}

func (s *Store) UpsertFile(ctx context.Context, repoID, branch string, in FileInput) (string, error) {
	now := platform.Now()
	hash := fmt.Sprintf("%x", fnv64(in.Content))
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT id, content_hash FROM repository_files WHERE repository_id = ? AND branch = ? AND path = ?`,
		repoID, branch, in.Path).Scan(&id, new(string))
	if platform.IsNoRows(err) {
		id = NewID()
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO repository_files (id, repository_id, branch, path, blob_sha, size, language, is_binary, content_hash, line_count, content, created_at, updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			id, repoID, branch, in.Path, in.BlobSHA, in.Size, in.Language, boolInt(in.IsBinary), hash, in.LineCount, in.Content, now, now); err != nil {
			return "", err
		}
		return id, nil
	}
	if err != nil {
		return "", err
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE repository_files SET blob_sha = ?, size = ?, language = ?, is_binary = ?, content_hash = ?, line_count = ?, content = ?, updated_at = ?
		WHERE id = ?`, in.BlobSHA, in.Size, in.Language, boolInt(in.IsBinary), hash, in.LineCount, in.Content, now, id); err != nil {
		return "", err
	}
	return id, nil
}

func (s *Store) FileChanged(ctx context.Context, repoID, branch, filePath, blobSHA string) (string, bool) {
	var id, sha string
	err := s.DB.QueryRowContext(ctx, `SELECT id, blob_sha FROM repository_files WHERE repository_id = ? AND branch = ? AND path = ?`, repoID, branch, filePath).Scan(&id, &sha)
	if platform.IsNoRows(err) {
		return "", true
	}
	return id, err != nil || sha != blobSHA
}

func (s *Store) GetFile(ctx context.Context, repoID, branch, filePath string) (models.File, error) {
	var f models.File
	var content sql.NullString
	err := s.DB.QueryRowContext(ctx, `SELECT id, path, size, language, is_binary, line_count, content_hash, content
		FROM repository_files WHERE repository_id = ? AND branch = ? AND path = ?`, repoID, branch, filePath).
		Scan(&f.ID, &f.Path, &f.Size, &f.Language, &f.IsBinary, &f.LineCount, &f.ContentSHA, &content)
	if platform.IsNoRows(err) {
		return f, ErrNotFound
	}
	f.Content = platform.NullString(content)
	return f, err
}

func (s *Store) ListFilePaths(ctx context.Context, repoID, branch string) ([]models.File, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, path, size, language, is_binary, line_count, content_hash FROM repository_files
		WHERE repository_id = ? AND branch = ? ORDER BY path ASC`, repoID, branch)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.File{}
	for rows.Next() {
		var f models.File
		if err := rows.Scan(&f.ID, &f.Path, &f.Size, &f.Language, &f.IsBinary, &f.LineCount, &f.ContentSHA); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// BuildTree converts a flat file list into a nested directory tree.
func BuildTree(files []models.File) []models.TreeNode {
	root := &models.TreeNode{Path: "", Name: "", Type: "dir", Children: []models.TreeNode{}}
	index := map[string]*models.TreeNode{"": root}
	for _, f := range files {
		parts := strings.Split(strings.ReplaceAll(f.Path, "\\", "/"), "/")
		cur := ""
		parent := root
		for i, part := range parts {
			next := part
			if cur != "" {
				next = cur + "/" + part
			}
			isLeaf := i == len(parts)-1
			node, ok := index[next]
			if !ok {
				node = &models.TreeNode{Path: next, Name: part, Type: "dir", Children: []models.TreeNode{}}
				if isLeaf {
					node.Type = "file"
					node.Language = f.Language
					node.Size = f.Size
					node.Children = nil
				}
				index[next] = node
				parent.Children = append(parent.Children, *node)
			}
			parent = index[next]
			cur = next
		}
	}
	var sortNodes func(nodes []models.TreeNode)
	sortNodes = func(nodes []models.TreeNode) {
		sort.SliceStable(nodes, func(i, j int) bool {
			if nodes[i].Type != nodes[j].Type {
				return nodes[i].Type == "dir"
			}
			return nodes[i].Name < nodes[j].Name
		})
		for i := range nodes {
			sortNodes(nodes[i].Children)
		}
	}
	sortNodes(root.Children)
	return root.Children
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

type SymbolInput struct {
	Kind          string
	Name          string
	QualifiedName string
	Signature     string
	StartLine     int
	EndLine       int
	ParentIndex   int
	Exported      bool
	DocComment    string
	Metadata      map[string]any
}

func (s *Store) ReplaceFileSymbols(ctx context.Context, repoID, fileID, filePath string, in []SymbolInput) (int, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM code_symbols WHERE file_id = ?`, fileID); err != nil {
		return 0, err
	}
	ids := make([]string, len(in))
	for i := range in {
		ids[i] = NewID()
	}
	for i, sym := range in {
		var parent any
		if sym.ParentIndex >= 0 && sym.ParentIndex < len(ids) {
			parent = ids[sym.ParentIndex]
		}
		meta, _ := json.Marshal(sym.Metadata)
		if sym.Metadata == nil {
			meta = []byte("{}")
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO code_symbols (id, repository_id, file_id, kind, name, qualified_name, signature, start_line, end_line, parent_symbol_id, exported, doc_comment, metadata)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			ids[i], repoID, fileID, sym.Kind, sym.Name, sym.QualifiedName, sym.Signature, sym.StartLine, sym.EndLine, parent, boolInt(sym.Exported), sym.DocComment, string(meta)); err != nil {
			return 0, err
		}
	}
	return len(in), tx.Commit()
}

const symbolSelect = `SELECT c.id, c.file_id, f.path, c.kind, c.name, c.qualified_name, c.signature, c.start_line, c.end_line,
	c.exported, c.doc_comment, COALESCE(c.parent_symbol_id,'')
	FROM code_symbols c JOIN repository_files f ON f.id = c.file_id`

func scanSymbol(row interface{ Scan(dest ...any) error }) (models.Symbol, error) {
	var sy models.Symbol
	var exported int
	err := row.Scan(&sy.ID, &sy.FileID, &sy.FilePath, &sy.Kind, &sy.Name, &sy.QualifiedName, &sy.Signature,
		&sy.StartLine, &sy.EndLine, &exported, &sy.DocComment, &sy.ParentID)
	sy.Exported = exported == 1
	return sy, err
}

func (s *Store) ListSymbols(ctx context.Context, repoID, kind, query string, limit int) ([]models.Symbol, error) {
	q := symbolSelect + ` WHERE c.repository_id = ?`
	args := []any{repoID}
	if kind != "" {
		q += ` AND c.kind = ?`
		args = append(args, kind)
	}
	if query != "" {
		q += ` AND (LOWER(c.name) LIKE ? OR LOWER(c.qualified_name) LIKE ?)`
		like := "%" + strings.ToLower(query) + "%"
		args = append(args, like, like)
	}
	q += ` ORDER BY f.path ASC, c.start_line ASC LIMIT ?`
	args = append(args, limit)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Symbol{}
	for rows.Next() {
		sy, err := scanSymbol(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sy)
	}
	return out, rows.Err()
}

func (s *Store) SymbolByID(ctx context.Context, id string) (models.Symbol, error) {
	return scanSymbol(s.DB.QueryRowContext(ctx, symbolSelect+` WHERE c.id = ?`, id))
}

func (s *Store) SymbolsInFile(ctx context.Context, fileID string) ([]models.Symbol, error) {
	rows, err := s.DB.QueryContext(ctx, symbolSelect+` WHERE c.file_id = ? ORDER BY c.start_line ASC`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Symbol{}
	for rows.Next() {
		sy, err := scanSymbol(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sy)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Graph (portable adjacency store; Neo4j adapter mirrors the same shape)
// ---------------------------------------------------------------------------

func (s *Store) UpsertNode(ctx context.Context, repoID, kind, key, label, filePath string, meta map[string]any) (string, error) {
	nodeID := NewID()
	raw, _ := json.Marshal(meta)
	if meta == nil {
		raw = []byte("{}")
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO graph_nodes (id, repository_id, kind, key, label, file_path, metadata) VALUES (?,?,?,?,?,?,?)
		ON CONFLICT (repository_id, kind, key) DO UPDATE SET label = excluded.label, file_path = excluded.file_path, metadata = excluded.metadata`,
		nodeID, repoID, kind, key, label, filePath, string(raw))
	return nodeID, err
}

func (s *Store) UpsertEdge(ctx context.Context, repoID, fromKey, toKey, relation, filePath string, line int, confidence float64, meta map[string]any) error {
	raw, _ := json.Marshal(meta)
	if meta == nil {
		raw = []byte("{}")
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO graph_edges (id, repository_id, from_key, to_key, relation, weight, confidence, file_path, line, metadata)
		VALUES (?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT (repository_id, from_key, to_key, relation) DO UPDATE SET line = excluded.line, confidence = excluded.confidence, file_path = excluded.file_path`,
		NewID(), repoID, fromKey, toKey, relation, 1.0, confidence, filePath, line, string(raw))
	return err
}

// ClearFileGraph removes edges and nodes previously produced from a file so an
// incremental re-index does not accumulate stale relationships.
func (s *Store) ClearFileGraph(ctx context.Context, repoID, filePath string) error {
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM graph_edges WHERE repository_id = ? AND file_path = ?`, repoID, filePath); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, `DELETE FROM graph_nodes WHERE repository_id = ? AND file_path = ?`, repoID, filePath)
	return err
}

func (s *Store) GraphStats(ctx context.Context, repoID string) (int, int, error) {
	var nodes, edges int
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM graph_nodes WHERE repository_id = ?`, repoID).Scan(&nodes); err != nil {
		return 0, 0, err
	}
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM graph_edges WHERE repository_id = ?`, repoID).Scan(&edges); err != nil {
		return 0, 0, err
	}
	return nodes, edges, nil
}

func (s *Store) LoadGraph(ctx context.Context, repoID string, kinds []string, relations []string, limit int) (models.Graph, error) {
	g := models.Graph{Nodes: []models.GraphNode{}, Edges: []models.GraphEdge{}}
	q := `SELECT id, kind, key, label, file_path, metadata FROM graph_nodes WHERE repository_id = ?`
	args := []any{repoID}
	if len(kinds) > 0 {
		placeholders := make([]string, len(kinds))
		for i, k := range kinds {
			placeholders[i] = "?"
			args = append(args, k)
		}
		q += ` AND kind IN (` + strings.Join(placeholders, ",") + `)`
	}
	q += ` ORDER BY kind ASC, label ASC LIMIT ?`
	args = append(args, limit)

	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return g, err
	}
	byKey := map[string]models.GraphNode{}
	for rows.Next() {
		var n models.GraphNode
		var meta string
		if err := rows.Scan(&n.ID, &n.Kind, &n.Key, &n.Label, &n.FilePath, &meta); err != nil {
			rows.Close()
			return g, err
		}
		n.Metadata = map[string]any{}
		_ = json.Unmarshal([]byte(meta), &n.Metadata)
		byKey[n.Key] = n
	}
	rows.Close()

	eq := `SELECT from_key, to_key, relation, weight, line, file_path FROM graph_edges WHERE repository_id = ?`
	eArgs := []any{repoID}
	if len(relations) > 0 {
		placeholders := make([]string, len(relations))
		for i, r := range relations {
			placeholders[i] = "?"
			eArgs = append(eArgs, r)
		}
		eq += ` AND relation IN (` + strings.Join(placeholders, ",") + `)`
	}
	eq += ` LIMIT ?`
	eArgs = append(eArgs, limit*4)
	erows, err := s.DB.QueryContext(ctx, eq, eArgs...)
	if err != nil {
		return g, err
	}
	defer erows.Close()
	for erows.Next() {
		var e models.GraphEdge
		if err := erows.Scan(&e.From, &e.To, &e.Relation, &e.Weight, &e.Line, &e.FilePath); err != nil {
			return g, err
		}
		if _, ok := byKey[e.From]; !ok {
			continue
		}
		if _, ok := byKey[e.To]; !ok {
			continue
		}
		byKey[e.From] = incrementOut(byKey[e.From])
		byKey[e.To] = incrementIn(byKey[e.To])
		g.Edges = append(g.Edges, e)
	}
	for _, n := range byKey {
		g.Nodes = append(g.Nodes, n)
	}
	sort.Slice(g.Nodes, func(i, j int) bool { return g.Nodes[i].Key < g.Nodes[j].Key })
	g.Truncated = len(g.Nodes) >= limit
	return g, nil
}

func incrementIn(n models.GraphNode) models.GraphNode { n.InDegree++; return n }
func incrementOut(n models.GraphNode) models.GraphNode { n.OutDegree++; return n }

// ReverseDependencyClosure walks incoming edges to find everything that would
// be affected by changing the given node.
type ImpactNode struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	Kind     string  `json:"kind"`
	FilePath string  `json:"file_path"`
	Depth    int     `json:"depth"`
	Via      string  `json:"via"`
	Path     []string `json:"path"`
}

func (s *Store) ReverseClosure(ctx context.Context, repoID string, seeds []string, maxDepth, maxNodes int) ([]ImpactNode, error) {
	type frontierNode struct {
		key   string
		depth int
		path  []string
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT from_key, to_key, relation FROM graph_edges WHERE repository_id = ?`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	incoming := map[string][]struct{ from, relation string }{}
	for rows.Next() {
		var from, to, rel string
		if err := rows.Scan(&from, &to, &rel); err != nil {
			return nil, err
		}
		incoming[to] = append(incoming[to], struct{ from, relation string }{from, rel})
	}

	nodeRows, err := s.DB.QueryContext(ctx, `SELECT key, label, kind, file_path FROM graph_nodes WHERE repository_id = ?`, repoID)
	if err != nil {
		return nil, err
	}
	defer nodeRows.Close()
	meta := map[string]models.GraphNode{}
	for nodeRows.Next() {
		var n models.GraphNode
		if err := nodeRows.Scan(&n.Key, &n.Label, &n.Kind, &n.FilePath); err != nil {
			return nil, err
		}
		meta[n.Key] = n
	}

	visited := map[string]bool{}
	out := []ImpactNode{}
	queue := []frontierNode{}
	for _, seed := range seeds {
		visited[seed] = true
		queue = append(queue, frontierNode{key: seed, depth: 0, path: []string{seed}})
	}
	for len(queue) > 0 && len(out) < maxNodes {
		cur := queue[0]
		queue = queue[1:]
		if cur.depth >= maxDepth {
			continue
		}
		for _, edge := range incoming[cur.key] {
			if visited[edge.from] {
				continue
			}
			visited[edge.from] = true
			n := meta[edge.from]
			nextPath := append(append([]string{}, cur.path...), edge.from)
			out = append(out, ImpactNode{
				Key: n.Key, Label: n.Label, Kind: n.Kind, FilePath: n.FilePath,
				Depth: cur.depth + 1, Via: edge.relation, Path: nextPath,
			})
			queue = append(queue, frontierNode{key: edge.from, depth: cur.depth + 1, path: nextPath})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Depth != out[j].Depth {
			return out[i].Depth < out[j].Depth
		}
		return out[i].Key < out[j].Key
	})
	return out, nil
}

// FindCycles returns circular dependency groups among file-level IMPORTS edges.
func (s *Store) FindCycles(ctx context.Context, repoID string) ([][]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT from_key, to_key FROM graph_edges WHERE repository_id = ? AND relation = 'IMPORTS'`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	adj := map[string][]string{}
	for rows.Next() {
		var from, to string
		if err := rows.Scan(&from, &to); err != nil {
			return nil, err
		}
		adj[from] = append(adj[from], to)
	}
	const (
		white = 0
		gray  = 1
		black = 2
	)
	color := map[string]int{}
	var stack []string
	seen := map[string]bool{}
	cycles := [][]string{}
	var dfs func(node string)
	dfs = func(node string) {
		color[node] = gray
		stack = append(stack, node)
		for _, next := range adj[node] {
			switch color[next] {
			case white:
				dfs(next)
			case gray:
				idx := -1
				for i, n := range stack {
					if n == next {
						idx = i
						break
					}
				}
				if idx >= 0 {
					cycle := append([]string{}, stack[idx:]...)
					key := strings.Join(cycle, ">")
					if !seen[key] {
						seen[key] = true
						cycles = append(cycles, cycle)
					}
				}
			}
		}
		stack = stack[:len(stack)-1]
		color[node] = black
	}
	keys := make([]string, 0, len(adj))
	for k := range adj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if color[k] == white {
			dfs(k)
		}
	}
	if len(cycles) > 50 {
		cycles = cycles[:50]
	}
	return cycles, nil
}

// UnusedImportCandidates finds IMPORTS edges pointing at files that never
// reference the imported symbol names. Results are candidates, not verdicts.
func (s *Store) UnusedImportCandidates(ctx context.Context, repoID string) ([]map[string]any, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT e.from_key, e.to_key, e.file_path, e.line, e.metadata,
		(SELECT content FROM repository_files f WHERE f.repository_id = e.repository_id AND f.path = e.file_path LIMIT 1)
		FROM graph_edges e WHERE e.repository_id = ? AND e.relation = 'IMPORTS' LIMIT 500`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var from, to, filePath, meta string
		var line int
		var content sql.NullString
		if err := rows.Scan(&from, &to, &filePath, &line, &meta, &content); err != nil {
			return nil, err
		}
		if !content.Valid {
			continue
		}
		var m map[string]any
		_ = json.Unmarshal([]byte(meta), &m)
		spec := ""
		if v, ok := m["specifier"].(string); ok {
			spec = v
		}
		if spec == "" {
			continue
		}
		base := path.Base(spec)
		base = strings.TrimSuffix(base, path.Ext(base))
		if base == "" || base == "." || base == "/" || base == "index" {
			continue
		}
		// Count references beyond the import statement line itself.
		uses := 0
		for _, l := range strings.Split(content.String, "\n") {
			trimmed := strings.TrimSpace(l)
			if strings.Contains(trimmed, "import ") || strings.Contains(trimmed, "require(") || strings.HasPrefix(trimmed, "from ") || strings.HasPrefix(trimmed, "use ") {
				continue
			}
			if strings.Contains(l, base) {
				uses++
			}
		}
		if uses == 0 {
			out = append(out, map[string]any{"file": filePath, "line": line, "imports": spec, "confidence": 0.55, "reason": "imported module name never appears outside import statements"})
		}
	}
	return out, nil
}

func fnv64(s string) uint64 {
	var h uint64 = 1469598103934665603
	for i := 0; i < len(s); i++ {
		h ^= uint64(s[i])
		h *= 1099511628211
	}
	return h
}
