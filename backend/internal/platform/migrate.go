package platform

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/migrations"
)

// Migrate applies every embedded migration exactly once.
func Migrate(ctx context.Context, db *DB) error {
	entries, err := migrations.FS.ReadDir(".")
	if err != nil {
		return err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	for _, name := range names {
		var exists int
		err := db.QueryRowContext(ctx, `SELECT COUNT(1) FROM schema_migrations WHERE version = ?`, name).Scan(&exists)
		if err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		raw, err := migrations.FS.ReadFile(name)
		if err != nil {
			return err
		}
		for _, stmt := range splitStatements(string(raw)) {
			if _, err := db.ExecContext(ctx, stmt); err != nil {
				// SQLite cannot add a column twice; treat those as already applied.
				if strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
					continue
				}
				return fmt.Errorf("migration %s failed: %w", name, err)
			}
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, name, Now()); err != nil {
			return err
		}
	}
	return nil
}

// splitStatements splits a SQL file on semicolons that terminate a statement,
// ignoring semicolons inside comments.
func splitStatements(raw string) []string {
	var out []string
	var b strings.Builder
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") {
			continue
		}
		b.WriteString(line)
		b.WriteString("\n")
		if strings.HasSuffix(trimmed, ";") {
			stmt := strings.TrimSpace(b.String())
			stmt = strings.TrimSuffix(stmt, ";")
			if strings.TrimSpace(stmt) != "" {
				out = append(out, stmt)
			}
			b.Reset()
		}
	}
	if rest := strings.TrimSpace(b.String()); rest != "" {
		out = append(out, rest)
	}
	return out
}
