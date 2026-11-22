package store

import (
	"context"
	"encoding/json"

	"github.com/leknowde/platform/backend/internal/platform"
)

// RepositoryAbout is the stored About panel for a repository: a short
// description and up to twenty GitHub-style topics.
type RepositoryAbout struct {
	RepositoryID      string   `json:"repository_id"`
	Description       string   `json:"description"`
	Topics            []string `json:"topics"`
	SourceFingerprint string   `json:"source_fingerprint"`
	UpdatedBy         string   `json:"updated_by"`
	UpdatedAt         string   `json:"updated_at"`
}

// GetRepositoryAbout returns the stored About metadata, or ErrNotFound when the
// repository has never had one saved.
func (s *Store) GetRepositoryAbout(ctx context.Context, repoID string) (RepositoryAbout, error) {
	var about RepositoryAbout
	var topics string
	err := s.DB.QueryRowContext(ctx, `SELECT repository_id, description, topics, source_fingerprint, updated_by, updated_at
		FROM repository_about WHERE repository_id = ?`, repoID).
		Scan(&about.RepositoryID, &about.Description, &topics, &about.SourceFingerprint, &about.UpdatedBy, &about.UpdatedAt)
	if platform.IsNoRows(err) {
		return about, ErrNotFound
	}
	if err != nil {
		return about, err
	}
	about.Topics = []string{}
	_ = json.Unmarshal([]byte(topics), &about.Topics)
	return about, nil
}

// UpsertRepositoryAbout writes the About panel, replacing any previous copy.
func (s *Store) UpsertRepositoryAbout(ctx context.Context, about RepositoryAbout) error {
	topics, err := json.Marshal(about.Topics)
	if err != nil {
		return err
	}
	now := platform.Now()
	_, err = s.DB.ExecContext(ctx, `INSERT INTO repository_about (repository_id, description, topics, source_fingerprint, updated_by, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?)
		ON CONFLICT (repository_id) DO UPDATE SET description = excluded.description, topics = excluded.topics,
			source_fingerprint = excluded.source_fingerprint, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
		about.RepositoryID, about.Description, string(topics), about.SourceFingerprint, about.UpdatedBy, now, now)
	return err
}
