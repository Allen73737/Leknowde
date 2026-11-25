package httpapi

import (
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/leknowde/platform/backend/internal/analysis"
	"github.com/leknowde/platform/backend/internal/check"
	"github.com/leknowde/platform/backend/internal/contracts"
	"github.com/leknowde/platform/backend/internal/store"
)

func (s *Server) handleListContracts(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	list, err := s.store.ListAPIContracts(ctx, repo.ID, branch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load API contracts.")
		return
	}
	producers := []contracts.Contract{}
	consumers := []contracts.Contract{}
	for _, item := range list {
		item.RepositoryName = repo.FullName
		if item.Direction == contracts.DirectionProducer {
			producers = append(producers, item)
		} else {
			consumers = append(consumers, item)
		}
	}
	surface := contracts.Match(producers, consumers)
	producerMaps := []map[string]any{}
	for _, p := range surface.Producers {
		producerMaps = append(producerMaps, map[string]any{
			"id": p.ID, "repository_id": p.RepositoryID, "repository_name": p.RepositoryName,
			"branch": p.Branch, "commit_sha": p.CommitSHA, "direction": p.Direction,
			"method": p.Method, "path": p.Path, "normalized_path": p.NormalizedPath,
			"operation": p.Operation, "file_path": p.FilePath, "line": p.Line,
			"handler": p.Handler, "source": p.Source,
		})
	}
	consumerMaps := []map[string]any{}
	for _, c := range surface.Consumers {
		consumerMaps = append(consumerMaps, map[string]any{
			"id": c.ID, "repository_id": c.RepositoryID, "repository_name": c.RepositoryName,
			"branch": c.Branch, "commit_sha": c.CommitSHA, "direction": c.Direction,
			"method": c.Method, "path": c.Path, "normalized_path": c.NormalizedPath,
			"operation": c.Operation, "file_path": c.FilePath, "line": c.Line,
			"handler": c.Handler, "source": c.Source,
		})
	}
	linkMaps := []map[string]any{}
	for _, l := range surface.Links {
		linkMaps = append(linkMaps, map[string]any{
			"producer_repository_id": l.ProducerRepositoryID, "producer_repository_name": l.ProducerRepositoryName,
			"producer_file": l.ProducerFile, "producer_line": l.ProducerLine,
			"consumer_repository_id": l.ConsumerRepositoryID, "consumer_repository_name": l.ConsumerRepositoryName,
			"consumer_file": l.ConsumerFile, "consumer_line": l.ConsumerLine,
			"method": l.Method, "path": l.Path, "operation": l.Operation,
			"match": l.Match, "confidence": l.Confidence, "cross_repository": l.CrossRepository,
		})
	}
	unmatchedMaps := []map[string]any{}
	for _, c := range surface.Unmatched {
		unmatchedMaps = append(unmatchedMaps, map[string]any{
			"id": c.ID, "repository_id": c.RepositoryID, "repository_name": c.RepositoryName,
			"branch": c.Branch, "commit_sha": c.CommitSHA, "direction": c.Direction,
			"method": c.Method, "path": c.Path, "normalized_path": c.NormalizedPath,
			"operation": c.Operation, "file_path": c.FilePath, "line": c.Line,
			"handler": c.Handler, "source": c.Source,
		})
	}
	orphanMaps := []map[string]any{}
	for _, c := range surface.OrphanProducers {
		orphanMaps = append(orphanMaps, map[string]any{
			"id": c.ID, "repository_id": c.RepositoryID, "repository_name": c.RepositoryName,
			"branch": c.Branch, "commit_sha": c.CommitSHA, "direction": c.Direction,
			"method": c.Method, "path": c.Path, "normalized_path": c.NormalizedPath,
			"operation": c.Operation, "file_path": c.FilePath, "line": c.Line,
			"handler": c.Handler, "source": c.Source,
		})
	}
	sort.Slice(producerMaps, func(i, j int) bool { return producerMaps[i]["operation"].(string) < producerMaps[j]["operation"].(string) })
	sort.Slice(consumerMaps, func(i, j int) bool {
		if consumerMaps[i]["file_path"].(string) != consumerMaps[j]["file_path"].(string) {
			return consumerMaps[i]["file_path"].(string) < consumerMaps[j]["file_path"].(string)
		}
		return consumerMaps[i]["operation"].(string) < consumerMaps[j]["operation"].(string)
	})
	sort.Slice(linkMaps, func(i, j int) bool { return linkMaps[i]["operation"].(string) < linkMaps[j]["operation"].(string) })
	sort.Slice(unmatchedMaps, func(i, j int) bool {
		if unmatchedMaps[i]["repository_name"].(string) != unmatchedMaps[j]["repository_name"].(string) {
			return unmatchedMaps[i]["repository_name"].(string) < unmatchedMaps[j]["repository_name"].(string)
		}
		return unmatchedMaps[i]["file_path"].(string) < unmatchedMaps[j]["file_path"].(string)
	})
	sort.Slice(orphanMaps, func(i, j int) bool {
		if orphanMaps[i]["repository_name"].(string) != orphanMaps[j]["repository_name"].(string) {
			return orphanMaps[i]["repository_name"].(string) < orphanMaps[j]["repository_name"].(string)
		}
		return orphanMaps[i]["operation"].(string) < orphanMaps[j]["operation"].(string)
	})
	ok(c, gin.H{
		"repository":          repo,
		"branch":              branch,
		"producers":           producerMaps,
		"consumers":           consumerMaps,
		"links":               linkMaps,
		"unmatched_consumers": unmatchedMaps,
		"orphan_producers":    orphanMaps,
		"totals":              gin.H{"producers": len(surface.Producers), "consumers": len(surface.Consumers)},
		"cross_repo_links":    surface.CrossRepoLinks,
		"analyzed_at":         repo.LastIndexedAt,
		"limitations":         surface.Limitations,
	})
}

func (s *Server) handleContractDiff(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	base := c.Query("base")
	head := c.Query("head")
	if base == "" || head == "" {
		fail(c, http.StatusBadRequest, "invalid_request", "Both ?base= and ?head= branches/commits are required.")
		return
	}
	diff, err := analysis.BuildContractDiff(ctx, s.store, repo, base, head)
	if err != nil {
		fail(c, http.StatusInternalServerError, "analysis_failed", "Contract diff failed: "+err.Error())
		return
	}
	ok(c, diff)
}

func (s *Server) handleListSnapshots(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := c.Query("branch")
	list, err := s.store.ListArchitectureSnapshots(ctx, repo.ID, branch, 40)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load architecture snapshots.")
		return
	}
	out := []map[string]any{}
	for _, snap := range list {
		out = append(out, map[string]any{
			"id": snap.ID, "repository_id": snap.RepositoryID, "branch": snap.Branch,
			"commit_sha": snap.CommitSHA, "label": snap.Label, "created_at": snap.CreatedAt,
			"nodes": snap.Nodes, "edges": snap.Edges, "files": snap.Files, "modules": snap.Modules,
			"api_producers": snap.Producers, "api_consumers": snap.Consumers, "cycles": snap.Cycles,
		})
	}
	ok(c, gin.H{"repository": repo, "snapshots": out})
}

func (s *Server) handleCreateSnapshot(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := c.DefaultQuery("branch", repo.DefaultBranch)
	label := strings.TrimSpace(c.PostForm("label"))
	if label == "" {
		var body struct{ Label string `json:"label"` }
		_ = c.ShouldBindJSON(&body)
		label = strings.TrimSpace(body.Label)
	}
	snap, err := s.store.CreateArchitectureSnapshot(ctx, repo.ID, branch, repo.LastIndexedCommit, label)
	if err != nil {
		fail(c, http.StatusInternalServerError, "snapshot_failed", "Could not create the architecture snapshot: "+err.Error())
		return
	}
	s.audit(c, "snapshot.create", "repository", repo.ID, `{"branch":"`+branch+`","label":"`+label+`"}`)
	c.JSON(http.StatusCreated, gin.H{"snapshot": snap})
}

func (s *Server) handleGetSnapshot(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	snap, err := s.store.GetArchitectureSnapshot(ctx, c.Param("snapshotID"))
	if err != nil {
		if err == store.ErrNotFound {
			fail(c, http.StatusNotFound, "not_found", "Snapshot not found.")
			return
		}
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load the snapshot.")
		return
	}
	if snap.RepositoryID != repo.ID {
		fail(c, http.StatusForbidden, "forbidden", "You do not have access to this snapshot.")
		return
	}
	ok(c, gin.H{"snapshot": snap})
}

func (s *Server) handleArchitectureDiff(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	baseSelector := c.Query("base")
	headSelector := c.Query("head")
	branch := c.Query("branch")
	if baseSelector == "" || headSelector == "" {
		fail(c, http.StatusBadRequest, "invalid_request", "Both ?base= and ?head= snapshot selectors are required.")
		return
	}
	baseSnap, err := s.store.ResolveSnapshot(ctx, repo.ID, baseSelector, branch)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Base snapshot not found.")
		return
	}
	headSnap, err := s.store.ResolveSnapshot(ctx, repo.ID, headSelector, branch)
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Head snapshot not found.")
		return
	}
	diff := analysis.CompareSnapshots(baseSnap, headSnap)
	ok(c, gin.H{"repository": repo, "diff": diff})
}

func (s *Server) handleOwnership(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	report, err := analysis.BuildOwnership(ctx, s.store, repo, branch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "analysis_failed", "Ownership analysis failed: "+err.Error())
		return
	}
	ok(c, report)
}

func (s *Server) handleTestSelect(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	var req struct {
		Changed []string `json:"changed"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Changed) == 0 {
		fail(c, http.StatusBadRequest, "invalid_request", "A non-empty changed[] list of repository-relative paths is required.")
		return
	}
	selection, err := analysis.SelectTests(ctx, s.store, repo, branch, req.Changed)
	if err != nil {
		fail(c, http.StatusInternalServerError, "analysis_failed", "Test selection failed: "+err.Error())
		return
	}
	s.audit(c, "test_select.create", "repository", repo.ID, fmt.Sprintf(`{"changed":%q,"runner":%q}`, strings.Join(req.Changed, ","), selection.Runner))
	ok(c, selection)
}

func (s *Server) handleWorkspaceContracts(c *gin.Context) {
	workspaceID := c.Param("id")
	_, err := s.store.GetWorkspace(c.Request.Context(), workspaceID, userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Workspace not found or you are not a member.")
		return
	}
	ctx := c.Request.Context()
	branch := c.Query("branch")
	surface, err := analysis.BuildWorkspaceContracts(ctx, s.store, workspaceID, branch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "analysis_failed", "Workspace contracts failed: "+err.Error())
		return
	}
	ok(c, surface)
}

// ---------------------------------------------------------------------------
// Deterministic CI gate exposed through the API
// ---------------------------------------------------------------------------

type checkRule struct {
	Name string `json:"name" binding:"required"`
	Value string `json:"value" binding:"required"`
}

func (s *Server) handleCheck(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	var req struct {
		Policy         []checkRule `json:"policy"`
		FailOn         string      `json:"fail_on"`
		MinHealth      *int        `json:"min_health"`
		MaxCycles      *int        `json:"max_cycles"`
		MinBusFactor   *int        `json:"min_bus_factor"`
		RequireDocCurrent *bool     `json:"require_doc_current"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "A policy body is required.")
		return
	}
	cfg := check.DefaultConfig()
	for _, rule := range req.Policy {
		switch rule.Name {
		case "fail_on":
			cfg.FailOn = rule.Value
		case "min_health":
			if n, err := parseInt(rule.Value); err == nil {
				cfg.MinHealth = n
			}
		case "max_cycles":
			if n, err := parseInt(rule.Value); err == nil {
				cfg.MaxCycles = n
			}
		case "min_bus_factor":
			if n, err := parseInt(rule.Value); err == nil {
				cfg.MinBusFactor = n
			}
		case "require_doc_current":
			cfg.RequireDocCurrent = rule.Value == "true"
		}
	}
	if req.FailOn != "" {
		cfg.FailOn = req.FailOn
	}
	if req.MinHealth != nil {
		cfg.MinHealth = *req.MinHealth
	}
	if req.MaxCycles != nil {
		cfg.MaxCycles = *req.MaxCycles
	}
	if req.MinBusFactor != nil {
		cfg.MinBusFactor = *req.MinBusFactor
	}
	if req.RequireDocCurrent != nil {
		cfg.RequireDocCurrent = *req.RequireDocCurrent
	}
	result, err := check.Evaluate(ctx, s.store, repo, branch, cfg)
	if err != nil {
		fail(c, http.StatusInternalServerError, "check_failed", "Check failed: "+err.Error())
		return
	}
	s.audit(c, "check.run", "repository", repo.ID, fmt.Sprintf(`{"verdict":%q,"violations":%d}`, result.Verdict, len(result.Violations)))
	status := http.StatusOK
	if !result.Passed {
		status = http.StatusUnprocessableEntity
	}
	c.JSON(status, result)
}

func parseInt(s string) (int, error) {
	var n int
	_, err := fmt.Sscanf(s, "%d", &n)
	return n, err
}
