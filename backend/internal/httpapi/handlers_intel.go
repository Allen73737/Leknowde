package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/leknowde/platform/backend/internal/aiclient"
	"github.com/leknowde/platform/backend/internal/analysis"
	"github.com/leknowde/platform/backend/internal/gitprov"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/retrieval"
)

// ---------------------------------------------------------------------------
// Software health
// ---------------------------------------------------------------------------

func (s *Server) handleHealthReport(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	branch := branchOrDefault(c, repo)
	findings, err := s.store.ListFindings(ctx, repo.ID, c.Query("severity"))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load findings.")
		return
	}
	stats, _ := s.store.RepoStats(ctx, repo.ID, branch)
	rows, err := s.store.DB.QueryContext(ctx, `SELECT COUNT(1), COALESCE(SUM(line_count),0) FROM repository_files WHERE repository_id = ? AND branch = ? AND is_binary = 0`, repo.ID, branch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not compute metrics.")
		return
	}
	var files, lines int
	if rows.Next() {
		_ = rows.Scan(&files, &lines)
	}
	rows.Close()
	cycles, _ := s.store.FindCycles(ctx, repo.ID)
	unused, _ := s.store.UnusedImportCandidates(ctx, repo.ID)
	metrics := analysis.Metrics{
		Files: stats.Files, Lines: stats.Lines, Functions: stats.Functions,
		CircularGroups: len(cycles), DuplicateBlocks: 0,
	}
	for _, f := range findings {
		if f.Kind == "duplication" {
			metrics.DuplicateBlocks++
		}
		if f.Kind == "missing_tests" {
			metrics.UntestedFiles++
		}
	}
	summary := analysis.SummariseHealth(findings, metrics)
	ok(c, gin.H{
		"summary": summary, "findings": findings, "cycles": cycles,
		"unused_import_candidates": unused,
		"stats": stats,
		"analyzed_at": repo.LastIndexedAt,
		"parser": repo.ParserMode,
	})
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

func (s *Server) handleOnboarding(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	branch := branchOrDefault(c, repo)
	plan, err := analysis.BuildOnboarding(c.Request.Context(), s.store, repo, branch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "generation_failed", "Could not generate the onboarding plan: "+err.Error())
		return
	}
	ok(c, plan)
}

// ---------------------------------------------------------------------------
// Digital twin
// ---------------------------------------------------------------------------

func (s *Server) handleTwin(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	rows, err := s.store.DB.QueryContext(ctx, `SELECT kind,
		(SELECT COUNT(1) FROM graph_edges e WHERE e.repository_id = n.repository_id AND (e.from_key = n.key OR e.to_key = n.key))
		AS degree, COUNT(1) FROM graph_nodes n WHERE n.repository_id = ? GROUP BY kind ORDER BY COUNT(1) DESC`, repo.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not read the digital twin.")
		return
	}
	kinds := []map[string]any{}
	for rows.Next() {
		var kind string
		var degree, count int
		if err := rows.Scan(&kind, &degree, &count); err != nil {
			break
		}
		kinds = append(kinds, map[string]any{"kind": kind, "count": count, "edges": degree})
	}
	rows.Close()
	graph, err := s.store.LoadGraph(ctx, repo.ID, nil, nil, queryInt(c, "limit", 250, 10, 2000))
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load the twin graph.")
		return
	}
	if nodeKey := c.Query("node"); nodeKey != "" {
		graph = subgraphAround(graph, nodeKey, 2)
	}
	nodes, edges, _ := s.store.GraphStats(ctx, repo.ID)
	ok(c, gin.H{
		"nodes": nodes, "edges": edges, "kinds": kinds, "graph": graph,
		"repository": gin.H{"id": repo.ID, "full_name": repo.FullName, "branch": repo.DefaultBranch, "status": repo.Status, "parser": repo.ParserMode},
	})
}

func subgraphAround(g models.Graph, seed string, hops int) models.Graph {
	keep := map[string]bool{seed: true}
	frontier := []string{seed}
	adj := map[string][]string{}
	for _, e := range g.Edges {
		adj[e.From] = append(adj[e.From], e.To)
		adj[e.To] = append(adj[e.To], e.From)
	}
	for i := 0; i < hops; i++ {
		next := []string{}
		for _, n := range frontier {
			for _, m := range adj[n] {
				if !keep[m] {
					keep[m] = true
					next = append(next, m)
				}
			}
		}
		frontier = next
	}
	out := models.Graph{Nodes: []models.GraphNode{}, Edges: []models.GraphEdge{}}
	for _, n := range g.Nodes {
		if keep[n.Key] {
			out.Nodes = append(out.Nodes, n)
		}
	}
	for _, e := range g.Edges {
		if keep[e.From] && keep[e.To] {
			out.Edges = append(out.Edges, e)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Change impact
// ---------------------------------------------------------------------------

func (s *Server) handleListImpact(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	reports, err := s.store.ListImpactReports(c.Request.Context(), repo.ID, 20)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load impact reports.")
		return
	}
	ok(c, gin.H{"reports": reports})
}

func (s *Server) handleCreateImpact(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	var req struct {
		Request string `json:"request" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(strings.TrimSpace(req.Request)) < 6 {
		fail(c, http.StatusBadRequest, "invalid_request", "Describe the proposed change in at least a few words.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	payload, err := analysis.BuildImpact(ctx, s.store, repo, repo.DefaultBranch, req.Request)
	if err != nil {
		fail(c, http.StatusInternalServerError, "analysis_failed", "Impact analysis failed: "+err.Error())
		return
	}

	// Optional narrative from the AI service. Deterministic findings are never
	// replaced by model output; the narrative is additive and labelled.
	narrative := map[string]any{}
	narrativeStatus := "unavailable"
	if len(payload.Seeds) > 0 {
		seeds := make([]aiclient.ImpactSeed, 0, len(payload.Seeds))
		for _, sd := range payload.Seeds {
			seeds = append(seeds, aiclient.ImpactSeed{Key: sd.Key, Label: sd.Label, Kind: sd.Kind, FilePath: sd.FilePath})
		}
		impacts := make([]aiclient.ImpactSeed, 0, len(payload.AffectedFiles))
		for _, f := range payload.AffectedFiles {
			impacts = append(impacts, aiclient.ImpactSeed{Key: "file:" + f.Path, Label: f.Path, Kind: "file", FilePath: f.Path, Depth: f.Depth, Via: f.Via})
		}
		evidence := make([]aiclient.EvidenceRef, 0, len(payload.Evidence))
		for _, e := range payload.Evidence {
			evidence = append(evidence, aiclient.EvidenceRef{FilePath: e.FilePath, StartLine: e.StartLine, EndLine: e.EndLine, Symbol: e.Symbol, Snippet: e.Snippet, Reason: e.Reason, Kind: e.Kind})
		}
		history := []string{}
		for _, c := range payload.Commits {
			history = append(history, c.SHA+" "+c.Message)
		}
		stats, _ := s.store.RepoStats(ctx, repo.ID, repo.DefaultBranch)
		languages := stats.Languages
		if languages == nil {
			languages = map[string]int{}
		}
		resp, err := s.ai.ImpactNarrative(ctx, aiclient.ImpactRequest{
			Request: req.Request,
			Repository: aiclient.RepoContext{ID: repo.ID, FullName: repo.FullName, Branch: repo.DefaultBranch, Language: repo.Language,
				FileCount: stats.Files, SymbolCount: stats.Symbols, Languages: languages},
			Seeds: seeds, Impacts: impacts, Evidence: evidence, Tests: payload.ExistingTests, History: history,
		})
		if err != nil {
			narrativeStatus = "unavailable: " + err.Error()
		} else {
			narrativeStatus = "generated"
			narrative = map[string]any{
				"summary": resp.Summary, "risk_level": resp.RiskLevel, "risk_rationale": resp.RiskRationale,
				"implementation_plan": resp.ImplementationPlan, "test_recommendations": resp.TestRecommendations,
				"rollback_considerations": resp.Rollback, "documentation_updates": resp.Documentation,
				"uncertainty": resp.Uncertainty, "model": resp.Model, "provider": resp.Provider, "confidence": resp.Confidence,
			}
		}
	}
	payloadMap := map[string]any{}
	raw, _ := json.Marshal(payload)
	_ = json.Unmarshal(raw, &payloadMap)
	payloadMap["ai_narrative"] = narrative
	payloadMap["ai_narrative_status"] = narrativeStatus
	encoded, _ := json.Marshal(payloadMap)

	report, err := s.store.CreateImpactReport(ctx, models.ImpactReport{
		RepositoryID: repo.ID, UserID: userID(c), Title: titleFromRequest(req.Request), Request: req.Request,
		Summary: payload.Risk.Rationale, RiskLevel: payload.Risk.Level, RiskRationale: payload.Risk.Rationale,
		Payload: string(encoded), Confidence: "deterministic",
	})
	if err != nil {
		fail(c, http.StatusInternalServerError, "store_failed", "Analysis completed but the report could not be saved.")
		return
	}
	s.audit(c, "impact.create", "repository", repo.ID, `{"risk":"`+payload.Risk.Level+`"}`)
	c.JSON(http.StatusCreated, gin.H{"report": report, "analysis": payloadMap})
}

func titleFromRequest(req string) string {
	cleaned := strings.TrimSpace(req)
	if len(cleaned) > 72 {
		cleaned = cleaned[:72] + "…"
	}
	return cleaned
}

func (s *Server) handleGetImpact(c *gin.Context) {
	report, err := s.store.GetImpactReport(c.Request.Context(), c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Impact report not found.")
		return
	}
	if _, err := s.store.RepositoryForUser(c.Request.Context(), report.RepositoryID, userID(c)); err != nil {
		fail(c, http.StatusForbidden, "forbidden", "You do not have access to this report.")
		return
	}
	var payload any
	_ = json.Unmarshal([]byte(report.Payload), &payload)
	report.Payload = ""
	ok(c, gin.H{"report": report, "analysis": payload})
}

// ---------------------------------------------------------------------------
// Living documentation
// ---------------------------------------------------------------------------

func (s *Server) handleListDocuments(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx := c.Request.Context()
	docs, err := s.store.ListDocuments(ctx, repo.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load documents.")
		return
	}
	facts, err := analysis.BuildFacts(ctx, s.store, repo, repo.DefaultBranch)
	current := ""
	if err == nil {
		current = analysis.SourceFingerprint(facts)
	}
	for i := range docs {
		drift := docs[i].SourceFingerprint != "" && current != "" && docs[i].SourceFingerprint != current
		docs[i].Drift = fmt.Sprintf(`{"drifted":%t,"checked":true}`, drift)
	}
	ok(c, gin.H{"documents": docs, "kinds": analysis.DocumentKinds, "source_fingerprint": current})
}

func (s *Server) handleGenerateDocument(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	var req struct {
		Kind      string `json:"kind" binding:"required"`
		Overwrite bool   `json:"overwrite"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "A document kind is required.")
		return
	}
	known := false
	for _, k := range analysis.DocumentKinds {
		if k.Kind == req.Kind {
			known = true
			break
		}
	}
	if !known {
		fail(c, http.StatusBadRequest, "unknown_kind", "Unsupported document kind.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	facts, err := analysis.BuildFacts(ctx, s.store, repo, repo.DefaultBranch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "generation_failed", "Could not assemble repository facts.")
		return
	}
	existing, _ := s.store.ListDocuments(ctx, repo.ID)
	for _, d := range existing {
		if d.Kind == req.Kind && !req.Overwrite {
			c.JSON(http.StatusConflict, gin.H{
				"error": "document_exists", "message": "A document of this kind already exists. Confirm overwriting to regenerate it.",
				"document_id": d.ID, "updated_at": d.UpdatedAt,
			})
			return
		}
	}

	title, markdown := analysis.GenerateLocalDoc(req.Kind, facts)
	generated := false
	note := "Generated from indexed source using the deterministic documentation engine."
	provider := "leknowde-local"

	evidence := []aiclient.EvidenceRef{}
	for i, f := range facts.KeyFiles {
		if i >= 8 {
			break
		}
		evidence = append(evidence, aiclient.EvidenceRef{FilePath: f.Path, Symbol: "", Reason: f.Role, Snippet: "", Kind: "structure"})
	}
	docFacts := aiclient.DocFacts{
		EntryPoints: facts.EntryPoints, Modules: facts.Modules, Endpoints: facts.Endpoints, Entities: facts.Entities,
		Languages: facts.Languages, Symbols: []string{}, Tests: facts.Tests, PackageJSON: []string{},
		Stats: map[string]int{"files": facts.Stats.Files, "lines": facts.Stats.Lines, "symbols": facts.Stats.Symbols, "functions": facts.Stats.Functions, "apis": facts.Stats.APIs},
	}
	if resp, err := s.ai.GenerateDoc(ctx, aiclient.DocRequest{
		Kind: req.Kind, Repository: aiclient.RepoContext{ID: repo.ID, FullName: repo.FullName, Branch: repo.DefaultBranch, Language: repo.Language, FileCount: facts.Stats.Files, SymbolCount: facts.Stats.Symbols, Languages: facts.Languages},
		Facts: docFacts, Evidence: evidence,
	}); err == nil && resp.Generated && strings.TrimSpace(resp.Markdown) != "" {
		title = firstNonEmpty(resp.Title, title)
		markdown = resp.Markdown
		generated = true
		provider = resp.Provider
		note = resp.Note
	} else if err != nil {
		note = "AI provider unavailable for prose generation; document produced from verified structural facts only. (" + err.Error() + ")"
	}

	doc := models.Document{
		RepositoryID: repo.ID, Kind: req.Kind, Title: title,
		Path:  "docs/" + req.Kind + ".md",
		Content: markdown, Status: "draft",
		SourceFingerprint: analysis.SourceFingerprint(facts),
		CreatedBy:         userID(c),
	}
	for _, d := range existing {
		if d.Kind == req.Kind {
			doc.ID = d.ID
			doc.Status = "draft"
		}
	}
	saved, err := s.store.UpsertDocument(ctx, doc)
	if err != nil {
		fail(c, http.StatusInternalServerError, "store_failed", "Could not save the document.")
		return
	}
	s.audit(c, "document.generate", "repository", repo.ID, `{"kind":"`+req.Kind+`"}`)
	c.JSON(http.StatusCreated, gin.H{"document": saved, "generated_by_model": generated, "provider": provider, "note": note})
}

func (s *Server) handleGetDocument(c *gin.Context) {
	doc, err := s.store.GetDocument(c.Request.Context(), c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Document not found.")
		return
	}
	repo, err := s.store.RepositoryForUser(c.Request.Context(), doc.RepositoryID, userID(c))
	if err != nil {
		fail(c, http.StatusForbidden, "forbidden", "You do not have access to this document.")
		return
	}
	facts, ferr := analysis.BuildFacts(c.Request.Context(), s.store, repo, repo.DefaultBranch)
	drift := false
	if ferr == nil {
		drift = doc.SourceFingerprint != analysis.SourceFingerprint(facts)
	}
	ok(c, gin.H{"document": doc, "drifted": drift, "repository": repo})
}

func (s *Server) handleUpdateDocument(c *gin.Context) {
	doc, err := s.store.GetDocument(c.Request.Context(), c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Document not found.")
		return
	}
	if _, err := s.store.RepositoryForUser(c.Request.Context(), doc.RepositoryID, userID(c)); err != nil {
		fail(c, http.StatusForbidden, "forbidden", "You do not have access to this document.")
		return
	}
	var req struct {
		Content string `json:"content"`
		Title   string `json:"title"`
		Status  string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Invalid document payload.")
		return
	}
	status := req.Status
	if status != "published" && status != "draft" && status != "archived" {
		status = doc.Status
	}
	content := req.Content
	if content == "" {
		content = doc.Content
	}
	if err := s.store.UpdateDocumentContent(c.Request.Context(), doc.ID, content, status); err != nil {
		fail(c, http.StatusInternalServerError, "update_failed", "Could not update the document.")
		return
	}
	s.audit(c, "document.update", "document", doc.ID, "{}")
	ok(c, gin.H{"status": "updated", "document_status": status})
}

func (s *Server) handleDeleteDocument(c *gin.Context) {
	doc, err := s.store.GetDocument(c.Request.Context(), c.Param("id"))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Document not found.")
		return
	}
	if _, err := s.store.RepositoryForUser(c.Request.Context(), doc.RepositoryID, userID(c)); err != nil {
		fail(c, http.StatusForbidden, "forbidden", "You do not have access to this document.")
		return
	}
	if err := s.store.DeleteDocument(c.Request.Context(), doc.ID); err != nil {
		fail(c, http.StatusInternalServerError, "delete_failed", "Could not delete the document.")
		return
	}
	s.audit(c, "document.delete", "document", doc.ID, "{}")
	ok(c, gin.H{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Repository Q&A
// ---------------------------------------------------------------------------

func (s *Server) handleListConversations(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	list, err := s.store.ListConversations(c.Request.Context(), repo.ID, userID(c), 30)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load conversations.")
		return
	}
	ok(c, gin.H{"conversations": list})
}

func (s *Server) handleCreateConversation(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	conv, err := s.store.CreateConversation(c.Request.Context(), userID(c), repo.WorkspaceID, repo.ID, "New conversation")
	if err != nil {
		fail(c, http.StatusInternalServerError, "create_failed", "Could not create the conversation.")
		return
	}
	c.JSON(http.StatusCreated, conv)
}

func (s *Server) handleListMessages(c *gin.Context) {
	conv, err := s.store.GetConversation(c.Request.Context(), c.Param("id"), userID(c))
	if err != nil {
		fail(c, http.StatusNotFound, "not_found", "Conversation not found.")
		return
	}
	messages, err := s.store.ListMessages(c.Request.Context(), conv.ID, 200)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not load messages.")
		return
	}
	ok(c, gin.H{"conversation": conv, "messages": messages})
}

func (s *Server) handleChat(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	var req struct {
		Question       string `json:"question" binding:"required"`
		ConversationID string `json:"conversation_id"`
		Task           string `json:"task"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(strings.TrimSpace(req.Question)) < 2 {
		fail(c, http.StatusBadRequest, "invalid_request", "Ask a question about this repository.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 150*time.Second)
	defer cancel()

	convID := req.ConversationID
	if convID == "" {
		conv, err := s.store.CreateConversation(ctx, userID(c), repo.WorkspaceID, repo.ID, titleFromRequest(req.Question))
		if err != nil {
			fail(c, http.StatusInternalServerError, "create_failed", "Could not start a conversation.")
			return
		}
		convID = conv.ID
	} else if _, err := s.store.GetConversation(ctx, convID, userID(c)); err != nil {
		fail(c, http.StatusNotFound, "not_found", "Conversation not found.")
		return
	}

	// Retrieval always runs: evidence is useful even without an LLM.
	found, err := retrieval.Search(ctx, s.store, repo.ID, repo.DefaultBranch, req.Question, 10)
	if err != nil {
		fail(c, http.StatusInternalServerError, "retrieval_failed", "Could not retrieve source evidence.")
		return
	}
	userMessage, _ := s.store.AddMessage(ctx, models.Message{Role: "user", Content: req.Question}, convID)

	history := []aiclient.ChatMessage{}
	if prior, err := s.store.ListMessages(ctx, convID, 8); err == nil {
		for _, m := range prior {
			if m.ID == userMessage.ID {
				continue
			}
			history = append(history, aiclient.ChatMessage{Role: m.Role, Content: m.Content})
		}
	}
	evidence := make([]aiclient.EvidenceRef, 0, len(found.Evidence))
	for _, e := range found.Evidence {
		evidence = append(evidence, aiclient.EvidenceRef{FilePath: e.FilePath, StartLine: e.StartLine, EndLine: e.EndLine, Symbol: e.Symbol, Snippet: e.Snippet, Reason: e.Reason, Kind: e.Kind})
	}
	stats, _ := s.store.RepoStats(ctx, repo.ID, repo.DefaultBranch)
	resp, aiErr := s.ai.Chat(ctx, aiclient.ChatRequest{
		Question: req.Question,
		Repository: aiclient.RepoContext{ID: repo.ID, FullName: repo.FullName, Branch: repo.DefaultBranch, Language: repo.Language,
			FileCount: stats.Files, SymbolCount: stats.Symbols, Languages: stats.Languages},
		Evidence: evidence, History: history, Task: req.Task,
	})

	if aiErr != nil {
		ok(c, gin.H{
			"conversation_id": convID,
			"completed":       false,
			"answer":          "",
			"notice":          "Retrieved source evidence, but no AI provider is configured to reason over it. Configure GROQ_API_KEY or GEMINI_API_KEY (or LITELLM_BASE_URL) to enable generated answers.",
			"detail":          aiErr.Error(),
			"evidence":        found.Evidence,
			"symbols":         found.Symbols,
			"strategy":        found.Strategy,
			"candidates":      found.Candidates,
			"confidence":      "insufficient",
		})
		return
	}

	assistant, err := s.store.AddMessage(ctx, models.Message{
		Role: "assistant", Content: resp.Answer, Evidence: found.Evidence, Uncertainty: resp.Uncertainty,
		Model: resp.Model, TokensIn: resp.TokensIn, TokensOut: resp.TokensOut,
	}, convID)
	if err != nil {
		s.log.Error("store assistant message", "error", err)
	}
	s.store.TouchConversationTitle(ctx, convID, titleFromRequest(req.Question))
	ok(c, gin.H{
		"conversation_id": convID,
		"message":         assistant,
		"answer":          resp.Answer,
		"completed":       true,
		"evidence":        found.Evidence,
		"symbols":         found.Symbols,
		"strategy":        found.Strategy,
		"candidates":      found.Candidates,
		"confidence":      resp.Confidence,
		"uncertainty":     resp.Uncertainty,
		"model":           resp.Model,
		"provider":        resp.Provider,
		"tokens":          gin.H{"in": resp.TokensIn, "out": resp.TokensOut},
		"grounded":        resp.Grounded,
	})
}

// ---------------------------------------------------------------------------
// Pull request intelligence
// ---------------------------------------------------------------------------

func (s *Server) handlePullRequests(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	provider, err := gitprov.New(repo.Provider)
	if err != nil {
		fail(c, http.StatusBadRequest, "unsupported_provider", "Unsupported provider.")
		return
	}
	token := "demo"
	if repo.Provider != "demo" {
		orgIDValue, _ := s.store.WorkspaceOrgID(c.Request.Context(), repo.WorkspaceID)
		stored, _, err := s.store.IntegrationToken(c.Request.Context(), orgIDValue, repo.Provider)
		if err != nil {
			fail(c, http.StatusBadRequest, "not_connected", "Connect "+repo.Provider+" to read pull requests.")
			return
		}
		token = stored
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	prs, err := provider.ListPullRequests(ctx, token, repo.Owner, repo.Name, c.DefaultQuery("state", "open"))
	if err != nil {
		fail(c, http.StatusBadGateway, "provider_error", providerErrorMessage(err))
		return
	}
	ok(c, gin.H{"pull_requests": prs, "provider": repo.Provider, "demo": repo.Provider == "demo"})
}

type prAnalysis struct {
	Number       int                    `json:"number"`
	Title        string                 `json:"title"`
	Files        []gitprov.PullFile     `json:"files"`
	ChangedPaths []string               `json:"changed_paths"`
	Modules      []string               `json:"modules"`
	Impact       []map[string]any       `json:"impact"`
	Risk         analysis.RiskAssessment `json:"risk"`
	MissingTests []string               `json:"missing_tests"`
	Recommendations []string            `json:"review_recommendations"`
	Evidence     []models.Evidence      `json:"evidence"`
	Uncertainty  []string               `json:"uncertainty"`
}

func (s *Server) handleAnalyzePR(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	number := queryInt(c, "number", 0, 1, 1_000_000)
	if number == 0 {
		fail(c, http.StatusBadRequest, "invalid_request", "A pull request number is required.")
		return
	}
	provider, err := gitprov.New(repo.Provider)
	if err != nil {
		fail(c, http.StatusBadRequest, "unsupported_provider", "Unsupported provider.")
		return
	}
	token := "demo"
	if repo.Provider != "demo" {
		orgIDValue, _ := s.store.WorkspaceOrgID(c.Request.Context(), repo.WorkspaceID)
		stored, _, err := s.store.IntegrationToken(c.Request.Context(), orgIDValue, repo.Provider)
		if err != nil {
			fail(c, http.StatusBadRequest, "not_connected", "Connect "+repo.Provider+" to analyse pull requests.")
			return
		}
		token = stored
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
	defer cancel()
	files, err := provider.GetPullRequestFiles(ctx, token, repo.Owner, repo.Name, number)
	if err != nil {
		fail(c, http.StatusBadGateway, "provider_error", providerErrorMessage(err))
		return
	}
	out := prAnalysis{Number: number, Files: files, ChangedPaths: []string{}, Modules: []string{}, Impact: []map[string]any{}, MissingTests: []string{}, Recommendations: []string{}, Evidence: []models.Evidence{}, Uncertainty: []string{}}
	seeds := []string{}
	for _, f := range files {
		out.ChangedPaths = append(out.ChangedPaths, f.Path)
		seeds = append(seeds, "file:"+f.Path)
	}
	impacts, err := s.store.ReverseClosure(ctx, repo.ID, seeds, 4, 120)
	if err == nil {
		for _, im := range impacts {
			if im.Kind == "file" {
				out.Impact = append(out.Impact, map[string]any{"path": strings.TrimPrefix(im.Key, "file:"), "depth": im.Depth, "via": im.Via})
			}
		}
	}
	tests, _ := s.store.TestsForPaths(ctx, repo.ID, out.ChangedPaths)
	out.MissingTests = append(out.MissingTests, tests...)
	for _, f := range files {
		if !strings.Contains(strings.ToLower(f.Path), "test") {
			covered := false
			for _, t := range tests {
				if strings.Contains(strings.ToLower(t), strings.ToLower(strings.TrimSuffix(strings.Split(f.Path, "/")[len(strings.Split(f.Path, "/"))-1], ".ts"))) {
					covered = true
					break
				}
			}
			if !covered {
				out.MissingTests = appendUniqueString(out.MissingTests, f.Path)
			}
		}
		mdl := moduleOfPath(f.Path)
		out.Modules = appendUniqueString(out.Modules, mdl)
		patchSnippet := f.Patch
		if len(patchSnippet) > 1200 {
			patchSnippet = patchSnippet[:1200]
		}
		out.Evidence = append(out.Evidence, models.Evidence{FilePath: f.Path, Snippet: patchSnippet, Kind: "pull_request_diff", Reason: f.Status + " — " + fmt.Sprint(f.Additions) + " additions, " + fmt.Sprint(f.Deletions) + " deletions"})
	}
	// Reuse the deterministic risk model with a synthetic payload.
	payload := analysis.ImpactPayload{AffectedFiles: []analysis.AffectedFile{}, ExistingTests: tests, AffectedAPIs: []analysis.AffectedAPI{}}
	for _, f := range out.Impact {
		payload.AffectedFiles = append(payload.AffectedFiles, analysis.AffectedFile{Path: fmt.Sprint(f["path"]), Depth: toInt(f["depth"])})
	}
	out.Risk = analysis.ScorePullRequestRisk(len(files), len(out.Impact), len(tests), len(out.Modules))
	for _, f := range files {
		if f.Deletions > 200 {
			out.Recommendations = append(out.Recommendations, "Large deletion in "+f.Path+" — confirm the removed behaviour is not relied on by external consumers.")
		}
		if f.Status == "added" && !strings.Contains(strings.ToLower(f.Path), "test") {
			out.Recommendations = append(out.Recommendations, "New source file "+f.Path+" has no accompanying test in this pull request.")
		}
	}
	if len(out.Impact) > 15 {
		out.Recommendations = append(out.Recommendations, "This change reaches more than 15 dependent files. Consider splitting it or shipping behind a flag.")
	}
	if len(out.Recommendations) == 0 {
		out.Recommendations = append(out.Recommendations, "No high-signal concerns detected from static dependency data. Review the diff for logic correctness.")
	}
	out.Uncertainty = append(out.Uncertainty, "Pull request impact uses static dependency relationships and the diff file list only. Runtime behaviour is not executed.")
	if repo.Provider == "demo" {
		out.Uncertainty = append(out.Uncertainty, "This is the bundled demo dataset; pull request metadata is an illustrative fixture.")
	}
	s.audit(c, "pull_request.analyze", "repository", repo.ID, "{}")
	ok(c, out)
}

func moduleOfPath(p string) string {
	parts := strings.Split(strings.ReplaceAll(p, "\\", "/"), "/")
	if len(parts) >= 3 && (parts[0] == "src" || parts[0] == "server" || parts[0] == "web" || parts[0] == "app") {
		return parts[0] + "/" + parts[1]
	}
	if len(parts) >= 2 {
		return parts[0]
	}
	return "root"
}

func appendUniqueString(list []string, v string) []string {
	for _, s := range list {
		if s == v {
			return list
		}
	}
	return append(list, v)
}

func toInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case float64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	default:
		return 0
	}
}

func sortedKeys(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
