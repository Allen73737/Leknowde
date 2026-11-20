package platform

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/leknowde/platform/backend/internal/config"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

// DB wraps database/sql with dialect awareness so a single query layer works on
// PostgreSQL (production) and SQLite (local development, tests).
type DB struct {
	*sql.DB
	Dialect string
}

func Open(cfg config.Config) (*DB, error) {
	if cfg.IsPostgres() {
		db, err := sql.Open("pgx", cfg.DatabaseURL)
		if err != nil {
			return nil, fmt.Errorf("open postgres: %w", err)
		}
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(10)
		db.SetConnMaxLifetime(30 * time.Minute)
		if err := db.Ping(); err != nil {
			return nil, fmt.Errorf("ping postgres: %w", err)
		}
		return &DB{DB: db, Dialect: "postgres"}, nil
	}

	dsn := cfg.DatabaseURL
	if strings.HasPrefix(dsn, "file:") {
		path := strings.TrimPrefix(dsn, "file:")
		if dir := filepath.Dir(path); dir != "." && dir != "" {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("create data dir: %w", err)
			}
		}
	}
	if !strings.Contains(dsn, "?") {
		dsn += "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return &DB{DB: db, Dialect: "sqlite"}, nil
}

// Rebind converts the portable ? placeholder style to the dialect's style.
func (d *DB) Rebind(query string) string {
	if d.Dialect != "postgres" {
		return query
	}
	var b strings.Builder
	b.Grow(len(query) + 16)
	n := 0
	for i := 0; i < len(query); i++ {
		if query[i] == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteByte(query[i])
	}
	return b.String()
}

func (d *DB) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return d.DB.ExecContext(ctx, d.Rebind(query), args...)
}

func (d *DB) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return d.DB.QueryContext(ctx, d.Rebind(query), args...)
}

func (d *DB) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return d.DB.QueryRowContext(ctx, d.Rebind(query), args...)
}

func (d *DB) BeginTx(ctx context.Context, opts *sql.TxOptions) (*Tx, error) {
	tx, err := d.DB.BeginTx(ctx, opts)
	if err != nil {
		return nil, err
	}
	return &Tx{Tx: tx, dialect: d.Dialect}, nil
}

// Tx is a dialect-aware transaction.
type Tx struct {
	*sql.Tx
	dialect string
}

func (t *Tx) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return t.Tx.ExecContext(ctx, (&DB{Dialect: t.dialect}).Rebind(query), args...)
}

func (t *Tx) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return t.Tx.QueryContext(ctx, (&DB{Dialect: t.dialect}).Rebind(query), args...)
}

func (t *Tx) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return t.Tx.QueryRowContext(ctx, (&DB{Dialect: t.dialect}).Rebind(query), args...)
}

// Now returns the storage timestamp format used across the platform.
func Now() string { return time.Now().UTC().Format(time.RFC3339) }

// FormatTS normalizes a time to the storage format.
func FormatTS(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// ParseTS parses a stored timestamp, tolerating SQLite's alternate formats.
func ParseTS(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

func IsNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }

// NullString safely dereferences a nullable text column.
func NullString(s sql.NullString) string {
	if s.Valid {
		return s.String
	}
	return ""
}
