package store

import (
	"context"
	"path"
	"strings"

	"github.com/leknowde/platform/backend/internal/platform"
)

func (s *Store) WorkspaceOrgID(ctx context.Context, workspaceID string) (string, error) {
	var orgID string
	err := s.DB.QueryRowContext(ctx, `SELECT organization_id FROM workspaces WHERE id = ?`, workspaceID).Scan(&orgID)
	if platform.IsNoRows(err) {
		return "", ErrNotFound
	}
	return orgID, err
}

func (s *Store) WorkspaceOwner(ctx context.Context, workspaceID string) (string, error) {
	var userID string
	err := s.DB.QueryRowContext(ctx, `SELECT user_id FROM workspace_members WHERE workspace_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1`, workspaceID).Scan(&userID)
	if platform.IsNoRows(err) {
		return "", ErrNotFound
	}
	return userID, err
}

// DeleteFile removes a file and everything derived from it.
func (s *Store) DeleteFile(ctx context.Context, repoID, branch, filePath string) error {
	var fileID string
	if err := s.DB.QueryRowContext(ctx, `SELECT id FROM repository_files WHERE repository_id = ? AND branch = ? AND path = ?`, repoID, branch, filePath).Scan(&fileID); err != nil {
		if platform.IsNoRows(err) {
			return nil
		}
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`DELETE FROM code_symbols WHERE file_id = ?`,
		`DELETE FROM embeddings WHERE repository_id = ? AND source_id = ?`,
		`DELETE FROM repository_files WHERE id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, stmt, fileID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM graph_edges WHERE repository_id = ? AND file_path = ?`, repoID, filePath); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM graph_nodes WHERE repository_id = ? AND file_path = ?`, repoID, filePath); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ClearGraph(ctx context.Context, repoID string) error {
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM graph_edges WHERE repository_id = ?`, repoID); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, `DELETE FROM graph_nodes WHERE repository_id = ?`, repoID)
	return err
}

func (s *Store) SetRepositoryParser(ctx context.Context, repoID, parser string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE repositories SET parser_mode = ? WHERE id = ?`, parser, repoID)
	return err
}

type ModuleEdge struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Count int    `json:"count"`
}

// ModuleDependencyEdges aggregates file imports into module-level dependencies.
func (s *Store) ModuleDependencyEdges(ctx context.Context, repoID string) ([]ModuleEdge, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT from_key, to_key FROM graph_edges WHERE repository_id = ? AND relation = 'IMPORTS'`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := map[string]int{}
	for rows.Next() {
		var from, to string
		if err := rows.Scan(&from, &to); err != nil {
			return nil, err
		}
		fromPath := strings.TrimPrefix(from, "file:")
		toPath := strings.TrimPrefix(to, "file:")
		fromMod := moduleOfPath(fromPath)
		toMod := moduleOfPath(toPath)
		if fromMod == "" || toMod == "" {
			continue
		}
		counts[fromMod+"\x00"+toMod]++
	}
	out := make([]ModuleEdge, 0, len(counts))
	for key, count := range counts {
		parts := strings.SplitN(key, "\x00", 2)
		out = append(out, ModuleEdge{From: parts[0], To: parts[1], Count: count})
	}
	return out, nil
}

func moduleOfPath(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	dir := path.Dir(p)
	if dir == "." {
		return "root"
	}
	parts := strings.Split(dir, "/")
	if len(parts) >= 2 && (parts[0] == "src" || parts[0] == "app" || parts[0] == "server" || parts[0] == "web" || parts[0] == "packages" || parts[0] == "internal") {
		return strings.Join(parts[:2], "/")
	}
	return parts[0]
}

// ObjectsAffectedByPaths suggests tests that exercise a set of changed files.
func (s *Store) TestsForPaths(ctx context.Context, repoID string, paths []string) ([]string, error) {
	if len(paths) == 0 {
		return []string{}, nil
	}
	args := []any{repoID}
	placeholders := make([]string, 0, len(paths))
	for _, p := range paths {
		placeholders = append(placeholders, "?")
		args = append(args, "file:"+p)
	}
	q := `SELECT DISTINCT from_key FROM graph_edges WHERE repository_id = ? AND relation = 'TESTS' AND to_key IN (` + strings.Join(placeholders, ",") + `)`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		out = append(out, strings.TrimPrefix(key, "test:"))
	}
	return out, rows.Err()
}

// FileEdges returns the relationship set for one file.
func (s *Store) FileEdges(ctx context.Context, repoID, path string) ([]map[string]any, error) {
	fileKey := "file:" + path
	rows, err := s.DB.QueryContext(ctx, `SELECT e.from_key, e.to_key, e.relation, e.line, e.confidence,
		(SELECT label FROM graph_nodes n WHERE n.repository_id = e.repository_id AND n.key = e.to_key),
		(SELECT label FROM graph_nodes n WHERE n.repository_id = e.repository_id AND n.key = e.from_key)
		FROM graph_edges e WHERE e.repository_id = ? AND (e.from_key = ? OR e.to_key = ?) LIMIT 400`,
		repoID, fileKey, fileKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var from, to, rel string
		var line int
		var confidence float64
		var toLabel, fromLabel *string
		if err := rows.Scan(&from, &to, &rel, &line, &confidence, &toLabel, &fromLabel); err != nil {
			return nil, err
		}
		direction := "outgoing"
		counterpart := to
		counterpartLabel := ""
		if toLabel != nil {
			counterpartLabel = *toLabel
		}
		if to == fileKey {
			direction = "incoming"
			counterpart = from
			counterpartLabel = ""
			if fromLabel != nil {
				counterpartLabel = *fromLabel
			}
		}
		out = append(out, map[string]any{
			"from": from, "to": to, "relation": rel, "line": line, "confidence": confidence,
			"direction": direction, "counterpart": counterpart, "counterpart_label": counterpartLabel,
			"is_file": strings.HasPrefix(counterpart, "file:"),
		})
	}
	return out, rows.Err()
}

type DependencyCount struct {
	Relation string `json:"relation"`
	Count    int    `json:"count"`
}

type FileFanIn struct {
	Path     string `json:"path"`
	InDegree int    `json:"in_degree"`
}

type DependencySummaryResult struct {
	Relations []DependencyCount `json:"relations"`
	TopFiles  []FileFanIn       `json:"top_files"`
	Total     int               `json:"total"`
}

// DependencySummary aggregates graph edge volume by relation and ranks files by
// inbound dependency count.
func (s *Store) DependencySummary(ctx context.Context, repoID string) (DependencySummaryResult, error) {
	out := DependencySummaryResult{Relations: []DependencyCount{}, TopFiles: []FileFanIn{}}
	rows, err := s.DB.QueryContext(ctx, `SELECT relation, COUNT(1) FROM graph_edges WHERE repository_id = ? GROUP BY relation ORDER BY COUNT(1) DESC`, repoID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var dc DependencyCount
		if err := rows.Scan(&dc.Relation, &dc.Count); err != nil {
			rows.Close()
			return out, err
		}
		out.Total += dc.Count
		out.Relations = append(out.Relations, dc)
	}
	rows.Close()
	fileRows, err := s.DB.QueryContext(ctx, `SELECT to_key, COUNT(1) AS c FROM graph_edges
		WHERE repository_id = ? AND relation = 'IMPORTS' GROUP BY to_key ORDER BY c DESC LIMIT 25`, repoID)
	if err != nil {
		return out, err
	}
	defer fileRows.Close()
	for fileRows.Next() {
		var key string
		var count int
		if err := fileRows.Scan(&key, &count); err != nil {
			return out, err
		}
		out.TopFiles = append(out.TopFiles, FileFanIn{Path: strings.TrimPrefix(key, "file:"), InDegree: count})
	}
	return out, fileRows.Err()
}

// GraphNodeByKey fetches a single graph node.
func (s *Store) GraphNodeByKey(ctx context.Context, repoID, key string) (map[string]any, error) {
	var id, kind, nodeKey, label, filePath, meta string
	err := s.DB.QueryRowContext(ctx, `SELECT id, kind, key, label, file_path, metadata FROM graph_nodes WHERE repository_id = ? AND key = ?`, repoID, key).
		Scan(&id, &kind, &nodeKey, &label, &filePath, &meta)
	if platform.IsNoRows(err) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "kind": kind, "key": nodeKey, "label": label, "file_path": filePath, "metadata": meta}, nil
}
