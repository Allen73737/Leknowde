package gitprov

import (
	"context"
	"crypto/sha1"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
)

//go:embed all:demo
var demoFS embed.FS

const demoRoot = "demo/mineral-notes"

// Demo serves a bundled, explicitly-labelled sample repository so the full
// ingestion → parsing → graph → impact pipeline can be exercised without any
// external credentials. It is real source code read from disk; only the commit
// history is illustrative and it is marked as such.
type Demo struct{}

func (d *Demo) Name() string { return "demo" }

func (d *Demo) Validate(ctx context.Context, token string) (string, string, error) {
	return "leknowde-demo", "read", nil
}

func (d *Demo) ListRepositories(ctx context.Context, token string) ([]Repo, error) {
	return []Repo{{
		Owner: "leknowde", Name: "mineral-notes", FullName: "leknowde/mineral-notes",
		Description:   "Demo dataset: a small notes application with refresh-token authentication.",
		Language:      "TypeScript",
		DefaultBranch: "main",
		Private:       false,
		HTMLURL:       "",
		ExternalID:    "demo-mineral-notes",
	}}, nil
}

func (d *Demo) GetRepository(ctx context.Context, token, owner, name string) (Repo, error) {
	repos, _ := d.ListRepositories(ctx, token)
	for _, r := range repos {
		if strings.EqualFold(r.Name, name) {
			return r, nil
		}
	}
	return Repo{}, ErrNotFound
}

func (d *Demo) entries() ([]FileEntry, error) {
	out := []FileEntry{}
	err := fs.WalkDir(demoFS, demoRoot, func(p string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		rel := strings.TrimPrefix(p, demoRoot+"/")
		data, err := demoFS.ReadFile(p)
		if err != nil {
			return err
		}
		sum := sha1.Sum(data)
		out = append(out, FileEntry{Path: rel, SHA: hex.EncodeToString(sum[:]), Size: len(data)})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, err
}

func (d *Demo) ListBranches(ctx context.Context, token, owner, name string) ([]models.Branch, error) {
	entries, err := d.entries()
	if err != nil {
		return nil, err
	}
	h := sha1.Sum([]byte(fmt.Sprintf("%d", len(entries))))
	sha := hex.EncodeToString(h[:])
	return []models.Branch{
		{Name: "main", HeadSHA: sha, IsDefault: true},
		{Name: "feature/refresh-rotation", HeadSHA: sha},
	}, nil
}

func (d *Demo) ListTree(ctx context.Context, token, owner, name, branch string, maxFiles int) ([]FileEntry, error) {
	entries, err := d.entries()
	if err != nil {
		return nil, err
	}
	if len(entries) > maxFiles {
		entries = entries[:maxFiles]
	}
	return entries, nil
}

func (d *Demo) GetFile(ctx context.Context, token, owner, name, filePath, ref string, maxBytes int64) (string, error) {
	clean := path.Clean(strings.TrimPrefix(filePath, "/"))
	if strings.Contains(clean, "..") {
		return "", ErrNotFound
	}
	data, err := demoFS.ReadFile(demoRoot + "/" + clean)
	if err != nil {
		return "", ErrNotFound
	}
	if int64(len(data)) > maxBytes {
		data = data[:maxBytes]
	}
	return string(data), nil
}

func (d *Demo) ListCommits(ctx context.Context, token, owner, name, branch string, limit int) ([]models.Commit, error) {
	return []models.Commit{
		{SHA: "d3m0c4f1a2b3", Message: "Demo data: rotate refresh tokens on every use", AuthorName: "LeKnowde Demo", AuthorEmail: "demo@leknowde.local", CommittedAt: "2026-02-11T10:24:00Z"},
		{SHA: "d3m0b8e7d9c0", Message: "Demo data: add notes API and repository layer", AuthorName: "LeKnowde Demo", AuthorEmail: "demo@leknowde.local", CommittedAt: "2026-02-04T16:02:00Z"},
		{SHA: "d3m09a6c5e4f", Message: "Demo data: initial authentication scaffolding", AuthorName: "LeKnowde Demo", AuthorEmail: "demo@leknowde.local", CommittedAt: "2026-01-28T09:15:00Z"},
	}, nil
}

func (d *Demo) ListPullRequests(ctx context.Context, token, owner, name, state string) ([]PullRequest, error) {
	return []PullRequest{{
		Number: 12, Title: "Rotate refresh tokens and revoke family on reuse", State: "open", Author: "leknowde-demo",
		Branch: "feature/refresh-rotation", Base: "main", Additions: 148, Deletions: 32, Changed: 5,
		URL: "", CreatedAt: "2026-02-12T08:00:00Z",
		Body: "Demo pull request metadata. Real pull requests are fetched from the connected Git provider.",
	}}, nil
}

func (d *Demo) GetPullRequestFiles(ctx context.Context, token, owner, name string, number int) ([]PullFile, error) {
	return []PullFile{
		{Path: "server/src/auth/refresh.ts", Status: "modified", Additions: 96, Deletions: 18, Patch: ""},
		{Path: "server/src/routes/auth.ts", Status: "modified", Additions: 24, Deletions: 6, Patch: ""},
		{Path: "web/src/hooks/useAuth.ts", Status: "modified", Additions: 18, Deletions: 5, Patch: ""},
		{Path: "server/src/db/schema.sql", Status: "modified", Additions: 8, Deletions: 2, Patch: ""},
		{Path: "server/test/auth.refresh.test.ts", Status: "added", Additions: 42, Deletions: 0, Patch: ""},
	}, nil
}
