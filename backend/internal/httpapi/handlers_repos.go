package httpapi

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/leknowde/platform/backend/internal/gitprov"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/retrieval"
	"github.com/leknowde/platform/backend/internal/store"
)

func (s *Server) requireRepository(c *gin.Context) (models.Repository, bool) {
	repo, err := s.store.RepositoryForUser(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Repository not found or you do not have access.")
		return repo, false
	}
	return repo, true
}

func branchOrDefault(c *gin.Context, repo models.Repository) string {
	if b := c.Query("branch"); b != "" {
		return b
	}
	return repo.DefaultBranch
}

func (s *Server) handleConnectRepository(c *gin.Context) {
	var req struct {
		WorkspaceID   string `json:"workspace_id" binding:"required"`
		Provider      string `json:"provider" binding:"required"`
		Owner         string `json:"owner"`
		Name          string `json:"name" binding:"required"`
		Branch        string `json:"branch"`
		Description   string `json:"description"`
		Language      string `json:"language"`
		Private       bool   `json:"private"`
		HTMLURL       string `json:"html_url"`
		ExternalID    string `json:"external_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "workspace_id, provider and name are required.")
		return
	}
	ctx := c.Request.Context()
	if _, err := s.store.WorkspaceRole(ctx, req.WorkspaceID, userID(c)); err != nil {
		fail(c, http.StatusForbidden, "forbidden", "You are not a member of this workspace.")
		return
	}
	provider, err := gitprov.New(req.Provider)
	if err != nil {
		fail(c, http.StatusBadRequest, "unsupported_provider", "Unsupported provider.")
		return
	}
	token := "demo"
	if req.Provider != "demo" {
		orgIDValue, _ := s.store.WorkspaceOrgID(ctx, req.WorkspaceID)
		stored, _, err := s.store.IntegrationToken(ctx, orgIDValue, req.Provider)
		if err != nil {
			fail(c, http.StatusBadRequest, "not_connected", "Connect "+req.Provider+" before adding a repository.")
			return
		}
		token = stored
	}
	fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	meta, err := provider.GetRepository(fetchCtx, token, req.Owner, req.Name)
	if err != nil && req.Provider != "demo" {
		fail(c, http.StatusBadGateway, "provider_error", providerErrorMessage(err))
		return
	}
	if req.Branch == "" {
		req.Branch = meta.DefaultBranch
	}
	if req.Branch == "" {
		req.Branch = "main"
	}
	if req.Owner == "" {
		req.Owner = meta.Owner
	}
	repo, err := s.store.CreateRepository(ctx, store.NewRepository{
		WorkspaceID: req.WorkspaceID, Provider: req.Provider, Owner: req.Owner, Name: req.Name,
		Description: firstNonEmpty(meta.Description, req.Description), Language: firstNonEmpty(meta.Language, req.Language),
		Visibility: visibilityOf(meta.Private || req.Private), HTMLURL: firstNonEmpty(meta.HTMLURL, req.HTMLURL),
		DefaultBranch: req.Branch, ExternalID: firstNonEmpty(meta.ExternalID, req.ExternalID), Private: meta.Private || req.Private,
	})
	if err != nil {
		fail(c, http.StatusInternalServerError, "create_failed", "Could not save the repository: "+err.Error())
		return
	}
	job, err := s.store.CreateJob(ctx, repo.ID, req.Branch, "index")
	if err != nil {
		fail(c, http.StatusInternalServerError, "queue_failed", "Repository saved but indexing could not be queued.")
		return
	}
	s.audit(c, "repository.connect", "repository", repo.ID, `{"provider":"`+req.Provider+`"}`)
	c.JSON(http.StatusCreated, gin.H{"repository": repo, "job": job})
}

func (s *Server) handleConnectDemo(c *gin.Context) {
	var req struct {
		WorkspaceID string `json:"workspace_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "workspace_id is required.")
		return
	}
	ctx := c.Request.Context()
	if _, err := s.store.WorkspaceRole(ctx, req.WorkspaceID, userID(c)); err != nil {
		fail(c, http.StatusForbidden, "forbidden", "You are not a member of this workspace.")
		return
	}
	provider, _ := gitprov.New("demo")
	meta, err := provider.GetRepository(ctx, "demo", "leknowde", "mineral-notes")
	if err != nil {
		fail(c, http.StatusInternalServerError, "demo_unavailable", "The bundled demo dataset could not be read.")
		return
	}
	repo, err := s.store.CreateRepository(ctx, store.NewRepository{
		WorkspaceID: req.WorkspaceID, Provider: "demo", Owner: meta.Owner, Name: meta.Name,
		Description: meta.Description + " (explicitly labelled demo data)", Language: meta.Language,
		Visibility: "public", DefaultBranch: meta.DefaultBranch, ExternalID: meta.ExternalID,
	})
	if err != nil {
		fail(c, http.StatusInternalServerError, "create_failed", "Could not create the demo repository.")
		return
	}
	job, err := s.store.CreateJob(ctx, repo.ID, meta.DefaultBranch, "index")
	if err != nil {
		fail(c, http.StatusInternalServerError, "queue_failed", "Demo repository saved but indexing could not be queued.")
		return
	}
	s.audit(c, "repository.connect_demo", "repository", repo.ID, "{}")
	c.JSON(http.StatusCreated, gin.H{"repository": repo, "job": job, "note": "This is a bundled demo dataset. Commit history and pull request metadata for it are illustrative fixtures."})
}

func (s *Server) handleGetRepository(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	stats, _ := s.store.RepoStats(ctx, repo.ID, branch)
	branches, _ := s.store.ListBranches(ctx, repo.ID)
	jobs, _ := s.store.ListJobs(ctx, repo.ID, 5)
	commits, _ := s.store.ListCommits(ctx, repo.ID, 12)
	ok(c, gin.H{"repository": repo, "stats": stats, "branches": branches, "jobs": jobs, "commits": commits, "branch": branch})
}

func (s *Server) handleDeleteRepository(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	if err := s.store.DeleteRepository(c.Request.Context(), repo.ID); err != nil {
		fail(c, http.StatusInternalServerError, "delete_failed", "Could not delete the repository: "+err.Error())
		return
	}
	s.audit(c, "repository.delete", "repository", repo.ID, "{}")
	ok(c, gin.H{"status": "deleted"})
}

func (s *Server) handleListRepositories(c *gin.Context) {
	list, err := s.store.ListRepositories(c.Request.Context(), c.Param("id"))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load repositories.")
		return
	}
	ok(c, gin.H{"repositories": list})
}

func (s *Server) handleBranches(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	if c.Query("refresh") == "true" && repo.Provider != "demo" {
		orgIDValue, _ := s.store.WorkspaceOrgID(c.Request.Context(), repo.WorkspaceID)
		token, _, err := s.store.IntegrationToken(c.Request.Context(), orgIDValue, repo.Provider)
		if err == nil {
			provider, _ := gitprov.New(repo.Provider)
			ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
			branches, berr := provider.ListBranches(ctx, token, repo.Owner, repo.Name)
			cancel()
			if berr == nil {
				for _, b := range branches {
					_ = s.store.UpsertBranch(c.Request.Context(), repo.ID, b.Name, b.HeadSHA, b.Name == repo.DefaultBranch)
				}
			}
		}
	}
	branches, err := s.store.ListBranches(c.Request.Context(), repo.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load branches.")
		return
	}
	ok(c, gin.H{"branches": branches})
}

func (s *Server) handleStartIndex(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	branch := branchOrDefault(c, repo)
	job, err := s.store.CreateJob(c.Request.Context(), repo.ID, branch, "index")
	if err != nil {
		fail(c, http.StatusInternalServerError, "queue_failed", "Could not queue indexing.")
		return
	}
	s.audit(c, "repository.index", "repository", repo.ID, `{"branch":"`+branch+`"}`)
	c.JSON(http.StatusAccepted, gin.H{"job": job})
}

func (s *Server) handleListJobs(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	jobs, err := s.store.ListJobs(c.Request.Context(), repo.ID, 20)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load jobs.")
		return
	}
	ok(c, gin.H{"jobs": jobs})
}

func (s *Server) handleGetJob(c *gin.Context) {
	job, err := s.store.GetJob(c.Request.Context(), c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Job not found.")
		return
	}
	if _, err := s.store.RepositoryForUser(c.Request.Context(), job.RepositoryID, userID(c)); err != nil {
		fail(c, http.StatusForbidden, "forbidden", "You do not have access to this job.")
		return
	}
	ok(c, job)
}

func (s *Server) handleTree(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	branch := branchOrDefault(c, repo)
	files, err := s.store.ListFilePaths(c.Request.Context(), repo.ID, branch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load the file tree.")
		return
	}
	ok(c, gin.H{"tree": store.BuildTree(files), "files": files, "branch": branch, "count": len(files)})
}

func (s *Server) handleFile(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	path := c.Query("path")
	if path == "" {
		fail(c, http.StatusBadRequest, "invalid_request", "A file path is required.")
		return
	}
	branch := branchOrDefault(c, repo)
	file, err := s.store.GetFile(c.Request.Context(), repo.ID, branch, path)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "File not found on this branch. It may not have been indexed yet.")
		return
	}
	symbols, _ := s.store.SymbolsInFile(c.Request.Context(), file.ID)
	edges, _ := s.store.FileEdges(c.Request.Context(), repo.ID, path)
	ok(c, gin.H{"file": file, "symbols": symbols, "dependencies": edges})
}

func (s *Server) handleSymbols(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	limit := queryInt(c, "limit", 200, 1, 1000)
	symbols, err := s.store.ListSymbols(c.Request.Context(), repo.ID, c.Query("kind"), c.Query("q"), limit)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load symbols.")
		return
	}
	ok(c, gin.H{"symbols": symbols, "count": len(symbols)})
}

func (s *Server) handleSearch(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		ok(c, gin.H{"query": "", "hits": []any{}, "evidence": []any{}})
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	files, err := s.store.SearchFiles(ctx, repo.ID, branch, query, 20)
	if err != nil {
		fail(c, http.StatusInternalServerError, "search_failed", "Search failed.")
		return
	}
	symbols, _ := s.store.SearchSymbols(ctx, repo.ID, retrieval.Tokenize(query), 20)
	hybrid, _ := retrieval.Search(ctx, s.store, repo.ID, branch, query, 8)
	ok(c, gin.H{
		"query": query, "files": files, "symbols": symbols,
		"evidence": hybrid.Evidence, "strategy": hybrid.Strategy, "candidates": hybrid.Candidates,
	})
}

func (s *Server) handleOverview(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	stats, err := s.store.RepoStats(ctx, repo.ID, branch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not compute repository statistics.")
		return
	}
	nodes, edges, _ := s.store.GraphStats(ctx, repo.ID)
	commits, _ := s.store.ListCommits(ctx, repo.ID, 8)
	endpoints := []string{}
	rows, err := s.store.DB.QueryContext(ctx, `SELECT label FROM graph_nodes WHERE repository_id = ? AND kind = 'api' ORDER BY label LIMIT 40`, repo.ID)
	if err == nil {
		for rows.Next() {
			var label string
			if err := rows.Scan(&label); err == nil {
				endpoints = append(endpoints, label)
			}
		}
		rows.Close()
	}
	ok(c, gin.H{"repository": repo, "branch": branch, "stats": stats, "graph": gin.H{"nodes": nodes, "edges": edges}, "commits": commits, "endpoints": endpoints})
}

func (s *Server) handleGraph(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	view := c.DefaultQuery("view", "module")
	kinds := []string{}
	relations := []string{}
	limit := queryInt(c, "limit", 400, 10, 2000)
	switch view {
	case "module":
		kinds = []string{"module"}
		relations = []string{"DEPENDS_ON"}
	case "file":
		kinds = []string{"file"}
		relations = []string{"IMPORTS"}
	case "architecture":
		kinds = []string{"module", "api", "entity", "service"}
		relations = []string{"DEPENDS_ON", "EXPOSES", "CONSUMES", "USES"}
	case "symbol":
		kinds = []string{"symbol", "function", "class", "component", "interface"}
		relations = []string{"CALLS", "EXTENDS", "IMPLEMENTS"}
	case "test":
		kinds = []string{"test", "file"}
		relations = []string{"TESTS"}
	case "twin":
		kinds = []string{}
		relations = []string{}
	default:
		kinds = []string{"file"}
		relations = []string{"IMPORTS", "CALLS"}
	}
	graph, err := s.store.LoadGraph(c.Request.Context(), repo.ID, kinds, relations, limit)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load the graph.")
		return
	}
	ok(c, gin.H{"graph": graph, "view": view})
}

func (s *Server) handleDependencies(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	path := c.Query("path")
	if path == "" {
		// Repository-wide dependency summary.
		edges, err := s.store.DependencySummary(ctx, repo.ID)
		if err != nil {
			fail(c, http.StatusInternalServerError, "load_failed", "Could not load dependencies.")
			return
		}
		modules, _ := s.store.ModuleDependencyEdges(ctx, repo.ID)
		cycles, _ := s.store.FindCycles(ctx, repo.ID)
		unused, _ := s.store.UnusedImportCandidates(ctx, repo.ID)
		ok(c, gin.H{"summary": edges, "modules": modules, "cycles": cycles, "unused_imports": unused})
		return
	}
	edges, err := s.store.FileEdges(ctx, repo.ID, path)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load file dependencies.")
		return
	}
	ok(c, gin.H{"path": path, "edges": edges})
}

func (s *Server) handleCycles(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	cycles, err := s.store.FindCycles(c.Request.Context(), repo.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not analyse cycles.")
		return
	}
	ok(c, gin.H{"cycles": cycles, "count": len(cycles)})
}

func visibilityOf(private bool) string {
	if private {
		return "private"
	}
	return "public"
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func queryInt(c *gin.Context, key string, fallback, minValue, maxValue int) int {
	raw := c.Query(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if n < minValue {
		return minValue
	}
	if n > maxValue {
		return maxValue
	}
	return n
}

var errNotIndexed = errors.New("repository is not indexed yet")

func (s *Server) ensureIndexed(repo models.Repository) error {
	if repo.Status != "ready" {
		return errNotIndexed
	}
	return nil
}

func sortStrings(list []string) []string {
	sort.Strings(list)
	return list
}
