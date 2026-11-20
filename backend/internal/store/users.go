package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/platform"
	"github.com/leknowde/platform/backend/internal/secure"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrForbidden = errors.New("forbidden")
	ErrConflict  = errors.New("conflict")
)

type Store struct {
	DB     *platform.DB
	Cipher *secure.Cipher
}

func New(db *platform.DB, cipher *secure.Cipher) *Store {
	return &Store{DB: db, Cipher: cipher}
}

func NewID() string { return uuid.NewString() }

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == ' ' || r == '-' || r == '_' || r == '.':
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "workspace"
	}
	return out
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

type UserRecord struct {
	models.User
	PasswordHash string
	OrgID        string
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash, name string) (models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	now := platform.Now()
	userID := NewID()
	orgID := NewID()
	workspaceID := NewID()

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return models.User{}, err
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM users WHERE email = ?`, email).Scan(&count); err != nil {
		return models.User{}, err
	}
	if count > 0 {
		return models.User{}, ErrConflict
	}

	if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
		userID, email, passwordHash, name, now, now); err != nil {
		return models.User{}, err
	}
	base := strings.Split(email, "@")[0]
	orgName := base + "'s organization"
	if _, err := tx.ExecContext(ctx, `INSERT INTO organizations (id, name, slug, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
		orgID, orgName, slugify(base)+"-"+orgID[:6], userID, now, now); err != nil {
		return models.User{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO organization_members (id, organization_id, user_id, role, created_at) VALUES (?,?,?,?,?)`,
		NewID(), orgID, userID, "owner", now); err != nil {
		return models.User{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspaces (id, organization_id, name, slug, description, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
		workspaceID, orgID, "Default workspace", "default", "Your first LeKnowde workspace.", userID, now, now); err != nil {
		return models.User{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)`,
		NewID(), workspaceID, userID, "owner", now); err != nil {
		return models.User{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_preferences (user_id, theme, default_workspace_id, updated_at) VALUES (?,?,?,?)`,
		userID, "dark", workspaceID, now); err != nil {
		return models.User{}, err
	}
	if err := tx.Commit(); err != nil {
		return models.User{}, err
	}
	return models.User{ID: userID, Email: email, Name: name, CreatedAt: now}, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (UserRecord, error) {
	row := s.DB.QueryRowContext(ctx, `SELECT u.id, u.email, u.name, COALESCE(u.avatar_url,''), u.created_at, u.password_hash,
		COALESCE((SELECT organization_id FROM organization_members WHERE user_id = u.id ORDER BY created_at LIMIT 1),'')
		FROM users u WHERE u.email = ? AND u.deleted_at IS NULL`, strings.ToLower(strings.TrimSpace(email)))
	return scanUserRecord(row)
}

func (s *Store) GetUserByID(ctx context.Context, id string) (UserRecord, error) {
	row := s.DB.QueryRowContext(ctx, `SELECT u.id, u.email, u.name, COALESCE(u.avatar_url,''), u.created_at, u.password_hash,
		COALESCE((SELECT organization_id FROM organization_members WHERE user_id = u.id ORDER BY created_at LIMIT 1),'')
		FROM users u WHERE u.id = ? AND u.deleted_at IS NULL`, id)
	return scanUserRecord(row)
}

func scanUserRecord(row *sql.Row) (UserRecord, error) {
	var r UserRecord
	err := row.Scan(&r.ID, &r.Email, &r.Name, &r.AvatarURL, &r.CreatedAt, &r.PasswordHash, &r.OrgID)
	if platform.IsNoRows(err) {
		return UserRecord{}, ErrNotFound
	}
	return r, err
}

func (s *Store) UpdateUser(ctx context.Context, id, name, avatar string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET name = ?, avatar_url = ?, updated_at = ? WHERE id = ?`, name, avatar, platform.Now(), id)
	return err
}

func (s *Store) SetPassword(ctx context.Context, userID, hash string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hash, platform.Now(), userID)
	return err
}

// DeleteUser performs a soft delete plus revocation of stored credentials.
func (s *Store) DeleteUser(ctx context.Context, userID string) error {
	now := platform.Now()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE users SET deleted_at = ?, email = ?, updated_at = ? WHERE id = ?`,
		now, "deleted+"+userID+"@leknowde.invalid", now, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM integrations WHERE user_id = ?`, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM password_resets WHERE user_id = ?`, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) GetPreferences(ctx context.Context, userID string) (string, string, error) {
	var theme, ws string
	var defWS sql.NullString
	err := s.DB.QueryRowContext(ctx, `SELECT theme, default_workspace_id FROM user_preferences WHERE user_id = ?`, userID).Scan(&theme, &defWS)
	if platform.IsNoRows(err) {
		return "dark", "", nil
	}
	if defWS.Valid {
		ws = defWS.String
	}
	return theme, ws, err
}

func (s *Store) SetPreferences(ctx context.Context, userID, theme, workspaceID string) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO user_preferences (user_id, theme, default_workspace_id, updated_at) VALUES (?,?,?,?)
		ON CONFLICT (user_id) DO UPDATE SET theme = excluded.theme, default_workspace_id = excluded.default_workspace_id, updated_at = excluded.updated_at`,
		userID, theme, workspaceID, platform.Now())
	return err
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

func (s *Store) CreatePasswordReset(ctx context.Context, userID, tokenHash, expiresAt string) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)`,
		NewID(), userID, tokenHash, expiresAt, platform.Now())
	return err
}

func (s *Store) ConsumePasswordReset(ctx context.Context, tokenHash, newPasswordHash string) (string, error) {
	var id, userID, expiresAt string
	err := s.DB.QueryRowContext(ctx, `SELECT id, user_id, expires_at FROM password_resets WHERE token_hash = ? AND used = 0`, tokenHash).Scan(&id, &userID, &expiresAt)
	if platform.IsNoRows(err) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if platform.ParseTS(expiresAt).Before(platform.ParseTS(platform.Now())) {
		return "", ErrNotFound
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE password_resets SET used = 1 WHERE id = ?`, id); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, newPasswordHash, platform.Now(), userID); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return userID, nil
}

// ---------------------------------------------------------------------------
// Organizations & workspaces
// ---------------------------------------------------------------------------

func (s *Store) GetOrganization(ctx context.Context, id, userID string) (models.Organization, error) {
	var org models.Organization
	err := s.DB.QueryRowContext(ctx, `SELECT o.id, o.name, o.slug, m.role, o.created_at
		FROM organizations o JOIN organization_members m ON m.organization_id = o.id
		WHERE o.id = ? AND m.user_id = ? AND o.deleted_at IS NULL`, id, userID).
		Scan(&org.ID, &org.Name, &org.Slug, &org.Role, &org.CreatedAt)
	if platform.IsNoRows(err) {
		return org, ErrNotFound
	}
	return org, err
}

func (s *Store) ListWorkspaces(ctx context.Context, userID, orgID string) ([]models.Workspace, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT w.id, w.organization_id, w.name, w.slug, w.description, m.role, w.created_at, w.updated_at,
		(SELECT COUNT(1) FROM repositories r WHERE r.workspace_id = w.id AND r.deleted_at IS NULL),
		(SELECT COUNT(1) FROM workspace_members wm WHERE wm.workspace_id = w.id)
		FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
		WHERE m.user_id = ? AND w.deleted_at IS NULL AND (? = '' OR w.organization_id = ?)
		ORDER BY w.created_at ASC`, userID, orgID, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Workspace{}
	for rows.Next() {
		var w models.Workspace
		if err := rows.Scan(&w.ID, &w.OrganizationID, &w.Name, &w.Slug, &w.Description, &w.Role, &w.CreatedAt, &w.UpdatedAt, &w.RepositoryCount, &w.MemberCount); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (s *Store) CreateWorkspace(ctx context.Context, orgID, userID, name, description string) (models.Workspace, error) {
	now := platform.Now()
	id := NewID()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return models.Workspace{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspaces (id, organization_id, name, slug, description, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
		id, orgID, name, slugify(name)+"-"+id[:6], description, userID, now, now); err != nil {
		return models.Workspace{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)`,
		NewID(), id, userID, "owner", now); err != nil {
		return models.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return models.Workspace{}, err
	}
	return models.Workspace{ID: id, OrganizationID: orgID, Name: name, Slug: slugify(name), Description: description, Role: "owner", CreatedAt: now, UpdatedAt: now}, nil
}

func (s *Store) WorkspaceRole(ctx context.Context, workspaceID, userID string) (string, error) {
	var role string
	err := s.DB.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, workspaceID, userID).Scan(&role)
	if platform.IsNoRows(err) {
		return "", ErrForbidden
	}
	return role, err
}

func (s *Store) GetWorkspace(ctx context.Context, id, userID string) (models.Workspace, error) {
	var w models.Workspace
	err := s.DB.QueryRowContext(ctx, `SELECT w.id, w.organization_id, w.name, w.slug, w.description, m.role, w.created_at, w.updated_at,
		(SELECT COUNT(1) FROM repositories r WHERE r.workspace_id = w.id AND r.deleted_at IS NULL),
		(SELECT COUNT(1) FROM workspace_members wm WHERE wm.workspace_id = w.id)
		FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
		WHERE w.id = ? AND m.user_id = ? AND w.deleted_at IS NULL`, id, userID).
		Scan(&w.ID, &w.OrganizationID, &w.Name, &w.Slug, &w.Description, &w.Role, &w.CreatedAt, &w.UpdatedAt, &w.RepositoryCount, &w.MemberCount)
	if platform.IsNoRows(err) {
		return w, ErrNotFound
	}
	return w, err
}

func (s *Store) UpdateWorkspace(ctx context.Context, id, name, description string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?`, name, description, platform.Now(), id)
	return err
}

func (s *Store) DeleteWorkspace(ctx context.Context, id string) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE workspaces SET deleted_at = ?, updated_at = ? WHERE id = ?`, platform.Now(), platform.Now(), id)
	return err
}

func (s *Store) ListMembers(ctx context.Context, workspaceID string) ([]models.Member, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT u.id, u.email, u.name, m.role, m.created_at
		FROM workspace_members m JOIN users u ON u.id = m.user_id
		WHERE m.workspace_id = ? AND u.deleted_at IS NULL ORDER BY m.created_at ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Member{}
	for rows.Next() {
		var m models.Member
		if err := rows.Scan(&m.UserID, &m.Email, &m.Name, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) AddMember(ctx context.Context, workspaceID, orgID, email, role string) (models.Member, error) {
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		return models.Member{}, err
	}
	now := platform.Now()
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)
		ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role`, NewID(), workspaceID, user.ID, role, now); err != nil {
		return models.Member{}, err
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO organization_members (id, organization_id, user_id, role, created_at) VALUES (?,?,?,?,?)
		ON CONFLICT (organization_id, user_id) DO NOTHING`, NewID(), orgID, user.ID, "member", now); err != nil {
		return models.Member{}, err
	}
	return models.Member{UserID: user.ID, Email: user.Email, Name: user.Name, Role: role, JoinedAt: now}, nil
}

func (s *Store) RemoveMember(ctx context.Context, workspaceID, userID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, workspaceID, userID)
	return err
}

func (s *Store) Audit(ctx context.Context, actorID, orgID, action, targetType, targetID, metadata, ip, ua string) {
	_, _ = s.DB.ExecContext(ctx, `INSERT INTO audit_logs (id, actor_user_id, organization_id, action, target_type, target_id, metadata, ip, user_agent, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?)`, NewID(), actorID, orgID, action, targetType, targetID, metadata, ip, ua, platform.Now())
}

func (s *Store) ListAuditLogs(ctx context.Context, orgID string, limit int) ([]models.AuditLog, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT a.id, a.action, a.target_type, a.target_id, COALESCE(u.email,'system'), a.metadata, a.ip, a.created_at
		FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
		WHERE (? = '' OR a.organization_id = ?) ORDER BY a.created_at DESC LIMIT ?`, orgID, orgID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.AuditLog{}
	for rows.Next() {
		var a models.AuditLog
		if err := rows.Scan(&a.ID, &a.Action, &a.TargetType, &a.TargetID, &a.ActorEmail, &a.Metadata, &a.IP, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

func (s *Store) Notify(ctx context.Context, userID, workspaceID, kind, title, body, link string) {
	_, _ = s.DB.ExecContext(ctx, `INSERT INTO notifications (id, user_id, workspace_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?,?,?)`,
		NewID(), userID, workspaceID, kind, title, body, link, platform.Now())
}

func (s *Store) ListNotifications(ctx context.Context, userID string, limit int) ([]models.Notification, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, kind, title, body, link, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Notification{}
	for rows.Next() {
		var n models.Notification
		var read int
		if err := rows.Scan(&n.ID, &n.Kind, &n.Title, &n.Body, &n.Link, &read, &n.CreatedAt); err != nil {
			return nil, err
		}
		n.Read = read == 1
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) MarkNotificationsRead(ctx context.Context, userID, id string) error {
	if id == "" {
		_, err := s.DB.ExecContext(ctx, `UPDATE notifications SET read = 1 WHERE user_id = ?`, userID)
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?`, userID, id)
	return err
}
