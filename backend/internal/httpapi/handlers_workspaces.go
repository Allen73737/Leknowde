package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/leknowde/platform/backend/internal/gitprov"
)

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

func (s *Server) handleListWorkspaces(c *gin.Context) {
	list, err := s.store.ListWorkspaces(c.Request.Context(), userID(c), orgID(c))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load workspaces.")
		return
	}
	ok(c, gin.H{"workspaces": list})
}

func (s *Server) handleCreateWorkspace(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		fail(c, http.StatusBadRequest, "invalid_request", "A workspace name is required.")
		return
	}
	if orgID(c) == "" {
		fail(c, http.StatusBadRequest, "no_organization", "This account has no organization.")
		return
	}
	ws, err := s.store.CreateWorkspace(c.Request.Context(), orgID(c), userID(c), strings.TrimSpace(req.Name), req.Description)
	if err != nil {
		fail(c, http.StatusInternalServerError, "create_failed", "Could not create the workspace.")
		return
	}
	s.audit(c, "workspace.create", "workspace", ws.ID, "{}")
	c.JSON(http.StatusCreated, ws)
}

func (s *Server) handleGetWorkspace(c *gin.Context) {
	ws, err := s.store.GetWorkspace(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Workspace not found or you are not a member.")
		return
	}
	repos, _ := s.store.ListRepositories(c.Request.Context(), ws.ID)
	ok(c, gin.H{"workspace": ws, "repositories": repos})
}

func (s *Server) handleUpdateWorkspace(c *gin.Context) {
	ws, err := s.store.GetWorkspace(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Workspace not found.")
		return
	}
	if ws.Role != "owner" && ws.Role != "admin" {
		fail(c, http.StatusForbidden, "insufficient_role", "Only workspace owners and admins can edit settings.")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		fail(c, http.StatusBadRequest, "invalid_request", "A workspace name is required.")
		return
	}
	if err := s.store.UpdateWorkspace(c.Request.Context(), ws.ID, req.Name, req.Description); err != nil {
		fail(c, http.StatusInternalServerError, "update_failed", "Could not update the workspace.")
		return
	}
	s.audit(c, "workspace.update", "workspace", ws.ID, "{}")
	ok(c, gin.H{"status": "updated"})
}

func (s *Server) handleDeleteWorkspace(c *gin.Context) {
	ws, err := s.store.GetWorkspace(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Workspace not found.")
		return
	}
	if ws.Role != "owner" {
		fail(c, http.StatusForbidden, "insufficient_role", "Only the workspace owner can delete it.")
		return
	}
	if err := s.store.DeleteWorkspace(c.Request.Context(), ws.ID); err != nil {
		fail(c, http.StatusInternalServerError, "delete_failed", "Could not delete the workspace.")
		return
	}
	s.audit(c, "workspace.delete", "workspace", ws.ID, "{}")
	ok(c, gin.H{"status": "deleted"})
}

func (s *Server) handleListMembers(c *gin.Context) {
	ws, err := s.store.GetWorkspace(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Workspace not found.")
		return
	}
	members, err := s.store.ListMembers(c.Request.Context(), ws.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load members.")
		return
	}
	ok(c, gin.H{"members": members})
}

func (s *Server) handleAddMember(c *gin.Context) {
	ws, err := s.store.GetWorkspace(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Workspace not found.")
		return
	}
	if ws.Role != "owner" && ws.Role != "admin" {
		fail(c, http.StatusForbidden, "insufficient_role", "Only owners and admins can invite members.")
		return
	}
	var req struct {
		Email string `json:"email" binding:"required"`
		Role  string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "An email address is required.")
		return
	}
	if req.Role != "admin" && req.Role != "member" && req.Role != "viewer" {
		req.Role = "member"
	}
	member, err := s.store.AddMember(c.Request.Context(), ws.ID, ws.OrganizationID, req.Email, req.Role)
	if err != nil {
		fail(c, http.StatusBadRequest, "invite_failed", "That person must already have a LeKnowde account. Email invitations are not configured.")
		return
	}
	s.store.Notify(c.Request.Context(), member.UserID, ws.ID, "info", "Added to workspace", "You were added to "+ws.Name+".", "/app/workspaces")
	s.audit(c, "workspace.member_add", "workspace", ws.ID, `{"email":"`+req.Email+`"}`)
	c.JSON(http.StatusCreated, member)
}

func (s *Server) handleRemoveMember(c *gin.Context) {
	ws, err := s.store.GetWorkspace(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Workspace not found.")
		return
	}
	if ws.Role != "owner" && ws.Role != "admin" {
		fail(c, http.StatusForbidden, "insufficient_role", "Only owners and admins can remove members.")
		return
	}
	if err := s.store.RemoveMember(c.Request.Context(), ws.ID, c.Param("userID")); err != nil {
		fail(c, http.StatusInternalServerError, "remove_failed", "Could not remove the member.")
		return
	}
	s.audit(c, "workspace.member_remove", "workspace", ws.ID, "{}")
	ok(c, gin.H{"status": "removed"})
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

func (s *Server) handleListIntegrations(c *gin.Context) {
	list, err := s.store.ListIntegrations(c.Request.Context(), orgID(c))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load integrations.")
		return
	}
	ok(c, gin.H{"integrations": list, "github_oauth_enabled": s.cfg.GitHubClientID != ""})
}

func (s *Server) handleConnectToken(c *gin.Context) {
	providerName := c.Param("provider")
	provider, err := gitprov.New(providerName)
	if err != nil || providerName == "demo" {
		fail(c, http.StatusBadRequest, "unsupported_provider", "Supported providers are github and gitlab.")
		return
	}
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Token) == "" {
		fail(c, http.StatusBadRequest, "invalid_request", "A personal access token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	login, scopes, err := provider.Validate(ctx, strings.TrimSpace(req.Token))
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid_token", providerErrorMessage(err))
		return
	}
	integration, err := s.store.UpsertIntegration(ctx, userID(c), orgID(c), providerName, login, strings.TrimSpace(req.Token), "", scopes, "")
	if err != nil {
		fail(c, http.StatusInternalServerError, "store_failed", "Could not store the integration credentials.")
		return
	}
	s.audit(c, "integration.connect", "integration", integration.ID, `{"provider":"`+providerName+`"}`)
	ok(c, gin.H{"integration": integration, "account": login})
}

func providerErrorMessage(err error) string {
	switch err {
	case gitprov.ErrUnauthorized:
		return "The provider rejected this token. Check that it is valid and has read access."
	case gitprov.ErrRateLimited:
		return "The provider rate limit was reached. Wait and try again."
	default:
		return "Could not verify the token with the provider: " + err.Error()
	}
}

func (s *Server) handleProviderRepositories(c *gin.Context) {
	providerName := c.Param("provider")
	provider, err := gitprov.New(providerName)
	if err != nil {
		fail(c, http.StatusBadRequest, "unsupported_provider", "Unsupported provider.")
		return
	}
	token := ""
	if providerName == "demo" {
		token = "demo"
	} else {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		stored, _, err := s.store.IntegrationToken(ctx, orgID(c), providerName)
		if err != nil {
			fail(c, http.StatusBadRequest, "not_connected", "Connect "+providerName+" before listing repositories.")
			return
		}
		token = stored
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
	defer cancel()
	repos, err := provider.ListRepositories(ctx, token)
	if err != nil {
		fail(c, http.StatusBadGateway, "provider_error", providerErrorMessage(err))
		return
	}
	ok(c, gin.H{"repositories": repos, "provider": providerName})
}

func (s *Server) handleDisconnect(c *gin.Context) {
	providerName := c.Param("provider")
	if err := s.store.DeleteIntegration(c.Request.Context(), orgID(c), providerName); err != nil {
		fail(c, http.StatusInternalServerError, "delete_failed", "Could not remove the integration.")
		return
	}
	s.audit(c, "integration.disconnect", "integration", providerName, "{}")
	ok(c, gin.H{"status": "disconnected"})
}

func (s *Server) handleGitHubAuthorize(c *gin.Context) {
	if s.cfg.GitHubClientID == "" {
		fail(c, http.StatusNotImplemented, "oauth_not_configured",
			"GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or connect with a personal access token.")
		return
	}
	state := uuid.NewString()
	s.oauth.put(state, userID(c), orgID(c))
	redirect := fmt.Sprintf("https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=repo%%20read:user&state=%s",
		url.QueryEscape(s.cfg.GitHubClientID), url.QueryEscape(s.cfg.GitHubRedirectURL), url.QueryEscape(state))
	c.Redirect(http.StatusFound, redirect)
}

func (s *Server) handleGitHubCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	if code == "" || state == "" {
		c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/app/integrations?error=oauth_cancelled")
		return
	}
	entry, okState := s.oauth.take(state)
	if !okState {
		c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/app/integrations?error=oauth_state_invalid")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()
	form := url.Values{}
	form.Set("client_id", s.cfg.GitHubClientID)
	form.Set("client_secret", s.cfg.GitHubClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", s.cfg.GitHubRedirectURL)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/app/integrations?error=oauth_exchange_failed")
		return
	}
	defer resp.Body.Close()
	var payload struct {
		AccessToken string `json:"access_token"`
		Scope       string `json:"scope"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil || payload.AccessToken == "" {
		c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/app/integrations?error=oauth_exchange_failed")
		return
	}
	provider, _ := gitprov.New("github")
	login, scopes, err := provider.Validate(ctx, payload.AccessToken)
	if err != nil {
		c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/app/integrations?error=oauth_invalid_token")
		return
	}
	if scopes == "" {
		scopes = payload.Scope
	}
	if _, err := s.store.UpsertIntegration(ctx, entry.userID, entry.orgID, "github", login, payload.AccessToken, "", scopes, ""); err != nil {
		c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/app/integrations?error=store_failed")
		return
	}
	s.store.Audit(ctx, entry.userID, entry.orgID, "integration.connect_oauth", "integration", "github", "{}", c.ClientIP(), c.Request.UserAgent())
	c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/app/integrations?connected=github")
}
