package gitprov

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/leknowde/platform/backend/internal/models"
)

var (
	ErrUnauthorized = errors.New("provider rejected the credentials")
	ErrRateLimited  = errors.New("provider rate limit reached")
	ErrNotFound     = errors.New("repository or file not found")
)

// Repo is provider-neutral repository metadata.
type Repo struct {
	Owner         string `json:"owner"`
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Description   string `json:"description"`
	Language      string `json:"language"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
	HTMLURL       string `json:"html_url"`
	ExternalID    string `json:"external_id"`
	UpdatedAt     string `json:"updated_at"`
}

// FileEntry is one blob in a repository tree.
type FileEntry struct {
	Path string `json:"path"`
	SHA  string `json:"sha"`
	Size int    `json:"size"`
}

type PullRequest struct {
	Number    int    `json:"number"`
	Title     string `json:"title"`
	State     string `json:"state"`
	Author    string `json:"author"`
	Branch    string `json:"branch"`
	Base      string `json:"base"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Changed   int    `json:"changed_files"`
	URL       string `json:"url"`
	CreatedAt string `json:"created_at"`
	Body      string `json:"body"`
}

type PullFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch"`
}

// Provider is the contract every Git host integration implements.
type Provider interface {
	Name() string
	Validate(ctx context.Context, token string) (login string, scopes string, err error)
	ListRepositories(ctx context.Context, token string) ([]Repo, error)
	GetRepository(ctx context.Context, token, owner, name string) (Repo, error)
	ListBranches(ctx context.Context, token, owner, name string) ([]models.Branch, error)
	ListTree(ctx context.Context, token, owner, name, branch string, maxFiles int) ([]FileEntry, error)
	GetFile(ctx context.Context, token, owner, name, path, ref string, maxBytes int64) (string, error)
	ListCommits(ctx context.Context, token, owner, name, branch string, limit int) ([]models.Commit, error)
	ListPullRequests(ctx context.Context, token, owner, name string, state string) ([]PullRequest, error)
	GetPullRequestFiles(ctx context.Context, token, owner, name string, number int) ([]PullFile, error)
}

func New(provider string) (Provider, error) {
	switch provider {
	case "github":
		return &GitHub{client: newHTTPClient()}, nil
	case "gitlab":
		return &GitLab{client: newHTTPClient(), baseURL: "https://gitlab.com"}, nil
	case "demo":
		return &Demo{}, nil
	default:
		return nil, fmt.Errorf("unsupported provider %q", provider)
	}
}

func newHTTPClient() *http.Client {
	return &http.Client{Timeout: 30 * time.Second}
}

// do performs a provider request and maps HTTP failures onto typed errors.
func do(client *http.Client, req *http.Request) ([]byte, int, error) {
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	switch {
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden && len(body) == 0:
		return body, resp.StatusCode, ErrUnauthorized
	case resp.StatusCode == 403 && resp.Header.Get("X-RateLimit-Remaining") == "0":
		return body, resp.StatusCode, ErrRateLimited
	case resp.StatusCode == 429:
		return body, resp.StatusCode, ErrRateLimited
	case resp.StatusCode == 404:
		return body, resp.StatusCode, ErrNotFound
	case resp.StatusCode >= 400:
		return body, resp.StatusCode, fmt.Errorf("provider returned %d: %s", resp.StatusCode, truncate(string(body), 300))
	}
	return body, resp.StatusCode, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ShouldSkipPath filters vendor, build and lock artefacts before fetching blobs.
func ShouldSkipPath(path string) bool {
	skipDirs := []string{
		"node_modules/", "vendor/", "dist/", "build/", ".next/", "target/", "bin/", "obj/",
		".git/", "coverage/", "__pycache__/", ".venv/", "venv/", "Pods/", ".gradle/", ".idea/",
		".vscode/", "out/", "tmp/", ".cache/", "public/assets/", "assets/fonts/",
	}
	for _, d := range skipDirs {
		if len(path) > len(d) && path[:len(d)] == d {
			return true
		}
	}
	skipExt := []string{
		".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svgz", ".pdf", ".zip", ".tar", ".gz",
		".mp4", ".mp3", ".wav", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".so", ".dll", ".exe",
		".dylib", ".class", ".jar", ".pyc", ".wasm", ".min.js", ".min.css", ".map", ".lock",
	}
	lower := lowerASCII(path)
	for _, ext := range skipExt {
		if len(lower) > len(ext) && lower[len(lower)-len(ext):] == ext {
			return true
		}
	}
	if lower == "package-lock.json" || lower == "yarn.lock" || lower == "pnpm-lock.yaml" || lower == "go.sum" {
		return true
	}
	return false
}

func lowerASCII(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 32
		}
	}
	return string(b)
}

// DetectLanguage maps an extension to a display language name.
func DetectLanguage(path string) string {
	lower := lowerASCII(path)
	dot := -1
	for i := len(lower) - 1; i >= 0; i-- {
		if lower[i] == '.' {
			dot = i
			break
		}
		if lower[i] == '/' {
			break
		}
	}
	ext := ""
	if dot >= 0 {
		ext = lower[dot:]
	}
	switch ext {
	case ".ts", ".tsx":
		return "TypeScript"
	case ".js", ".jsx", ".mjs", ".cjs":
		return "JavaScript"
	case ".go":
		return "Go"
	case ".py":
		return "Python"
	case ".rs":
		return "Rust"
	case ".java":
		return "Java"
	case ".kt":
		return "Kotlin"
	case ".rb":
		return "Ruby"
	case ".php":
		return "PHP"
	case ".cs":
		return "C#"
	case ".c", ".h":
		return "C"
	case ".cpp", ".cc", ".hpp":
		return "C++"
	case ".swift":
		return "Swift"
	case ".scala":
		return "Scala"
	case ".sql":
		return "SQL"
	case ".md", ".mdx":
		return "Markdown"
	case ".json":
		return "JSON"
	case ".yml", ".yaml":
		return "YAML"
	case ".html":
		return "HTML"
	case ".css", ".scss", ".sass":
		return "CSS"
	case ".sh", ".bash", ".ps1":
		return "Shell"
	case ".proto":
		return "Protobuf"
	case ".tf":
		return "Terraform"
	case ".toml", ".ini", ".env", ".cfg":
		return "Config"
	default:
		return ""
	}
}

func IsIndexable(lang string) bool {
	switch lang {
	case "TypeScript", "JavaScript", "Go", "Python", "Rust", "Java", "Kotlin", "Ruby", "PHP", "C#", "C", "C++", "Swift", "Scala", "SQL":
		return true
	}
	return false
}
