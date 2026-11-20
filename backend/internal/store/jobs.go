package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/platform"
)

const jobSelect = `SELECT id, repository_id, branch, kind, status, progress, current_step, files_total, files_processed,
	symbols_found, error, logs, attempts, COALESCE(started_at,''), COALESCE(completed_at,''), created_at FROM indexing_jobs`

func scanJob(row interface{ Scan(dest ...any) error }) (models.Job, error) {
	var j models.Job
	var logs string
	err := row.Scan(&j.ID, &j.RepositoryID, &j.Branch, &j.Kind, &j.Status, &j.Progress, &j.CurrentStep,
		&j.FilesTotal, &j.FilesProcessed, &j.SymbolsFound, &j.Error, &logs, &j.Attempts, &j.StartedAt, &j.CompletedAt, &j.CreatedAt)
	if platform.IsNoRows(err) {
		return j, ErrNotFound
	}
	j.Logs = []string{}
	_ = json.Unmarshal([]byte(logs), &j.Logs)
	return j, err
}

func (s *Store) CreateJob(ctx context.Context, repoID, branch, kind string) (models.Job, error) {
	var active int
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM indexing_jobs WHERE repository_id = ? AND branch = ? AND status IN ('queued','running')`,
		repoID, branch).Scan(&active); err != nil {
		return models.Job{}, err
	}
	if active > 0 {
		row := s.DB.QueryRowContext(ctx, jobSelect+` WHERE repository_id = ? AND branch = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`, repoID, branch)
		return scanJob(row)
	}
	now := platform.Now()
	id := NewID()
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO indexing_jobs (id, repository_id, branch, kind, status, current_step, logs, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?)`, id, repoID, branch, kind, "queued", "Waiting for a worker", "[]", now, now); err != nil {
		return models.Job{}, err
	}
	row := s.DB.QueryRowContext(ctx, jobSelect+` WHERE id = ?`, id)
	return scanJob(row)
}

func (s *Store) GetJob(ctx context.Context, id string) (models.Job, error) {
	return scanJob(s.DB.QueryRowContext(ctx, jobSelect+` WHERE id = ?`, id))
}

func (s *Store) ListJobs(ctx context.Context, repoID string, limit int) ([]models.Job, error) {
	rows, err := s.DB.QueryContext(ctx, jobSelect+` WHERE repository_id = ? ORDER BY created_at DESC LIMIT ?`, repoID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Job{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

// ClaimJob atomically leases the oldest queued job for this worker.
func (s *Store) ClaimJob(ctx context.Context, workerID string) (*models.Job, error) {
	lease := time.Now().UTC().Add(15 * time.Minute).Format(time.RFC3339)
	// Requeue jobs whose lease expired so a crashed worker cannot wedge the queue.
	_, _ = s.DB.ExecContext(ctx, `UPDATE indexing_jobs SET status = 'queued', locked_by = NULL, locked_until = NULL
		WHERE status = 'running' AND locked_until < ?`, platform.Now())

	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT id FROM indexing_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`).Scan(&id)
	if platform.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE indexing_jobs SET status = 'running', locked_by = ?, locked_until = ?, started_at = ?, attempts = attempts + 1, updated_at = ?
		WHERE id = ? AND status = 'queued'`, workerID, lease, platform.Now(), platform.Now(), id)
	if err != nil {
		return nil, err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return nil, nil
	}
	job, err := s.GetJob(ctx, id)
	if err != nil {
		return nil, err
	}
	// Heartbeat the lease while the worker holds the job.
	go func(jobID string) {
		ticker := time.NewTicker(2 * time.Minute)
		defer ticker.Stop()
		ctxBg := context.Background()
		for range ticker.C {
			var status string
			if err := s.DB.QueryRowContext(ctxBg, `SELECT status FROM indexing_jobs WHERE id = ?`, jobID).Scan(&status); err != nil || status != "running" {
				return
			}
			_, _ = s.DB.ExecContext(ctxBg, `UPDATE indexing_jobs SET locked_until = ? WHERE id = ?`,
				time.Now().UTC().Add(15*time.Minute).Format(time.RFC3339), jobID)
		}
	}(id)
	return &job, nil
}

func (s *Store) UpdateJobProgress(ctx context.Context, id, step string, progress, processed, total, symbols int) {
	_, _ = s.DB.ExecContext(ctx, `UPDATE indexing_jobs SET current_step = ?, progress = ?, files_processed = ?, files_total = ?, symbols_found = ?, updated_at = ? WHERE id = ?`,
		step, progress, processed, total, symbols, platform.Now(), id)
}

func (s *Store) AppendJobLog(ctx context.Context, id, line string) {
	var raw string
	if err := s.DB.QueryRowContext(ctx, `SELECT logs FROM indexing_jobs WHERE id = ?`, id).Scan(&raw); err != nil {
		return
	}
	var logs []string
	_ = json.Unmarshal([]byte(raw), &logs)
	logs = append(logs, time.Now().UTC().Format("15:04:05")+"  "+line)
	if len(logs) > 200 {
		logs = logs[len(logs)-200:]
	}
	encoded, _ := json.Marshal(logs)
	_, _ = s.DB.ExecContext(ctx, `UPDATE indexing_jobs SET logs = ? WHERE id = ?`, string(encoded), id)
}

func (s *Store) FinishJob(ctx context.Context, id, status, errMsg string) {
	now := platform.Now()
	progress := 100
	if status != "completed" {
		progress = 0
	}
	_, _ = s.DB.ExecContext(ctx, `UPDATE indexing_jobs SET status = ?, error = ?, completed_at = ?, updated_at = ?, progress = CASE WHEN ? = 'completed' THEN 100 ELSE progress END,
		locked_by = NULL, locked_until = NULL WHERE id = ?`, status, errMsg, now, now, status, id)
	_ = progress
}

// ---------------------------------------------------------------------------
// Conversations & messages
// ---------------------------------------------------------------------------

func (s *Store) CreateConversation(ctx context.Context, userID, workspaceID, repoID, title string) (models.Conversation, error) {
	now := platform.Now()
	id := NewID()
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO conversations (id, workspace_id, repository_id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
		id, workspaceID, repoID, userID, title, now, now); err != nil {
		return models.Conversation{}, err
	}
	return models.Conversation{ID: id, RepositoryID: repoID, Title: title, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *Store) GetConversation(ctx context.Context, id, userID string) (models.Conversation, error) {
	var c models.Conversation
	err := s.DB.QueryRowContext(ctx, `SELECT id, repository_id, title, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?`, id, userID).
		Scan(&c.ID, &c.RepositoryID, &c.Title, &c.CreatedAt, &c.UpdatedAt)
	if platform.IsNoRows(err) {
		return c, ErrNotFound
	}
	return c, err
}

func (s *Store) ListConversations(ctx context.Context, repoID, userID string, limit int) ([]models.Conversation, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, repository_id, title, created_at, updated_at FROM conversations
		WHERE repository_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT ?`, repoID, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Conversation{}
	for rows.Next() {
		var c models.Conversation
		if err := rows.Scan(&c.ID, &c.RepositoryID, &c.Title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) AddMessage(ctx context.Context, m models.Message, conversationID string) (models.Message, error) {
	if m.ID == "" {
		m.ID = NewID()
	}
	m.CreatedAt = platform.Now()
	evidence, _ := json.Marshal(m.Evidence)
	if m.Evidence == nil {
		evidence = []byte("[]")
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO messages (id, conversation_id, role, content, evidence, uncertainty, model, tokens_in, tokens_out, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?)`, m.ID, conversationID, m.Role, m.Content, string(evidence), m.Uncertainty, m.Model, m.TokensIn, m.TokensOut, m.CreatedAt); err != nil {
		return m, err
	}
	_, _ = s.DB.ExecContext(ctx, `UPDATE conversations SET updated_at = ? WHERE id = ?`, m.CreatedAt, conversationID)
	return m, nil
}

func (s *Store) ListMessages(ctx context.Context, conversationID string, limit int) ([]models.Message, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, role, content, evidence, uncertainty, model, tokens_in, tokens_out, created_at
		FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Message{}
	for rows.Next() {
		var m models.Message
		var evidence string
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &evidence, &m.Uncertainty, &m.Model, &m.TokensIn, &m.TokensOut, &m.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(evidence), &m.Evidence)
		if m.Evidence == nil {
			m.Evidence = []models.Evidence{}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) TouchConversationTitle(ctx context.Context, id, title string) {
	var count int
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM messages WHERE conversation_id = ?`, id).Scan(&count)
	if count <= 1 {
		_, _ = s.DB.ExecContext(ctx, `UPDATE conversations SET title = ? WHERE id = ?`, title, id)
	}
}

// ---------------------------------------------------------------------------
// Findings, documents, impact reports
// ---------------------------------------------------------------------------

func (s *Store) ReplaceFindings(ctx context.Context, repoID string, findings []models.Finding) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM analysis_findings WHERE repository_id = ?`, repoID); err != nil {
		return err
	}
	for _, f := range findings {
		if f.ID == "" {
			f.ID = NewID()
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO analysis_findings (id, repository_id, kind, severity, title, description, file_path, start_line, end_line, evidence, created_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)`, f.ID, repoID, f.Kind, f.Severity, f.Title, f.Description, f.FilePath, f.StartLine, f.EndLine, f.Evidence, platform.Now()); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ListFindings(ctx context.Context, repoID, severity string) ([]models.Finding, error) {
	q := `SELECT id, kind, severity, title, description, file_path, start_line, end_line, status, evidence FROM analysis_findings WHERE repository_id = ?`
	args := []any{repoID}
	if severity != "" {
		q += ` AND severity = ?`
		args = append(args, severity)
	}
	q += ` ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, file_path ASC`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Finding{}
	for rows.Next() {
		var f models.Finding
		if err := rows.Scan(&f.ID, &f.Kind, &f.Severity, &f.Title, &f.Description, &f.FilePath, &f.StartLine, &f.EndLine, &f.Status, &f.Evidence); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) UpsertDocument(ctx context.Context, doc models.Document) (models.Document, error) {
	now := platform.Now()
	if doc.ID == "" {
		doc.ID = NewID()
		doc.CreatedAt = now
	}
	doc.UpdatedAt = now
	_, err := s.DB.ExecContext(ctx, `INSERT INTO generated_documents (id, repository_id, kind, title, path, content, status, drift, source_fingerprint, created_by, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT (id) DO UPDATE SET title = excluded.title, path = excluded.path, content = excluded.content,
			status = excluded.status, drift = excluded.drift, source_fingerprint = excluded.source_fingerprint, updated_at = excluded.updated_at`,
		doc.ID, doc.RepositoryID, doc.Kind, doc.Title, doc.Path, doc.Content, doc.Status, doc.Drift, doc.SourceFingerprint, doc.CreatedBy, doc.CreatedAt, doc.UpdatedAt)
	if err != nil {
		return doc, err
	}
	return doc, nil
}

func (s *Store) ListDocuments(ctx context.Context, repoID string) ([]models.Document, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, repository_id, kind, title, path, status, drift, source_fingerprint, updated_at, created_at
		FROM generated_documents WHERE repository_id = ? ORDER BY kind ASC`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Document{}
	for rows.Next() {
		var d models.Document
		if err := rows.Scan(&d.ID, &d.RepositoryID, &d.Kind, &d.Title, &d.Path, &d.Status, &d.Drift, &d.SourceFingerprint, &d.UpdatedAt, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) GetDocument(ctx context.Context, id string) (models.Document, error) {
	var d models.Document
	err := s.DB.QueryRowContext(ctx, `SELECT id, repository_id, kind, title, path, content, status, drift, source_fingerprint, updated_at, created_at
		FROM generated_documents WHERE id = ?`, id).
		Scan(&d.ID, &d.RepositoryID, &d.Kind, &d.Title, &d.Path, &d.Content, &d.Status, &d.Drift, &d.SourceFingerprint, &d.UpdatedAt, &d.CreatedAt)
	if platform.IsNoRows(err) {
		return d, ErrNotFound
	}
	return d, err
}

func (s *Store) UpdateDocumentContent(ctx context.Context, id, content, status string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE generated_documents SET content = ?, status = ?, updated_at = ? WHERE id = ?`, content, status, platform.Now(), id)
	return err
}

func (s *Store) DeleteDocument(ctx context.Context, id string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM generated_documents WHERE id = ?`, id)
	return err
}

func (s *Store) CreateImpactReport(ctx context.Context, r models.ImpactReport) (models.ImpactReport, error) {
	if r.ID == "" {
		r.ID = NewID()
	}
	r.CreatedAt = platform.Now()
	_, err := s.DB.ExecContext(ctx, `INSERT INTO impact_reports (id, repository_id, user_id, title, request, summary, risk_level, risk_rationale, payload, confidence, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`, r.ID, r.RepositoryID, r.UserID, r.Title, r.Request, r.Summary, r.RiskLevel, r.RiskRationale, r.Payload, r.Confidence, r.CreatedAt)
	return r, err
}

func (s *Store) ListImpactReports(ctx context.Context, repoID string, limit int) ([]models.ImpactReport, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, repository_id, title, request, summary, risk_level, risk_rationale, confidence, created_at
		FROM impact_reports WHERE repository_id = ? ORDER BY created_at DESC LIMIT ?`, repoID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.ImpactReport{}
	for rows.Next() {
		var r models.ImpactReport
		if err := rows.Scan(&r.ID, &r.RepositoryID, &r.Title, &r.Request, &r.Summary, &r.RiskLevel, &r.RiskRationale, &r.Confidence, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) GetImpactReport(ctx context.Context, id string) (models.ImpactReport, error) {
	var r models.ImpactReport
	err := s.DB.QueryRowContext(ctx, `SELECT id, repository_id, title, request, summary, risk_level, risk_rationale, payload, confidence, created_at
		FROM impact_reports WHERE id = ?`, id).
		Scan(&r.ID, &r.RepositoryID, &r.Title, &r.Request, &r.Summary, &r.RiskLevel, &r.RiskRationale, &r.Payload, &r.Confidence, &r.CreatedAt)
	if platform.IsNoRows(err) {
		return r, ErrNotFound
	}
	return r, err
}

// ScanNull is a helper for optional text columns in aggregate queries.
func ScanNull(s sql.NullString) string { return platform.NullString(s) }
