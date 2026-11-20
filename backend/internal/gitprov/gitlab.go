package gitprov

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
)

// GitLab implements the subset of the GitLab API v4 that LeKnowde needs.
// Self-hosted instances are supported by overriding baseURL.
type GitLab struct {
	client  *http.Client
	baseURL string
}

func (g *GitLab) Name() string { return "gitlab" }

func (g *GitLab) get(ctx context.Context, token, path string) ([]byte, http.Header, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.baseURL+"/api/v4"+path, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("User-Agent", "LeKnowde/1.0")
	if token != "" {
		req.Header.Set("PRIVATE-TOKEN", token)
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, resp.Header, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return body, resp.Header, ErrUnauthorized
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return body, resp.Header, ErrRateLimited
	}
	if resp.StatusCode == http.StatusNotFound {
		return body, resp.Header, ErrNotFound
	}
	if resp.StatusCode >= 400 {
		return body, resp.Header, fmt.Errorf("gitlab returned %d: %s", resp.StatusCode, truncate(string(body), 300))
	}
	return body, resp.Header, nil
}

func projectID(owner, name string) string {
	return url.PathEscape(owner + "/" + name)
}

func (g *GitLab) Validate(ctx context.Context, token string) (string, string, error) {
	body, _, err := g.get(ctx, token, "/user")
	if err != nil {
		return "", "", err
	}
	var user struct {
		Username string `json:"username"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", "", err
	}
	return user.Username, "api", nil
}

func (g *GitLab) ListRepositories(ctx context.Context, token string) ([]Repo, error) {
	out := []Repo{}
	for page := 1; page <= 3; page++ {
		body, _, err := g.get(ctx, token, fmt.Sprintf("/projects?membership=true&per_page=100&page=%d&order_by=last_activity_at", page))
		if err != nil {
			return out, err
		}
		var raw []struct {
			ID                int64  `json:"id"`
			Name              string `json:"name"`
			PathWithNamespace string `json:"path_with_namespace"`
			Description       string `json:"description"`
			DefaultBranch     string `json:"default_branch"`
			Visibility        string `json:"visibility"`
			WebURL            string `json:"web_url"`
			Namespace         struct {
				FullPath string `json:"full_path"`
			} `json:"namespace"`
		}
		if err := json.Unmarshal(body, &raw); err != nil {
			return out, err
		}
		for _, r := range raw {
			out = append(out, Repo{Owner: r.Namespace.FullPath, Name: r.Name, FullName: r.PathWithNamespace,
				Description: r.Description, DefaultBranch: r.DefaultBranch, Private: r.Visibility != "public",
				HTMLURL: r.WebURL, ExternalID: fmt.Sprintf("%d", r.ID)})
		}
		if len(raw) < 100 {
			break
		}
	}
	return out, nil
}

func (g *GitLab) GetRepository(ctx context.Context, token, owner, name string) (Repo, error) {
	body, _, err := g.get(ctx, token, "/projects/"+projectID(owner, name))
	if err != nil {
		return Repo{}, err
	}
	var r struct {
		ID                int64  `json:"id"`
		Name              string `json:"name"`
		PathWithNamespace string `json:"path_with_namespace"`
		Description       string `json:"description"`
		DefaultBranch     string `json:"default_branch"`
		Visibility        string `json:"visibility"`
		WebURL            string `json:"web_url"`
		Namespace         struct {
			FullPath string `json:"full_path"`
		} `json:"namespace"`
	}
	if err := json.Unmarshal(body, &r); err != nil {
		return Repo{}, err
	}
	return Repo{Owner: r.Namespace.FullPath, Name: r.Name, FullName: r.PathWithNamespace, Description: r.Description,
		DefaultBranch: r.DefaultBranch, Private: r.Visibility != "public", HTMLURL: r.WebURL, ExternalID: fmt.Sprintf("%d", r.ID)}, nil
}

func (g *GitLab) ListBranches(ctx context.Context, token, owner, name string) ([]models.Branch, error) {
	body, _, err := g.get(ctx, token, "/projects/"+projectID(owner, name)+"/repository/branches?per_page=100")
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Name   string `json:"name"`
		Commit struct {
			ID string `json:"id"`
		} `json:"commit"`
		Default bool `json:"default"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]models.Branch, 0, len(raw))
	for _, b := range raw {
		out = append(out, models.Branch{Name: b.Name, HeadSHA: b.Commit.ID, IsDefault: b.Default})
	}
	return out, nil
}

func (g *GitLab) ListTree(ctx context.Context, token, owner, name, branch string, maxFiles int) ([]FileEntry, error) {
	out := []FileEntry{}
	for page := 1; page <= 20; page++ {
		body, _, err := g.get(ctx, token, fmt.Sprintf("/projects/%s/repository/tree?recursive=true&per_page=100&page=%d&ref=%s", projectID(owner, name), page, url.QueryEscape(branch)))
		if err != nil {
			return out, err
		}
		var raw []struct {
			Path string `json:"path"`
			Type string `json:"type"`
			ID   string `json:"id"`
		}
		if err := json.Unmarshal(body, &raw); err != nil {
			return out, err
		}
		for _, t := range raw {
			if t.Type != "blob" || ShouldSkipPath(t.Path) {
				continue
			}
			if !IsIndexable(DetectLanguage(t.Path)) && DetectLanguage(t.Path) != "Markdown" && DetectLanguage(t.Path) != "JSON" {
				continue
			}
			out = append(out, FileEntry{Path: t.Path, SHA: t.ID})
			if len(out) >= maxFiles {
				return out, nil
			}
		}
		if len(raw) < 100 {
			break
		}
	}
	return out, nil
}

func (g *GitLab) GetFile(ctx context.Context, token, owner, name, path, ref string, maxBytes int64) (string, error) {
	u := fmt.Sprintf("/projects/%s/repository/files/%s/raw?ref=%s", projectID(owner, name), url.PathEscape(path), url.QueryEscape(ref))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.baseURL+"/api/v4"+u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "LeKnowde/1.0")
	if token != "" {
		req.Header.Set("PRIVATE-TOKEN", token)
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return "", ErrNotFound
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return "", ErrUnauthorized
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("gitlab returned %d for %s", resp.StatusCode, path)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes))
	return string(data), err
}

func (g *GitLab) ListCommits(ctx context.Context, token, owner, name, branch string, limit int) ([]models.Commit, error) {
	body, _, err := g.get(ctx, token, fmt.Sprintf("/projects/%s/repository/commits?ref_name=%s&per_page=%d", projectID(owner, name), url.QueryEscape(branch), limit))
	if err != nil {
		return nil, err
	}
	var raw []struct {
		ID            string `json:"id"`
		Message       string `json:"message"`
		AuthorName    string `json:"author_name"`
		AuthorEmail   string `json:"author_email"`
		CommittedDate string `json:"committed_date"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]models.Commit, 0, len(raw))
	for _, c := range raw {
		out = append(out, models.Commit{SHA: c.ID, Message: c.Message, AuthorName: c.AuthorName,
			AuthorEmail: c.AuthorEmail, CommittedAt: c.CommittedDate})
	}
	return out, nil
}

func (g *GitLab) ListPullRequests(ctx context.Context, token, owner, name, state string) ([]PullRequest, error) {
	st := "opened"
	if state == "closed" || state == "merged" {
		st = state
	}
	body, _, err := g.get(ctx, token, fmt.Sprintf("/projects/%s/merge_requests?state=%s&per_page=30", projectID(owner, name), st))
	if err != nil {
		return nil, err
	}
	var raw []struct {
		IID       int    `json:"iid"`
		Title     string `json:"title"`
		State     string `json:"state"`
		WebURL    string `json:"web_url"`
		CreatedAt string `json:"created_at"`
		Author    struct {
			Username string `json:"username"`
		} `json:"author"`
		SourceBranch string `json:"source_branch"`
		TargetBranch string `json:"target_branch"`
		Description  string `json:"description"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]PullRequest, 0, len(raw))
	for _, p := range raw {
		out = append(out, PullRequest{Number: p.IID, Title: p.Title, State: p.State, Author: p.Author.Username,
			Branch: p.SourceBranch, Base: p.TargetBranch, URL: p.WebURL, CreatedAt: p.CreatedAt, Body: p.Description})
	}
	return out, nil
}

func (g *GitLab) GetPullRequestFiles(ctx context.Context, token, owner, name string, number int) ([]PullFile, error) {
	body, _, err := g.get(ctx, token, fmt.Sprintf("/projects/%s/merge_requests/%d/changes", projectID(owner, name), number))
	if err != nil {
		return nil, err
	}
	var raw struct {
		Changes []struct {
			NewPath string `json:"new_path"`
			OldPath string `json:"old_path"`
			Diff    string `json:"diff"`
			NewFile bool   `json:"new_file"`
			Deleted bool   `json:"deleted_file"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]PullFile, 0, len(raw.Changes))
	for _, c := range raw.Changes {
		status := "modified"
		if c.NewFile {
			status = "added"
		} else if c.Deleted {
			status = "removed"
		}
		adds, dels := 0, 0
		for _, line := range strings.Split(c.Diff, "\n") {
			if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
				adds++
			} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
				dels++
			}
		}
		out = append(out, PullFile{Path: c.NewPath, Status: status, Additions: adds, Deletions: dels, Patch: c.Diff})
	}
	return out, nil
}
