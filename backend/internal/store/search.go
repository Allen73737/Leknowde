package store

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/platform"
)

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

func (s *Store) UpsertEmbedding(ctx context.Context, repoID, sourceKind, sourceID, filePath string, chunkIndex int, content string, vector []float64, model string) error {
	raw, err := json.Marshal(vector)
	if err != nil {
		return err
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO embeddings (id, repository_id, source_kind, source_id, file_path, chunk_index, content, vector, model, dim, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT (repository_id, source_kind, source_id, chunk_index) DO UPDATE SET content = excluded.content, vector = excluded.vector, model = excluded.model, dim = excluded.dim`,
		NewID(), repoID, sourceKind, sourceID, filePath, chunkIndex, content, string(raw), model, len(vector), platform.Now())
	return err
}

func (s *Store) DeleteEmbeddingsForSource(ctx context.Context, repoID, sourceKind, sourceID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM embeddings WHERE repository_id = ? AND source_kind = ? AND source_id = ?`, repoID, sourceKind, sourceID)
	return err
}

func (s *Store) ListEmbeddings(ctx context.Context, repoID string) ([]models.Embedding, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, file_path, content, vector, source_kind FROM embeddings WHERE repository_id = ?`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Embedding{}
	for rows.Next() {
		var e models.Embedding
		var vec string
		if err := rows.Scan(&e.ID, &e.FilePath, &e.Content, &vec, &e.Kind); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(vec), &e.Vector)
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) CountEmbeddings(ctx context.Context, repoID string) (int, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM embeddings WHERE repository_id = ?`, repoID).Scan(&n)
	return n, err
}

// CandidateChunks narrows the vector search space using keyword matching before
// scoring in memory, which keeps retrieval bounded on large repositories.
func (s *Store) CandidateChunks(ctx context.Context, repoID string, terms []string, limit int) ([]models.Embedding, error) {
	conditions := make([]string, 0, len(terms))
	args := []any{repoID}
	for _, t := range terms {
		conditions = append(conditions, "LOWER(content) LIKE ?")
		args = append(args, "%"+strings.ToLower(t)+"%")
	}
	q := `SELECT id, file_path, content, vector, source_kind FROM embeddings WHERE repository_id = ?`
	if len(conditions) > 0 {
		q += " AND (" + strings.Join(conditions, " OR ") + ")"
	}
	q += " LIMIT ?"
	args = append(args, limit)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Embedding{}
	for rows.Next() {
		var e models.Embedding
		var vec string
		if err := rows.Scan(&e.ID, &e.FilePath, &e.Content, &vec, &e.Kind); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(vec), &e.Vector)
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Lexical search fallback (no embeddings / no AI provider required)
// ---------------------------------------------------------------------------

type FileHit struct {
	Path      string `json:"path"`
	Language  string `json:"language"`
	LineCount int    `json:"line_count"`
	Matches   int    `json:"matches"`
	Preview   string `json:"preview"`
	Line      int    `json:"line"`
}

func (s *Store) SearchFiles(ctx context.Context, repoID, branch, query string, limit int) ([]FileHit, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return []FileHit{}, nil
	}
	like := "%" + strings.ToLower(q) + "%"
	rows, err := s.DB.QueryContext(ctx, `SELECT path, language, line_count, content FROM repository_files
		WHERE repository_id = ? AND branch = ? AND is_binary = 0 AND LOWER(content) LIKE ? LIMIT 100`, repoID, branch, like)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FileHit{}
	for rows.Next() {
		var f FileHit
		var content string
		if err := rows.Scan(&f.Path, &f.Language, &f.LineCount, &content); err != nil {
			return nil, err
		}
		firstLine := 1
		preview := ""
		for i, line := range strings.Split(content, "\n") {
			if strings.Contains(strings.ToLower(line), strings.ToLower(q)) {
				f.Matches++
				if preview == "" {
					firstLine = i + 1
					preview = strings.TrimSpace(line)
				}
			}
		}
		f.Line = firstLine
		if len(preview) > 220 {
			preview = preview[:220]
		}
		f.Preview = preview
		out = append(out, f)
	}
	return out, rows.Err()
}

// SearchSymbols ranks declarations whose name or qualified name matches any
// query token.
func (s *Store) SearchSymbols(ctx context.Context, repoID string, terms []string, limit int) ([]models.Symbol, error) {
	if len(terms) == 0 {
		return []models.Symbol{}, nil
	}
	conditions := make([]string, 0, len(terms))
	args := []any{repoID}
	for _, t := range terms {
		conditions = append(conditions, "(LOWER(c.name) LIKE ? OR LOWER(c.qualified_name) LIKE ?)")
		like := "%" + strings.ToLower(t) + "%"
		args = append(args, like, like)
	}
	q := `SELECT c.id, c.file_id, f.path, c.kind, c.name, c.qualified_name, c.signature, c.start_line, c.end_line,
		c.exported, c.doc_comment, COALESCE(c.parent_symbol_id,'')
		FROM code_symbols c JOIN repository_files f ON f.id = c.file_id
		WHERE c.repository_id = ? AND (` + strings.Join(conditions, " OR ") + `)
		ORDER BY CASE c.kind WHEN 'function' THEN 0 WHEN 'class' THEN 1 WHEN 'component' THEN 2 ELSE 3 END, c.name ASC LIMIT ?`
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

// Stats collects repository counters used by dashboards and health reports.
type RepoStats struct {
	Files        int            `json:"files"`
	Symbols      int            `json:"symbols"`
	Functions    int            `json:"functions"`
	Classes      int            `json:"classes"`
	Components   int            `json:"components"`
	APIs         int            `json:"apis"`
	Tests        int            `json:"tests"`
	Lines        int            `json:"lines"`
	Edges        int            `json:"edges"`
	Nodes        int            `json:"nodes"`
	Chunks       int            `json:"chunks"`
	Languages    map[string]int `json:"languages"`
	TopFiles     []FileHit      `json:"top_files"`
	DiskBytes    int64          `json:"disk_bytes"`
	Findings     int            `json:"findings"`
	Critical     int            `json:"critical_findings"`
}

func (s *Store) RepoStats(ctx context.Context, repoID, branch string) (RepoStats, error) {
	st := RepoStats{Languages: map[string]int{}, TopFiles: []FileHit{}}
	err := s.DB.QueryRowContext(ctx, `SELECT COUNT(1), COALESCE(SUM(line_count),0), COALESCE(SUM(size),0) FROM repository_files
		WHERE repository_id = ? AND branch = ? AND is_binary = 0`, repoID, branch).Scan(&st.Files, &st.Lines, &st.DiskBytes)
	if err != nil {
		return st, err
	}
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM code_symbols WHERE repository_id = ?`, repoID).Scan(&st.Symbols)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM code_symbols WHERE repository_id = ? AND kind = 'function'`, repoID).Scan(&st.Functions)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM code_symbols WHERE repository_id = ? AND kind = 'class'`, repoID).Scan(&st.Classes)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM code_symbols WHERE repository_id = ? AND kind = 'component'`, repoID).Scan(&st.Components)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM graph_nodes WHERE repository_id = ? AND kind = 'api'`, repoID).Scan(&st.APIs)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM repository_files WHERE repository_id = ? AND branch = ? AND (path LIKE ? OR path LIKE ? OR path LIKE ?)`,
		repoID, branch, "%test%", "%spec%", "%__tests__%").Scan(&st.Tests)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM graph_edges WHERE repository_id = ?`, repoID).Scan(&st.Edges)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM graph_nodes WHERE repository_id = ?`, repoID).Scan(&st.Nodes)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM embeddings WHERE repository_id = ?`, repoID).Scan(&st.Chunks)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM analysis_findings WHERE repository_id = ?`, repoID).Scan(&st.Findings)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM analysis_findings WHERE repository_id = ? AND severity IN ('critical','high')`, repoID).Scan(&st.Critical)

	langRows, err := s.DB.QueryContext(ctx, `SELECT language, COUNT(1) FROM repository_files
		WHERE repository_id = ? AND branch = ? AND is_binary = 0 AND language <> '' GROUP BY language ORDER BY COUNT(1) DESC`, repoID, branch)
	if err == nil {
		defer langRows.Close()
		for langRows.Next() {
			var lang string
			var count int
			if err := langRows.Scan(&lang, &count); err == nil {
				st.Languages[lang] = count
			}
		}
	}
	bigRows, err := s.DB.QueryContext(ctx, `SELECT path, language, line_count FROM repository_files
		WHERE repository_id = ? AND branch = ? AND is_binary = 0 ORDER BY line_count DESC LIMIT 6`, repoID, branch)
	if err == nil {
		defer bigRows.Close()
		for bigRows.Next() {
			var f FileHit
			if err := bigRows.Scan(&f.Path, &f.Language, &f.LineCount); err == nil {
				st.TopFiles = append(st.TopFiles, f)
			}
		}
	}
	return st, nil
}

// DashboardStats aggregates cross-workspace metrics for the main dashboard.
type DashboardStats struct {
	Workspaces   int `json:"workspaces"`
	Repositories int `json:"repositories"`
	Ready        int `json:"ready_repositories"`
	Files        int `json:"files"`
	Symbols      int `json:"symbols"`
	Findings     int `json:"findings"`
	Critical     int `json:"critical_findings"`
	IndexingJobs int `json:"active_jobs"`
	Conversations int `json:"conversations"`
	ImpactReports int `json:"impact_reports"`
}

func (s *Store) DashboardStats(ctx context.Context, userID string) (DashboardStats, error) {
	var st DashboardStats
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM workspace_members WHERE user_id = ?`, userID).Scan(&st.Workspaces)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM repositories r JOIN workspace_members m ON m.workspace_id = r.workspace_id
		WHERE m.user_id = ? AND r.deleted_at IS NULL`, userID).Scan(&st.Repositories)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM repositories r JOIN workspace_members m ON m.workspace_id = r.workspace_id
		WHERE m.user_id = ? AND r.status = 'ready' AND r.deleted_at IS NULL`, userID).Scan(&st.Ready)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM repository_files f JOIN repositories r ON r.id = f.repository_id
		JOIN workspace_members m ON m.workspace_id = r.workspace_id WHERE m.user_id = ? AND f.is_binary = 0`, userID).Scan(&st.Files)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM code_symbols c JOIN repositories r ON r.id = c.repository_id
		JOIN workspace_members m ON m.workspace_id = r.workspace_id WHERE m.user_id = ?`, userID).Scan(&st.Symbols)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM analysis_findings a JOIN repositories r ON r.id = a.repository_id
		JOIN workspace_members m ON m.workspace_id = r.workspace_id WHERE m.user_id = ?`, userID).Scan(&st.Findings)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM analysis_findings a JOIN repositories r ON r.id = a.repository_id
		JOIN workspace_members m ON m.workspace_id = r.workspace_id WHERE m.user_id = ? AND a.severity IN ('critical','high')`, userID).Scan(&st.Critical)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM indexing_jobs j JOIN repositories r ON r.id = j.repository_id
		JOIN workspace_members m ON m.workspace_id = r.workspace_id WHERE m.user_id = ? AND j.status IN ('queued','running')`, userID).Scan(&st.IndexingJobs)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM conversations WHERE user_id = ?`, userID).Scan(&st.Conversations)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM impact_reports i JOIN repositories r ON r.id = i.repository_id
		JOIN workspace_members m ON m.workspace_id = r.workspace_id WHERE m.user_id = ?`, userID).Scan(&st.ImpactReports)
	return st, nil
}
