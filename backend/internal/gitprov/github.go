package gitprov

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
)

// GitHub talks to the REST API v3 endpoints. Only read scopes are requested.
type GitHub struct {
	client *http.Client
}

func (g *GitHub) Name() string { return "github" }

func (g *GitHub) get(ctx context.Context, token, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "LeKnowde/1.0")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	body, _, err := do(g.client, req)
	return body, err
}

func (g *GitHub) Validate(ctx context.Context, token string) (string, string, error) {
	body, err := g.get(ctx, token, "/user")
	if err != nil {
		return "", "", err
	}
	var user struct {
		Login string `json:"login"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", "", err
	}
	scopes := ""
	req, _ := http.NewRequestWithContext(ctx, http.MethodHead, "https://api.github.com/user", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "LeKnowde/1.0")
	if resp, err := g.client.Do(req); err == nil {
		scopes = resp.Header.Get("X-OAuth-Scopes")
		resp.Body.Close()
	}
	return user.Login, scopes, nil
}

func (g *GitHub) ListRepositories(ctx context.Context, token string) ([]Repo, error) {
	out := []Repo{}
	for page := 1; page <= 3; page++ {
		body, err := g.get(ctx, token, fmt.Sprintf("/user/repos?per_page=100&sort=updated&page=%d&affiliation=owner,collaborator,organization_member", page))
		if err != nil {
			return out, err
		}
		var raw []struct {
			ID            int64  `json:"id"`
			Name          string `json:"name"`
			FullName      string `json:"full_name"`
			Description   string `json:"description"`
			Language      string `json:"language"`
			DefaultBranch string `json:"default_branch"`
			Private       bool   `json:"private"`
			HTMLURL       string `json:"html_url"`
			UpdatedAt     string `json:"updated_at"`
			Owner         struct {
				Login string `json:"login"`
			} `json:"owner"`
		}
		if err := json.Unmarshal(body, &raw); err != nil {
			return out, err
		}
		for _, r := range raw {
			out = append(out, Repo{
				Owner: r.Owner.Login, Name: r.Name, FullName: r.FullName, Description: r.Description,
				Language: r.Language, DefaultBranch: r.DefaultBranch, Private: r.Private, HTMLURL: r.HTMLURL,
				ExternalID: fmt.Sprintf("%d", r.ID), UpdatedAt: r.UpdatedAt,
			})
		}
		if len(raw) < 100 {
			break
		}
	}
	return out, nil
}

func (g *GitHub) GetRepository(ctx context.Context, token, owner, name string) (Repo, error) {
	body, err := g.get(ctx, token, fmt.Sprintf("/repos/%s/%s", url.PathEscape(owner), url.PathEscape(name)))
	if err != nil {
		return Repo{}, err
	}
	var r struct {
		ID            int64  `json:"id"`
		Name          string `json:"name"`
		FullName      string `json:"full_name"`
		Description   string `json:"description"`
		Language      string `json:"language"`
		DefaultBranch string `json:"default_branch"`
		Private       bool   `json:"private"`
		HTMLURL       string `json:"html_url"`
		Owner         struct {
			Login string `json:"login"`
		} `json:"owner"`
	}
	if err := json.Unmarshal(body, &r); err != nil {
		return Repo{}, err
	}
	return Repo{Owner: r.Owner.Login, Name: r.Name, FullName: r.FullName, Description: r.Description, Language: r.Language,
		DefaultBranch: r.DefaultBranch, Private: r.Private, HTMLURL: r.HTMLURL, ExternalID: fmt.Sprintf("%d", r.ID)}, nil
}

func (g *GitHub) ListBranches(ctx context.Context, token, owner, name string) ([]models.Branch, error) {
	body, err := g.get(ctx, token, fmt.Sprintf("/repos/%s/%s/branches?per_page=100", url.PathEscape(owner), url.PathEscape(name)))
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Name   string `json:"name"`
		Commit struct {
			SHA string `json:"sha"`
		} `json:"commit"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]models.Branch, 0, len(raw))
	for _, b := range raw {
		out = append(out, models.Branch{Name: b.Name, HeadSHA: b.Commit.SHA})
	}
	return out, nil
}

func (g *GitHub) ListTree(ctx context.Context, token, owner, name, branch string, maxFiles int) ([]FileEntry, error) {
	body, err := g.get(ctx, token, fmt.Sprintf("/repos/%s/%s/git/trees/%s?recursive=1", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(branch)))
	if err != nil {
		return nil, err
	}
	var raw struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
			SHA  string `json:"sha"`
			Size int    `json:"size"`
		} `json:"tree"`
		Truncated bool `json:"truncated"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := []FileEntry{}
	for _, t := range raw.Tree {
		if t.Type != "blob" {
			continue
		}
		if ShouldSkipPath(t.Path) {
			continue
		}
		if !IsIndexable(DetectLanguage(t.Path)) && DetectLanguage(t.Path) != "Markdown" && DetectLanguage(t.Path) != "JSON" {
			continue
		}
		out = append(out, FileEntry{Path: t.Path, SHA: t.SHA, Size: t.Size})
		if len(out) >= maxFiles {
			break
		}
	}
	return out, nil
}

func (g *GitHub) GetFile(ctx context.Context, token, owner, name, path, ref string, maxBytes int64) (string, error) {
	u := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s?ref=%s", url.PathEscape(owner), url.PathEscape(name), escapePath(path), url.QueryEscape(ref))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github.raw")
	req.Header.Set("User-Agent", "LeKnowde/1.0")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return "", ErrNotFound
	}
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized {
		return "", ErrUnauthorized
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("github returned %d for %s", resp.StatusCode, path)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes))
	if err != nil {
		return "", err
	}
	if !strings.Contains(resp.Header.Get("Content-Type"), "text") && !strings.Contains(resp.Header.Get("Content-Type"), "json") && !strings.Contains(resp.Header.Get("Content-Type"), "javascript") && !strings.Contains(resp.Header.Get("Content-Type"), "xml") && !strings.Contains(resp.Header.Get("Content-Type"), "yaml") {
		// Fall back to the base64 JSON representation for unusual content types.
		var payload struct {
			Content  string `json:"content"`
			Encoding string `json:"encoding"`
		}
		if json.Unmarshal(data, &payload) == nil && payload.Encoding == "base64" {
			raw, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(payload.Content, "\n", ""))
			if err != nil {
				return "", err
			}
			return string(raw), nil
		}
	}
	return string(data), nil
}

func escapePath(p string) string {
	parts := strings.Split(p, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}

func (g *GitHub) ListCommits(ctx context.Context, token, owner, name, branch string, limit int) ([]models.Commit, error) {
	body, err := g.get(ctx, token, fmt.Sprintf("/repos/%s/%s/commits?sha=%s&per_page=%d", url.PathEscape(owner), url.PathEscape(name), url.QueryEscape(branch), limit))
	if err != nil {
		return nil, err
	}
	var raw []struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Name  string `json:"name"`
				Email string `json:"email"`
				Date  string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]models.Commit, 0, len(raw))
	for _, c := range raw {
		out = append(out, models.Commit{SHA: c.SHA, Message: c.Commit.Message, AuthorName: c.Commit.Author.Name,
			AuthorEmail: c.Commit.Author.Email, CommittedAt: c.Commit.Author.Date})
	}
	return out, nil
}

func (g *GitHub) ListPullRequests(ctx context.Context, token, owner, name, state string) ([]PullRequest, error) {
	if state == "" {
		state = "open"
	}
	body, err := g.get(ctx, token, fmt.Sprintf("/repos/%s/%s/pulls?state=%s&per_page=30", url.PathEscape(owner), url.PathEscape(name), state))
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Number    int    `json:"number"`
		Title     string `json:"title"`
		State     string `json:"state"`
		Body      string `json:"body"`
		HTMLURL   string `json:"html_url"`
		CreatedAt string `json:"created_at"`
		Additions int    `json:"additions"`
		Deletions int    `json:"deletions"`
		Changed   int    `json:"changed_files"`
		User      struct {
			Login string `json:"login"`
		} `json:"user"`
		Head struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]PullRequest, 0, len(raw))
	for _, p := range raw {
		out = append(out, PullRequest{Number: p.Number, Title: p.Title, State: p.State, Author: p.User.Login,
			Branch: p.Head.Ref, Base: p.Base.Ref, Additions: p.Additions, Deletions: p.Deletions, Changed: p.Changed,
			URL: p.HTMLURL, CreatedAt: p.CreatedAt, Body: p.Body})
	}
	return out, nil
}

func (g *GitHub) GetPullRequestFiles(ctx context.Context, token, owner, name string, number int) ([]PullFile, error) {
	body, err := g.get(ctx, token, fmt.Sprintf("/repos/%s/%s/pulls/%d/files?per_page=100", url.PathEscape(owner), url.PathEscape(name), number))
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Filename  string `json:"filename"`
		Status    string `json:"status"`
		Additions int    `json:"additions"`
		Deletions int    `json:"deletions"`
		Patch     string `json:"patch"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]PullFile, 0, len(raw))
	for _, f := range raw {
		out = append(out, PullFile{Path: f.Filename, Status: f.Status, Additions: f.Additions, Deletions: f.Deletions, Patch: f.Patch})
	}
	return out, nil
}
