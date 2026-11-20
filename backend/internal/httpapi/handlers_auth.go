package httpapi

import (
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/leknowde/platform/backend/internal/auth"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/platform"
	"github.com/leknowde/platform/backend/internal/secure"
	"github.com/leknowde/platform/backend/internal/store"
)

type registerRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
	Name     string `json:"name"`
}

func validEmail(email string) bool {
	_, err := mail.ParseAddress(email)
	return err == nil && strings.Contains(email, "@") && len(email) < 254
}

func (s *Server) handleRegister(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Email and password are required.")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if !validEmail(req.Email) {
		fail(c, http.StatusBadRequest, "invalid_email", "Enter a valid email address.")
		return
	}
	if len(req.Password) < 8 {
		fail(c, http.StatusBadRequest, "weak_password", "Use at least 8 characters for your password.")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.Split(req.Email, "@")[0]
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		fail(c, http.StatusBadRequest, "weak_password", err.Error())
		return
	}
	user, err := s.store.CreateUser(c.Request.Context(), req.Email, hash, name)
	if errors.Is(err, store.ErrConflict) {
		fail(c, http.StatusConflict, "email_taken", "An account with this email already exists.")
		return
	}
	if err != nil {
		s.log.Error("register", "error", err)
		fail(c, http.StatusInternalServerError, "registration_failed", "Could not create the account.")
		return
	}
	record, err := s.store.GetUserByEmail(c.Request.Context(), user.Email)
	if err != nil {
		fail(c, http.StatusInternalServerError, "registration_failed", "Account created but session could not start.")
		return
	}
	token, expires, err := s.auth.Issue(record.ID, record.Email, record.Name, record.OrgID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "session_failed", "Could not issue a session.")
		return
	}
	s.audit(c, "user.register", "user", record.ID, "{}")
	c.JSON(http.StatusCreated, gin.H{
		"token":      token,
		"expires_at": platform.FormatTS(expires),
		"user":       gin.H{"id": record.ID, "email": record.Email, "name": record.Name, "created_at": record.CreatedAt},
		"organization_id": record.OrgID,
	})
}

func (s *Server) handleLogin(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Email and password are required.")
		return
	}
	record, err := s.store.GetUserByEmail(c.Request.Context(), req.Email)
	if err != nil || !auth.CheckPassword(record.PasswordHash, req.Password) {
		// Constant-ish response shape prevents account enumeration.
		fail(c, http.StatusUnauthorized, "invalid_credentials", "The email or password is incorrect.")
		return
	}
	token, expires, err := s.auth.Issue(record.ID, record.Email, record.Name, record.OrgID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "session_failed", "Could not issue a session.")
		return
	}
	s.audit(c, "user.login", "user", record.ID, "{}")
	ok(c, gin.H{
		"token":      token,
		"expires_at": platform.FormatTS(expires),
		"user":       gin.H{"id": record.ID, "email": record.Email, "name": record.Name, "avatar_url": record.AvatarURL, "created_at": record.CreatedAt},
		"organization_id": record.OrgID,
	})
}

func (s *Server) handleLogout(c *gin.Context) {
	s.audit(c, "user.logout", "user", userID(c), "{}")
	ok(c, gin.H{"status": "signed_out"})
}

func (s *Server) handleMe(c *gin.Context) {
	record, err := s.store.GetUserByID(c.Request.Context(), userID(c))
	if err != nil {
		fail(c, http.StatusUnauthorized, "invalid_session", "This account is no longer available.")
		return
	}
	org, err := s.store.GetOrganization(c.Request.Context(), record.OrgID, record.ID)
	if err != nil {
		org = models.Organization{}
	}
	theme, defaultWS, _ := s.store.GetPreferences(c.Request.Context(), record.ID)
	orgPayload := gin.H{}
	if org.ID != "" {
		orgPayload = gin.H{"id": org.ID, "name": org.Name, "slug": org.Slug, "role": org.Role}
	}
	ok(c, gin.H{
		"user":            gin.H{"id": record.ID, "email": record.Email, "name": record.Name, "avatar_url": record.AvatarURL, "created_at": record.CreatedAt},
		"organization":    orgPayload,
		"preferences":     gin.H{"theme": theme, "default_workspace_id": defaultWS},
	})
}

func (s *Server) handleUpdateMe(c *gin.Context) {
	var req struct {
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		fail(c, http.StatusBadRequest, "invalid_request", "A display name is required.")
		return
	}
	if len(req.Name) > 120 {
		fail(c, http.StatusBadRequest, "invalid_request", "Display name is too long.")
		return
	}
	if err := s.store.UpdateUser(c.Request.Context(), userID(c), strings.TrimSpace(req.Name), req.AvatarURL); err != nil {
		fail(c, http.StatusInternalServerError, "update_failed", "Could not update the profile.")
		return
	}
	s.audit(c, "user.update", "user", userID(c), "{}")
	ok(c, gin.H{"status": "updated"})
}

func (s *Server) handleDeleteAccount(c *gin.Context) {
	var req struct {
		Confirmation string `json:"confirmation"`
		Password     string `json:"password"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Confirmation != "DELETE" {
		fail(c, http.StatusBadRequest, "confirmation_required", "Type DELETE to confirm account deletion.")
		return
	}
	record, err := s.store.GetUserByID(c.Request.Context(), userID(c))
	if err != nil || !auth.CheckPassword(record.PasswordHash, req.Password) {
		fail(c, http.StatusForbidden, "invalid_credentials", "Enter your current password to delete the account.")
		return
	}
	s.audit(c, "user.delete", "user", record.ID, "{}")
	if err := s.store.DeleteUser(c.Request.Context(), record.ID); err != nil {
		fail(c, http.StatusInternalServerError, "delete_failed", "Could not delete the account.")
		return
	}
	ok(c, gin.H{"status": "deleted", "note": "Provider tokens and password reset tokens were revoked. Repositories in shared workspaces remain available to other members."})
}

func (s *Server) handleGetPreferences(c *gin.Context) {
	theme, ws, err := s.store.GetPreferences(c.Request.Context(), userID(c))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load preferences.")
		return
	}
	ok(c, gin.H{"theme": theme, "default_workspace_id": ws})
}

func (s *Server) handleSetPreferences(c *gin.Context) {
	var req struct {
		Theme              string `json:"theme"`
		DefaultWorkspaceID string `json:"default_workspace_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Invalid preferences payload.")
		return
	}
	if req.Theme != "dark" && req.Theme != "light" && req.Theme != "system" {
		req.Theme = "dark"
	}
	if err := s.store.SetPreferences(c.Request.Context(), userID(c), req.Theme, req.DefaultWorkspaceID); err != nil {
		fail(c, http.StatusInternalServerError, "update_failed", "Could not save preferences.")
		return
	}
	ok(c, gin.H{"theme": req.Theme, "default_workspace_id": req.DefaultWorkspaceID})
}

func (s *Server) handleForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	_ = c.ShouldBindJSON(&req)
	ctx := c.Request.Context()
	record, err := s.store.GetUserByEmail(ctx, req.Email)
	response := gin.H{"status": "accepted", "message": "If an account exists for that address, a reset link has been generated."}
	if err == nil {
		token, terr := secure.RandomToken(32)
		if terr == nil {
			expires := time.Now().UTC().Add(45 * time.Minute).Format(time.RFC3339)
			if err := s.store.CreatePasswordReset(ctx, record.ID, secure.HashToken(token), expires); err != nil {
				s.log.Error("password reset create", "error", err)
			} else if s.cfg.DevMode {
				// Email delivery is not configured in development. The token is
				// returned explicitly so the flow is testable, and only in dev.
				response["dev_reset_token"] = token
				response["dev_note"] = "Development mode: no email was sent. Use this token with /auth/reset-password."
			}
		}
	}
	ok(c, response)
}

func (s *Server) handleResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "A token and a new password are required.")
		return
	}
	if len(req.Password) < 8 {
		fail(c, http.StatusBadRequest, "weak_password", "Use at least 8 characters for your password.")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		fail(c, http.StatusBadRequest, "weak_password", err.Error())
		return
	}
	uid, err := s.store.ConsumePasswordReset(c.Request.Context(), secure.HashToken(req.Token), hash)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid_token", "This reset link is invalid or has expired.")
		return
	}
	s.store.Audit(c.Request.Context(), uid, "", "user.password_reset", "user", uid, "{}", c.ClientIP(), c.Request.UserAgent())
	ok(c, gin.H{"status": "password_updated"})
}

func (s *Server) handleDashboard(c *gin.Context) {
	ctx := c.Request.Context()
	stats, err := s.store.DashboardStats(ctx, userID(c))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load dashboard metrics.")
		return
	}
	repos, _ := s.store.ListAllRepositoriesForUser(ctx, userID(c))
	notifications, _ := s.store.ListNotifications(ctx, userID(c), 5)
	ok(c, gin.H{"stats": stats, "recent_repositories": repos, "notifications": notifications})
}
