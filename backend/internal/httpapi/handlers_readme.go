package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/leknowde/platform/backend/internal/analysis"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

const maxAboutDescription = 350

// handleGetReadme returns a README draft and the About panel for a repository.
// The draft is deterministic; no model provider is required or contacted.
func (s *Server) handleGetReadme(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	facts, err := analysis.BuildFacts(ctx, s.store, repo, repo.DefaultBranch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not assemble repository facts: "+err.Error())
		return
	}
	about := s.aboutFor(ctx, repo, facts, c.Query("source") != "generated")
	title, markdown := analysis.GenerateReadme(facts, about)

	savedDocumentID := ""
	if docs, err := s.store.ListDocuments(ctx, repo.ID); err == nil {
		for _, doc := range docs {
			if doc.Kind == "readme" {
				savedDocumentID = doc.ID
				break
			}
		}
	}

	ok(c, gin.H{
		"title":              title,
		"markdown":           markdown,
		"about":              about,
		"repository":         repo,
		"has_readme":         facts.HasReadme,
		"license_file":       facts.LicenseFile,
		"manifests":          facts.Manifests,
		"saved_document_id":  savedDocumentID,
		"source_fingerprint": analysis.SourceFingerprint(facts),
		"generated_by":       "deterministic",
		"max_topics":         analysis.MaxAboutTopics,
		"max_description":    maxAboutDescription,
	})
}

// handleGetAbout returns the About panel without rendering a README.
func (s *Server) handleGetAbout(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	facts, err := analysis.BuildFacts(ctx, s.store, repo, repo.DefaultBranch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not assemble repository facts.")
		return
	}
	ok(c, s.aboutFor(ctx, repo, facts, c.Query("source") != "generated"))
}

// handleUpdateAbout stores an edited description and topic set.
func (s *Server) handleUpdateAbout(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	var req struct {
		Description string   `json:"description"`
		Topics      []string `json:"topics"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "invalid_request", "Invalid About payload.")
		return
	}
	description := strings.TrimSpace(req.Description)
	if utf8.RuneCountInString(description) > maxAboutDescription {
		fail(c, http.StatusBadRequest, "description_too_long",
			fmt.Sprintf("GitHub limits the About description to %d characters.", maxAboutDescription))
		return
	}
	topics, err := sanitiseTopics(req.Topics)
	if err != nil {
		fail(c, http.StatusBadRequest, "invalid_topics", err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	fingerprint := ""
	if facts, err := analysis.BuildFacts(ctx, s.store, repo, repo.DefaultBranch); err == nil {
		fingerprint = analysis.SourceFingerprint(facts)
	}
	if err := s.store.UpsertRepositoryAbout(ctx, store.RepositoryAbout{
		RepositoryID:      repo.ID,
		Description:       description,
		Topics:            topics,
		SourceFingerprint: fingerprint,
		UpdatedBy:         userID(c),
	}); err != nil {
		fail(c, http.StatusInternalServerError, "store_failed", "Could not save the About metadata.")
		return
	}
	s.audit(c, "repository.about_update", "repository", repo.ID, fmt.Sprintf(`{"topics":%d}`, len(topics)))
	ok(c, gin.H{"description": description, "topics": topics, "source": "saved"})
}

// handleSaveReadme writes the README draft into generated documents.
func (s *Server) handleSaveReadme(c *gin.Context) {
	repo, okRepo := s.requireRepository(c)
	if !okRepo {
		return
	}
	var req struct {
		Overwrite bool   `json:"overwrite"`
		Markdown  string `json:"markdown"`
	}
	_ = c.ShouldBindJSON(&req)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	existing, _ := s.store.ListDocuments(ctx, repo.ID)
	for _, doc := range existing {
		if doc.Kind == "readme" && !req.Overwrite {
			c.JSON(http.StatusConflict, gin.H{
				"error":       "document_exists",
				"message":     "A README document already exists in this workspace. Confirm overwriting to replace it.",
				"document_id": doc.ID,
				"updated_at":  doc.UpdatedAt,
			})
			return
		}
	}

	facts, err := analysis.BuildFacts(ctx, s.store, repo, repo.DefaultBranch)
	if err != nil {
		fail(c, http.StatusInternalServerError, "load_failed", "Could not assemble repository facts.")
		return
	}
	about := s.aboutFor(ctx, repo, facts, true)
	title, markdown := analysis.GenerateReadme(facts, about)
	if strings.TrimSpace(req.Markdown) != "" {
		markdown = req.Markdown
	}

	doc := models.Document{
		RepositoryID:      repo.ID,
		Kind:              "readme",
		Title:             title,
		Path:              "README.md",
		Content:           markdown,
		Status:            "draft",
		SourceFingerprint: analysis.SourceFingerprint(facts),
		CreatedBy:         userID(c),
	}
	for _, d := range existing {
		if d.Kind == "readme" {
			doc.ID = d.ID
		}
	}
	saved, err := s.store.UpsertDocument(ctx, doc)
	if err != nil {
		fail(c, http.StatusInternalServerError, "store_failed", "Could not save the README document.")
		return
	}
	s.audit(c, "document.generate", "repository", repo.ID, `{"kind":"readme"}`)
	c.JSON(http.StatusCreated, gin.H{"document": saved, "about": about, "markdown": markdown})
}

// aboutFor builds generated About metadata and overlays any saved edits.
func (s *Server) aboutFor(ctx context.Context, repo models.Repository, facts analysis.FactSheet, overlaySaved bool) analysis.AboutMetadata {
	about := analysis.BuildAbout(facts)
	if !overlaySaved {
		return about
	}
	saved, err := s.store.GetRepositoryAbout(ctx, repo.ID)
	if err != nil {
		return about
	}
	if strings.TrimSpace(saved.Description) != "" {
		about.Description = saved.Description
	}
	if len(saved.Topics) > 0 {
		about.Topics = saved.Topics
	}
	about.Source = "saved"
	if saved.SourceFingerprint != "" && saved.SourceFingerprint != about.Fingerprint {
		about.Limits = append(about.Limits, "The saved About panel was written against an older index. Regenerate to refresh it.")
	}
	return about
}

// sanitiseTopics enforces GitHub's topic rules: lowercase, hyphenated,
// alphanumeric, unique, at most twenty.
func sanitiseTopics(input []string) ([]string, error) {
	out := []string{}
	seen := map[string]bool{}
	for _, raw := range input {
		topic := analysis.NormaliseTopic(raw)
		if topic == "" {
			if strings.TrimSpace(raw) == "" {
				continue
			}
			return nil, fmt.Errorf("topic %q is not a valid GitHub topic (lowercase letters, numbers and hyphens only, 2-35 characters).", raw)
		}
		if len(topic) > 50 {
			return nil, fmt.Errorf("topic %q exceeds GitHub's 50 character limit.", raw)
		}
		if seen[topic] {
			continue
		}
		seen[topic] = true
		out = append(out, topic)
		if len(out) > analysis.MaxAboutTopics {
			return nil, fmt.Errorf("GitHub allows at most %d topics per repository.", analysis.MaxAboutTopics)
		}
	}
	return out, nil
}
