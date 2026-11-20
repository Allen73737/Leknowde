package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/leknowde/platform/backend/internal/aiclient"
	"github.com/leknowde/platform/backend/internal/auth"
	"github.com/leknowde/platform/backend/internal/config"
	"github.com/leknowde/platform/backend/internal/index"
	"github.com/leknowde/platform/backend/internal/platform"
	"github.com/leknowde/platform/backend/internal/store"
)

type Server struct {
	cfg      config.Config
	store    *store.Store
	auth     *auth.Manager
	ai       *aiclient.Client
	pipeline *index.Pipeline
	log      *slog.Logger
	limiter  *rateLimiter
	oauth    *oauthStateStore
}

func NewServer(cfg config.Config, st *store.Store, mgr *auth.Manager, ai *aiclient.Client, pipeline *index.Pipeline, log *slog.Logger) *Server {
	return &Server{cfg: cfg, store: st, auth: mgr, ai: ai, pipeline: pipeline, log: log,
		limiter: newRateLimiter(cfg.RateLimitPerMin), oauth: newOAuthStateStore()}
}

// Router builds the complete versioned API surface.
func (s *Server) Router() http.Handler {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(s.requestLogger())
	r.Use(s.cors())
	r.Use(s.rateLimit())

	r.GET("/health", s.handleHealth)
	r.GET("/api/v1/health", s.handleHealth)
	r.GET("/api/v1/meta", s.handleMeta)

	v1 := r.Group("/api/v1")
	{
		authGroup := v1.Group("/auth")
		authGroup.POST("/register", s.handleRegister)
		authGroup.POST("/login", s.handleLogin)
		authGroup.POST("/logout", s.handleLogout)
		authGroup.POST("/forgot-password", s.handleForgotPassword)
		authGroup.POST("/reset-password", s.handleResetPassword)
		authGroup.GET("/me", s.requireAuth(), s.handleMe)

		users := v1.Group("/users", s.requireAuth())
		users.PATCH("/me", s.handleUpdateMe)
		users.DELETE("/me", s.handleDeleteAccount)
		users.GET("/me/preferences", s.handleGetPreferences)
		users.PUT("/me/preferences", s.handleSetPreferences)

		ws := v1.Group("/workspaces", s.requireAuth())
		ws.GET("", s.handleListWorkspaces)
		ws.POST("", s.handleCreateWorkspace)
		ws.GET("/:id", s.handleGetWorkspace)
		ws.PATCH("/:id", s.handleUpdateWorkspace)
		ws.DELETE("/:id", s.handleDeleteWorkspace)
		ws.GET("/:id/members", s.handleListMembers)
		ws.POST("/:id/members", s.handleAddMember)
		ws.DELETE("/:id/members/:userID", s.handleRemoveMember)
		ws.GET("/:id/repositories", s.handleListRepositories)

		integrations := v1.Group("/integrations", s.requireAuth())
		integrations.GET("", s.handleListIntegrations)
		integrations.POST("/:provider/token", s.handleConnectToken)
		integrations.GET("/:provider/repositories", s.handleProviderRepositories)
		integrations.DELETE("/:provider", s.handleDisconnect)

		v1.GET("/integrations/github/authorize", s.requireAuth(), s.handleGitHubAuthorize)
		v1.GET("/integrations/github/callback", s.handleGitHubCallback)

		repos := v1.Group("/repositories", s.requireAuth())
		repos.POST("", s.handleConnectRepository)
		repos.POST("/demo", s.handleConnectDemo)
		repos.GET("/:id", s.handleGetRepository)
		repos.DELETE("/:id", s.handleDeleteRepository)
		repos.GET("/:id/branches", s.handleBranches)
		repos.POST("/:id/index", s.handleStartIndex)
		repos.GET("/:id/jobs", s.handleListJobs)
		repos.GET("/:id/tree", s.handleTree)
		repos.GET("/:id/file", s.handleFile)
		repos.GET("/:id/symbols", s.handleSymbols)
		repos.GET("/:id/search", s.handleSearch)
		repos.GET("/:id/overview", s.handleOverview)
		repos.GET("/:id/graph", s.handleGraph)
		repos.GET("/:id/dependencies", s.handleDependencies)
		repos.GET("/:id/cycles", s.handleCycles)
		repos.GET("/:id/health", s.handleHealthReport)
		repos.GET("/:id/onboarding", s.handleOnboarding)
		repos.GET("/:id/twin", s.handleTwin)
		repos.GET("/:id/impact", s.handleListImpact)
		repos.POST("/:id/impact", s.handleCreateImpact)
		repos.GET("/:id/documents", s.handleListDocuments)
		repos.POST("/:id/documents", s.handleGenerateDocument)
		repos.GET("/:id/conversations", s.handleListConversations)
		repos.POST("/:id/conversations", s.handleCreateConversation)
		repos.POST("/:id/chat", s.handleChat)
		repos.GET("/:id/pull-requests", s.handlePullRequests)
		repos.POST("/:id/pull-requests/:number/analyze", s.handleAnalyzePR)

		v1.GET("/documents/:id", s.requireAuth(), s.handleGetDocument)
		v1.PATCH("/documents/:id", s.requireAuth(), s.handleUpdateDocument)
		v1.DELETE("/documents/:id", s.requireAuth(), s.handleDeleteDocument)
		v1.GET("/impact/:id", s.requireAuth(), s.handleGetImpact)
		v1.GET("/jobs/:id", s.requireAuth(), s.handleGetJob)
		v1.GET("/conversations/:id/messages", s.requireAuth(), s.handleListMessages)

		v1.GET("/notifications", s.requireAuth(), s.handleListNotifications)
		v1.POST("/notifications/read", s.requireAuth(), s.handleReadNotifications)
		v1.GET("/audit-logs", s.requireAuth(), s.handleAuditLogs)
		v1.GET("/dashboard", s.requireAuth(), s.handleDashboard)
	}

	r.NoRoute(func(c *gin.Context) {
		fail(c, http.StatusNotFound, "not_found", "No API route matches "+c.Request.Method+" "+c.Request.URL.Path)
	})
	return r
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

func (s *Server) requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		s.log.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(),
			"user", c.GetString("userID"),
		)
	}
}

func (s *Server) cors() gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, o := range s.cfg.AllowedOrigins {
		allowed[o] = true
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && (allowed[origin] || s.cfg.DevMode && strings.HasPrefix(origin, "http://localhost:")) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func (s *Server) rateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodOptions || strings.HasSuffix(c.Request.URL.Path, "/health") {
			c.Next()
			return
		}
		key := c.ClientIP()
		if !s.limiter.allow(key) {
			c.Header("Retry-After", "60")
			fail(c, http.StatusTooManyRequests, "rate_limited", "Too many requests. Try again shortly.")
			c.Abort()
			return
		}
		c.Next()
	}
}

func (s *Server) requireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := auth.BearerToken(c.GetHeader("Authorization"))
		if raw == "" {
			if cookie, err := c.Cookie("lk_session"); err == nil {
				raw = cookie
			}
		}
		if raw == "" {
			fail(c, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
			c.Abort()
			return
		}
		claims, err := s.auth.Parse(raw)
		if err != nil {
			fail(c, http.StatusUnauthorized, "invalid_session", "Your session has expired. Sign in again.")
			c.Abort()
			return
		}
		c.Set("userID", claims.UserID)
		c.Set("email", claims.Email)
		c.Set("name", claims.Name)
		c.Set("orgID", claims.OrgID)
		c.Next()
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func fail(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{"error": code, "message": message})
}

func ok(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

func (s *Server) audit(c *gin.Context, action, targetType, targetID, metadata string) {
	s.store.Audit(c.Request.Context(), c.GetString("userID"), c.GetString("orgID"), action, targetType, targetID, metadata, c.ClientIP(), c.Request.UserAgent())
}

func userID(c *gin.Context) string { return c.GetString("userID") }
func orgID(c *gin.Context) string  { return c.GetString("orgID") }

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

type rateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

func newRateLimiter(perMinute int) *rateLimiter {
	if perMinute <= 0 {
		perMinute = 240
	}
	return &rateLimiter{hits: map[string][]time.Time{}, limit: perMinute, window: time.Minute}
}

func (r *rateLimiter) allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-r.window)
	existing := r.hits[key]
	kept := existing[:0]
	for _, t := range existing {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= r.limit {
		r.hits[key] = kept
		return false
	}
	r.hits[key] = append(kept, now)
	if len(r.hits) > 10000 {
		for k := range r.hits {
			if len(r.hits[k]) == 0 {
				delete(r.hits, k)
			}
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

type oauthStateStore struct {
	mu    sync.Mutex
	state map[string]oauthEntry
}

type oauthEntry struct {
	userID    string
	orgID     string
	expiresAt time.Time
}

func newOAuthStateStore() *oauthStateStore {
	return &oauthStateStore{state: map[string]oauthEntry{}}
}

func (s *oauthStateStore) put(state, userID, orgID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state[state] = oauthEntry{userID: userID, orgID: orgID, expiresAt: time.Now().Add(10 * time.Minute)}
}

func (s *oauthStateStore) take(state string) (oauthEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.state[state]
	if !ok || entry.expiresAt.Before(time.Now()) {
		delete(s.state, state)
		return oauthEntry{}, false
	}
	delete(s.state, state)
	return entry, true
}

// ---------------------------------------------------------------------------
// System endpoints
// ---------------------------------------------------------------------------

func (s *Server) handleHealth(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	dbStatus := "ok"
	if err := s.store.DB.PingContext(ctx); err != nil {
		dbStatus = "unavailable"
	}
	aiStatus := "unavailable"
	aiDetail := aiclient.ServiceStatus{}
	if status, err := s.ai.Status(ctx); err == nil {
		aiStatus = status.Status
		aiDetail = status
	}
	code := http.StatusOK
	if dbStatus != "ok" {
		code = http.StatusServiceUnavailable
	}
	c.JSON(code, gin.H{
		"status":  map[bool]string{true: "ok", false: "degraded"}[dbStatus == "ok"],
		"service": "leknowde-api",
		"database": gin.H{"status": dbStatus, "driver": s.store.DB.Dialect},
		"ai_service": gin.H{"status": aiStatus, "detail": aiDetail},
		"time":   platform.Now(),
	})
}

func (s *Server) handleMeta(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	aiStatus, aiErr := s.ai.Status(ctx)
	payload := gin.H{
		"product":  "LeKnowde",
		"tagline":  "Learn the Code. Know the System.",
		"version":  "1.0.0",
		"api_version": "v1",
		"capabilities": gin.H{
			"repository_indexing": true,
			"static_analysis":     true,
			"dependency_graph":    true,
			"impact_analysis":     true,
			"living_documentation": true,
			"pr_intelligence":     true,
			"digital_twin":        true,
		},
		"llm": gin.H{"configured": aiErr == nil && aiStatus.LLM.Configured, "provider": aiStatus.LLM.Provider, "model": aiStatus.LLM.Model, "reason": aiStatus.LLM.Reason},
		"embeddings": gin.H{"mode": aiStatus.Embeddings.Mode, "model": aiStatus.Embeddings.Model},
		"parser": aiStatus.Parser,
		"integrations": gin.H{
			"github_oauth": s.cfg.GitHubClientID != "",
			"github_token_connect": true,
			"gitlab_token_connect": true,
			"demo_dataset": true,
		},
	}
	if aiErr != nil {
		payload["ai_service"] = gin.H{"status": "unavailable", "error": aiErr.Error()}
	}
	ok(c, payload)
}
