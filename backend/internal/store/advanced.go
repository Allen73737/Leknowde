package store

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/contracts"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/platform"
)

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

// RefreshAPIContracts derives the persisted contract surface from the current
// graph for one branch. Producers come from EXPOSES edges; consumers come from
// CONSUMES edges, including calls whose producer is not in the same repository.
func (s *Store) RefreshAPIContracts(ctx context.Context, repoID, branch, commitSHA string) (int, error) {
	now := platform.Now()
	rows, err := s.DB.QueryContext(ctx, `SELECT e.to_key, e.file_path, e.line,
		COALESCE(n.metadata,'{}'), COALESCE(e.metadata,'{}')
		FROM graph_edges e
		LEFT JOIN graph_nodes n ON n.repository_id = e.repository_id AND n.key = e.to_key
		WHERE e.repository_id = ? AND e.relation = 'EXPOSES'`, repoID)
	if err != nil {
		return 0, err
	}
	producers := []contracts.Contract{}
	for rows.Next() {
		var key, filePath, nodeMeta, edgeMeta string
		var line int
		if err := rows.Scan(&key, &filePath, &line, &nodeMeta, &edgeMeta); err != nil {
			rows.Close()
			return 0, err
		}
		method, apiPath := splitAPIKey(key)
		var nm, em map[string]any
		_ = json.Unmarshal([]byte(nodeMeta), &nm)
		_ = json.Unmarshal([]byte(edgeMeta), &em)
		if v, ok := nm["method"].(string); ok && v != "" {
			method = v
		}
		if v, ok := nm["path"].(string); ok && v != "" {
			apiPath = v
		}
		if apiPath == "" {
			continue
		}
		handler, _ := em["handler"].(string)
		producers = append(producers, contracts.Contract{
			RepositoryID: repoID, Branch: branch, CommitSHA: commitSHA, Direction: contracts.DirectionProducer,
			Method: strings.ToUpper(method), Path: apiPath, NormalizedPath: contracts.NormalizePath(apiPath),
			Operation: contracts.Operation(method, contracts.NormalizePath(apiPath)),
			FilePath:  filePath, Line: line, Handler: handler, Source: "graph",
		})
	}
	rows.Close()

	consumers := []contracts.Contract{}
	crows, err := s.DB.QueryContext(ctx, `SELECT e.to_key, e.file_path, e.line, COALESCE(n.metadata,'{}')
		FROM graph_edges e
		LEFT JOIN graph_nodes n ON n.repository_id = e.repository_id AND n.key = e.to_key
		WHERE e.repository_id = ? AND e.relation = 'CONSUMES'`, repoID)
	if err != nil {
		return 0, err
	}
	for crows.Next() {
		var key, filePath, nodeMeta string
		var line int
		if err := crows.Scan(&key, &filePath, &line, &nodeMeta); err != nil {
			crows.Close()
			return 0, err
		}
		method, apiPath := splitAPIKey(key)
		var nm map[string]any
		_ = json.Unmarshal([]byte(nodeMeta), &nm)
		if v, ok := nm["method"].(string); ok && v != "" {
			method = v
		}
		if v, ok := nm["path"].(string); ok && v != "" {
			apiPath = v
		}
		if apiPath == "" {
			continue
		}
		consumers = append(consumers, contracts.Contract{
			RepositoryID: repoID, Branch: branch, CommitSHA: commitSHA, Direction: contracts.DirectionConsumer,
			Method: strings.ToUpper(method), Path: apiPath, NormalizedPath: contracts.NormalizePath(apiPath),
			Operation: contracts.Operation(method, contracts.NormalizePath(apiPath)),
			FilePath:  filePath, Line: line, Source: "graph",
		})
	}
	crows.Close()

	all := append(producers, consumers...)
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM api_contracts WHERE repository_id = ? AND branch = ?`, repoID, branch); err != nil {
		return 0, err
	}
	seen := map[string]bool{}
	inserted := 0
	for _, c := range all {
		key := c.Direction + "\x00" + c.Operation + "\x00" + c.FilePath
		if seen[key] {
			continue
		}
		seen[key] = true
		if _, err := tx.ExecContext(ctx, `INSERT INTO api_contracts
			(id, repository_id, branch, commit_sha, direction, method, path, normalized_path, operation, file_path, line, handler, source, updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			NewID(), repoID, branch, commitSHA, c.Direction, c.Method, c.Path, c.NormalizedPath, c.Operation,
			c.FilePath, c.Line, c.Handler, c.Source, now); err != nil {
			return 0, err
		}
		inserted++
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return inserted, nil
}

func splitAPIKey(key string) (string, string) {
	rest := strings.TrimPrefix(key, "api:")
	parts := strings.SplitN(rest, ":", 2)
	if len(parts) != 2 {
		return "", rest
	}
	return parts[0], parts[1]
}

// ListAPIContracts returns the stored contracts for one repository and branch.
func (s *Store) ListAPIContracts(ctx context.Context, repoID, branch string) ([]contracts.Contract, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, repository_id, branch, commit_sha, direction, method, path,
		normalized_path, operation, file_path, line, handler, source
		FROM api_contracts WHERE repository_id = ? AND branch = ?
		ORDER BY direction, operation, file_path, line`, repoID, branch)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []contracts.Contract{}
	for rows.Next() {
		var c contracts.Contract
		if err := rows.Scan(&c.ID, &c.RepositoryID, &c.Branch, &c.CommitSHA, &c.Direction, &c.Method, &c.Path,
			&c.NormalizedPath, &c.Operation, &c.FilePath, &c.Line, &c.Handler, &c.Source); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ListAPIContractBranches lists branches that have a stored contract surface.
func (s *Store) ListAPIContractBranches(ctx context.Context, repoID string) ([]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT DISTINCT branch FROM api_contracts WHERE repository_id = ? ORDER BY branch`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Commit file ownership evidence
// ---------------------------------------------------------------------------

type CommitFileInput struct {
	Path      string
	Status    string
	Additions int
	Deletions int
}

// CommitTouch is one commit-file relationship joined with its author.
type CommitTouch struct {
	CommitSHA   string `json:"commit_sha"`
	Path        string `json:"path"`
	Status      string `json:"status"`
	Additions   int    `json:"additions"`
	Deletions   int    `json:"deletions"`
	AuthorName  string `json:"author_name"`
	AuthorEmail string `json:"author_email"`
	CommittedAt string `json:"committed_at"`
}

// ReplaceCommitFiles stores the changed-file list for a commit. Replacing the
// set keeps force-pushed history from accumulating stale paths.
func (s *Store) ReplaceCommitFiles(ctx context.Context, repoID, sha string, files []CommitFileInput) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM commit_files WHERE repository_id = ? AND commit_sha = ?`, repoID, sha); err != nil {
		return err
	}
	now := platform.Now()
	seen := map[string]bool{}
	for _, f := range files {
		if f.Path == "" || seen[f.Path] {
			continue
		}
		seen[f.Path] = true
		if _, err := tx.ExecContext(ctx, `INSERT INTO commit_files
			(id, repository_id, commit_sha, path, status, additions, deletions, created_at)
			VALUES (?,?,?,?,?,?,?,?)`,
			NewID(), repoID, sha, f.Path, f.Status, f.Additions, f.Deletions, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ListCommitTouches returns the joined author/file evidence for a repository.
func (s *Store) ListCommitTouches(ctx context.Context, repoID string, limit int) ([]CommitTouch, error) {
	if limit <= 0 || limit > 5000 {
		limit = 5000
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT cf.commit_sha, cf.path, cf.status, cf.additions, cf.deletions,
		c.author_name, c.author_email, c.committed_at
		FROM commit_files cf
		JOIN commits c ON c.repository_id = cf.repository_id AND c.sha = cf.commit_sha
		WHERE cf.repository_id = ?
		ORDER BY c.committed_at DESC, cf.path ASC LIMIT ?`, repoID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CommitTouch{}
	for rows.Next() {
		var t CommitTouch
		if err := rows.Scan(&t.CommitSHA, &t.Path, &t.Status, &t.Additions, &t.Deletions,
			&t.AuthorName, &t.AuthorEmail, &t.CommittedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// CommitsWithFiles counts commits that have changed-file evidence.
func (s *Store) CommitsWithFiles(ctx context.Context, repoID string) (int, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT COUNT(DISTINCT commit_sha) FROM commit_files WHERE repository_id = ?`, repoID).Scan(&n)
	return n, err
}

// CountCommits returns how many commits are stored for a repository.
func (s *Store) CountCommits(ctx context.Context, repoID string) (int, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM commits WHERE repository_id = ?`, repoID).Scan(&n)
	return n, err
}

// ---------------------------------------------------------------------------
// Architecture snapshots
// ---------------------------------------------------------------------------

type SnapshotPayload struct {
	Files            []string     `json:"files"`
	Modules          []string     `json:"modules"`
	ModuleEdges      []ModuleEdge `json:"module_edges"`
	Cycles           [][]string   `json:"cycles"`
	Producers        []string     `json:"producers"`
	Consumers        []string     `json:"consumers"`
	TopFiles         []FileFanIn  `json:"top_files"`
	Imports          int          `json:"imports"`
	Symbols          int          `json:"symbols"`
	CrossModuleEdges int          `json:"cross_module_edges"`
}

type ArchitectureSnapshot struct {
	ID          string          `json:"id"`
	RepositoryID string         `json:"repository_id"`
	Branch      string          `json:"branch"`
	CommitSHA   string          `json:"commit_sha"`
	Label       string          `json:"label"`
	Nodes       int             `json:"nodes"`
	Edges       int             `json:"edges"`
	Files       int             `json:"files"`
	Modules     int             `json:"modules"`
	Producers   int             `json:"api_producers"`
	Consumers   int             `json:"api_consumers"`
	Cycles      int             `json:"cycles"`
	Payload     SnapshotPayload `json:"payload,omitempty"`
	CreatedAt   string          `json:"created_at"`
}

// CreateArchitectureSnapshot captures a deterministic summary of the current
// graph plus the file list for the indexed branch. It is called at the end of a
// successful index and can be invoked manually from the API.
func (s *Store) CreateArchitectureSnapshot(ctx context.Context, repoID, branch, commitSHA, label string) (ArchitectureSnapshot, error) {
	if strings.TrimSpace(commitSHA) == "" {
		_ = s.DB.QueryRowContext(ctx, `SELECT COALESCE(last_indexed_commit,'') FROM repositories WHERE id = ?`, repoID).Scan(&commitSHA)
	}
	if strings.TrimSpace(commitSHA) == "" {
		commitSHA = "working-tree"
	}
	nodes, edges, err := s.GraphStats(ctx, repoID)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	payload := SnapshotPayload{
		Files: []string{}, Modules: []string{}, ModuleEdges: []ModuleEdge{}, Cycles: [][]string{},
		Producers: []string{}, Consumers: []string{}, TopFiles: []FileFanIn{},
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT path FROM repository_files WHERE repository_id = ? AND branch = ? AND is_binary = 0 ORDER BY path`, repoID, branch)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			return ArchitectureSnapshot{}, err
		}
		payload.Files = append(payload.Files, p)
	}
	rows.Close()

	mrows, err := s.DB.QueryContext(ctx, `SELECT label FROM graph_nodes WHERE repository_id = ? AND kind = 'module' ORDER BY label`, repoID)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	for mrows.Next() {
		var m string
		if err := mrows.Scan(&m); err != nil {
			mrows.Close()
			return ArchitectureSnapshot{}, err
		}
		payload.Modules = append(payload.Modules, m)
	}
	mrows.Close()

	moduleEdges, err := s.ModuleDependencyEdges(ctx, repoID)
	if err == nil {
		sort.Slice(moduleEdges, func(i, j int) bool {
			if moduleEdges[i].From != moduleEdges[j].From {
				return moduleEdges[i].From < moduleEdges[j].From
			}
			return moduleEdges[i].To < moduleEdges[j].To
		})
		payload.ModuleEdges = moduleEdges
		for _, e := range moduleEdges {
			if e.From != e.To {
				payload.CrossModuleEdges++
			}
		}
	}
	cycles, err := s.FindCycles(ctx, repoID)
	if err == nil {
		payload.Cycles = cycles
	}

	prows, err := s.DB.QueryContext(ctx, `SELECT key FROM graph_nodes WHERE repository_id = ? AND kind = 'api'
		AND EXISTS (SELECT 1 FROM graph_edges e WHERE e.repository_id = graph_nodes.repository_id AND e.to_key = graph_nodes.key AND e.relation = 'EXPOSES')
		ORDER BY key`, repoID)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	for prows.Next() {
		var key string
		if err := prows.Scan(&key); err != nil {
			prows.Close()
			return ArchitectureSnapshot{}, err
		}
		method, p := splitAPIKey(key)
		payload.Producers = append(payload.Producers, contracts.Operation(method, contracts.NormalizePath(p)))
	}
	prows.Close()

	crows, err := s.DB.QueryContext(ctx, `SELECT DISTINCT to_key FROM graph_edges WHERE repository_id = ? AND relation = 'CONSUMES' ORDER BY to_key`, repoID)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	for crows.Next() {
		var key string
		if err := crows.Scan(&key); err != nil {
			crows.Close()
			return ArchitectureSnapshot{}, err
		}
		method, p := splitAPIKey(key)
		payload.Consumers = append(payload.Consumers, contracts.Operation(method, contracts.NormalizePath(p)))
	}
	crows.Close()

	topRows, err := s.DB.QueryContext(ctx, `SELECT to_key, COUNT(1) AS c FROM graph_edges
		WHERE repository_id = ? AND relation = 'IMPORTS' GROUP BY to_key ORDER BY c DESC LIMIT 20`, repoID)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	for topRows.Next() {
		var key string
		var count int
		if err := topRows.Scan(&key, &count); err != nil {
			topRows.Close()
			return ArchitectureSnapshot{}, err
		}
		payload.TopFiles = append(payload.TopFiles, FileFanIn{Path: strings.TrimPrefix(key, "file:"), InDegree: count})
	}
	topRows.Close()
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM graph_edges WHERE repository_id = ? AND relation = 'IMPORTS'`, repoID).Scan(&payload.Imports)
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM code_symbols WHERE repository_id = ?`, repoID).Scan(&payload.Symbols)

	raw, err := json.Marshal(payload)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	snap := ArchitectureSnapshot{
		RepositoryID: repoID, Branch: branch, CommitSHA: commitSHA, Label: label,
		Nodes: nodes, Edges: edges, Files: len(payload.Files), Modules: len(payload.Modules),
		Producers: len(payload.Producers), Consumers: len(payload.Consumers), Cycles: len(payload.Cycles),
		Payload: payload, CreatedAt: platform.Now(),
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO architecture_snapshots
		(id, repository_id, branch, commit_sha, label, nodes, edges, files, modules, api_producers, api_consumers, cycles, payload, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT (repository_id, branch, commit_sha) DO UPDATE SET
			label = excluded.label, nodes = excluded.nodes, edges = excluded.edges, files = excluded.files,
			modules = excluded.modules, api_producers = excluded.api_producers, api_consumers = excluded.api_consumers,
			cycles = excluded.cycles, payload = excluded.payload, created_at = excluded.created_at`,
		NewID(), repoID, branch, commitSHA, label, snap.Nodes, snap.Edges, snap.Files, snap.Modules,
		snap.Producers, snap.Consumers, snap.Cycles, string(raw), snap.CreatedAt)
	if err != nil {
		return ArchitectureSnapshot{}, err
	}
	_ = s.DB.QueryRowContext(ctx, `SELECT id FROM architecture_snapshots WHERE repository_id = ? AND branch = ? AND commit_sha = ?`, repoID, branch, commitSHA).Scan(&snap.ID)
	s.pruneSnapshots(ctx, repoID, branch, 40)
	return snap, nil
}

func (s *Store) pruneSnapshots(ctx context.Context, repoID, branch string, keep int) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id FROM architecture_snapshots WHERE repository_id = ? AND branch = ?
		ORDER BY created_at DESC`, repoID, branch)
	if err != nil {
		return
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for i, id := range ids {
		if i < keep {
			continue
		}
		_, _ = s.DB.ExecContext(ctx, `DELETE FROM architecture_snapshots WHERE id = ?`, id)
	}
}

// ListArchitectureSnapshots returns snapshot metadata without the payload.
func (s *Store) ListArchitectureSnapshots(ctx context.Context, repoID, branch string, limit int) ([]ArchitectureSnapshot, error) {
	if limit <= 0 || limit > 100 {
		limit = 40
	}
	q := `SELECT id, repository_id, branch, commit_sha, label, nodes, edges, files, modules,
		api_producers, api_consumers, cycles, created_at FROM architecture_snapshots WHERE repository_id = ?`
	args := []any{repoID}
	if branch != "" {
		q += ` AND branch = ?`
		args = append(args, branch)
	}
	q += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ArchitectureSnapshot{}
	for rows.Next() {
		var snap ArchitectureSnapshot
		if err := rows.Scan(&snap.ID, &snap.RepositoryID, &snap.Branch, &snap.CommitSHA, &snap.Label,
			&snap.Nodes, &snap.Edges, &snap.Files, &snap.Modules, &snap.Producers, &snap.Consumers,
			&snap.Cycles, &snap.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, snap)
	}
	return out, rows.Err()
}

// GetArchitectureSnapshot loads one snapshot including its payload.
func (s *Store) GetArchitectureSnapshot(ctx context.Context, id string) (ArchitectureSnapshot, error) {
	var snap ArchitectureSnapshot
	var raw string
	err := s.DB.QueryRowContext(ctx, `SELECT id, repository_id, branch, commit_sha, label, nodes, edges, files, modules,
		api_producers, api_consumers, cycles, payload, created_at FROM architecture_snapshots WHERE id = ?`, id).
		Scan(&snap.ID, &snap.RepositoryID, &snap.Branch, &snap.CommitSHA, &snap.Label, &snap.Nodes, &snap.Edges,
			&snap.Files, &snap.Modules, &snap.Producers, &snap.Consumers, &snap.Cycles, &raw, &snap.CreatedAt)
	if platform.IsNoRows(err) {
		return snap, ErrNotFound
	}
	if err != nil {
		return snap, err
	}
	_ = json.Unmarshal([]byte(raw), &snap.Payload)
	return snap, nil
}

// ResolveSnapshot accepts an id, a commit SHA, or an empty selector (latest).
func (s *Store) ResolveSnapshot(ctx context.Context, repoID, selector, branch string) (ArchitectureSnapshot, error) {
	if selector != "" {
		if snap, err := s.GetArchitectureSnapshot(ctx, selector); err == nil && snap.RepositoryID == repoID {
			return snap, nil
		}
		q := `SELECT id FROM architecture_snapshots WHERE repository_id = ? AND commit_sha = ?`
		args := []any{repoID, selector}
		if branch != "" {
			q += ` AND branch = ?`
			args = append(args, branch)
		}
		q += ` ORDER BY created_at DESC LIMIT 1`
		var id string
		if err := s.DB.QueryRowContext(ctx, q, args...).Scan(&id); err == nil {
			return s.GetArchitectureSnapshot(ctx, id)
		}
		return ArchitectureSnapshot{}, ErrNotFound
	}
	q := `SELECT id FROM architecture_snapshots WHERE repository_id = ?`
	args := []any{repoID}
	if branch != "" {
		q += ` AND branch = ?`
		args = append(args, branch)
	}
	q += ` ORDER BY created_at DESC LIMIT 1`
	var id string
	if err := s.DB.QueryRowContext(ctx, q, args...).Scan(&id); platform.IsNoRows(err) {
		return ArchitectureSnapshot{}, ErrNotFound
	} else if err != nil {
		return ArchitectureSnapshot{}, err
	}
	return s.GetArchitectureSnapshot(ctx, id)
}

// ResolveRepository finds a repository by id, owner/name or unique name. The
// CLI uses it so a CI job can select a repository without knowing its UUID.
func (s *Store) ResolveRepository(ctx context.Context, selector string) (models.Repository, error) {
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return models.Repository{}, ErrNotFound
	}
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT id FROM repositories
		WHERE deleted_at IS NULL AND (id = ? OR full_name = ? OR owner || '/' || name = ?)
		ORDER BY updated_at DESC LIMIT 1`, selector, selector, selector).Scan(&id)
	if err == nil {
		return s.GetRepository(ctx, id)
	}
	if !platform.IsNoRows(err) {
		return models.Repository{}, err
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT id FROM repositories WHERE deleted_at IS NULL AND name = ? ORDER BY updated_at DESC LIMIT 2`, selector)
	if err != nil {
		return models.Repository{}, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var found string
		if rows.Scan(&found) == nil {
			ids = append(ids, found)
		}
	}
	if len(ids) == 0 {
		return models.Repository{}, ErrNotFound
	}
	if len(ids) > 1 {
		return models.Repository{}, platformError("repository name is ambiguous; use owner/name")
	}
	return s.GetRepository(ctx, ids[0])
}

type platformError string

func (e platformError) Error() string { return string(e) }
