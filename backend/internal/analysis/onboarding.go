package analysis

import (
	"context"
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

// FactSheet is the verified, source-derived input for documentation and
// onboarding generation. Everything here is read from the index, never guessed.
type FactSheet struct {
	Repository       models.Repository `json:"repository"`
	Branch           string            `json:"branch"`
	Stats            store.RepoStats   `json:"stats"`
	Modules          []string          `json:"modules"`
	EntryPoints      []string          `json:"entry_points"`
	Endpoints        []string          `json:"endpoints"`
	Entities         []string          `json:"entities"`
	Tests            []string          `json:"tests"`
	KeyFiles         []KeyFile         `json:"key_files"`
	Languages        map[string]int    `json:"languages"`
	Commits          []models.Commit   `json:"commits"`
	Findings         []models.Finding  `json:"findings"`
	DependencyCounts map[string]int    `json:"dependency_counts"`
	Manifests        []string          `json:"manifests"`
	TopDirs          []DirSummary      `json:"top_dirs"`
	HasReadme        bool              `json:"has_readme"`
	LicenseFile      string            `json:"license_file"`
	// Paths is used for topic and README signals; it stays out of serialised
	// responses because the file tree is already served by its own endpoint.
	Paths []string `json:"-"`
}

// DirSummary counts indexed files per top-level directory.
type DirSummary struct {
	Path  string `json:"path"`
	Files int    `json:"files"`
}

type KeyFile struct {
	Path      string `json:"path"`
	Language  string `json:"language"`
	Lines     int    `json:"lines"`
	InDegree  int    `json:"in_degree"`
	OutDegree int    `json:"out_degree"`
	Role      string `json:"role"`
}

// BuildFacts assembles a fact sheet for a repository branch.
func BuildFacts(ctx context.Context, st *store.Store, repo models.Repository, branch string) (FactSheet, error) {
	fs := FactSheet{Repository: repo, Branch: branch, Languages: map[string]int{}, DependencyCounts: map[string]int{},
		Modules: []string{}, EntryPoints: []string{}, Endpoints: []string{}, Entities: []string{}, Tests: []string{}, KeyFiles: []KeyFile{}, Commits: []models.Commit{}, Findings: []models.Finding{},
		Manifests: []string{}, TopDirs: []DirSummary{}}

	stats, err := st.RepoStats(ctx, repo.ID, branch)
	if err != nil {
		return fs, err
	}
	fs.Stats = stats
	fs.Languages = stats.Languages

	rows, err := st.DB.QueryContext(ctx, `SELECT kind, label, file_path FROM graph_nodes WHERE repository_id = ? AND kind IN ('module','api','entity')`, repo.ID)
	if err != nil {
		return fs, err
	}
	for rows.Next() {
		var kind, label, filePath string
		if err := rows.Scan(&kind, &label, &filePath); err != nil {
			break
		}
		switch kind {
		case "module":
			fs.Modules = appendUnique(fs.Modules, label)
		case "api":
			fs.Endpoints = appendUnique(fs.Endpoints, label)
		case "entity":
			fs.Entities = appendUnique(fs.Entities, label)
		}
	}
	rows.Close()
	sort.Strings(fs.Modules)
	sort.Strings(fs.Endpoints)
	sort.Strings(fs.Entities)

	files, err := st.ListFilePaths(ctx, repo.ID, branch)
	if err != nil {
		return fs, err
	}
	entryNames := map[string]bool{"index.ts": true, "index.tsx": true, "main.ts": true, "server.ts": true, "app.ts": true,
		"main.go": true, "app.py": true, "main.py": true, "__init__.py": false, "index.js": true, "layout.tsx": true, "page.tsx": true}
	manifestNames := map[string]bool{
		"go.mod": true, "go.sum": false, "package.json": true, "package-lock.json": false, "pnpm-lock.yaml": false,
		"yarn.lock": false, "requirements.txt": true, "pyproject.toml": true, "poetry.lock": false,
		"cargo.toml": true, "pom.xml": true, "build.gradle": true, "dockerfile": true, "docker-compose.yml": true,
		"docker-compose.yaml": true, "makefile": true, "tsconfig.json": true, "turbo.json": true,
	}
	dirCounts := map[string]int{}
	for _, f := range files {
		base := path.Base(f.Path)
		if len(fs.Paths) < 2000 {
			fs.Paths = append(fs.Paths, f.Path)
		}
		if entryNames[base] || strings.HasSuffix(f.Path, "/main.go") {
			fs.EntryPoints = append(fs.EntryPoints, f.Path)
		}
		lower := strings.ToLower(f.Path)
		if strings.Contains(lower, "test") || strings.Contains(lower, "spec") || strings.Contains(lower, "__tests__") {
			fs.Tests = append(fs.Tests, f.Path)
		}
		if manifestNames[strings.ToLower(base)] {
			fs.Manifests = appendUnique(fs.Manifests, f.Path)
		}
		if lower == "readme.md" || lower == "readme" {
			fs.HasReadme = true
		}
		if fs.LicenseFile == "" && (strings.HasPrefix(strings.ToLower(base), "license") || strings.HasPrefix(strings.ToLower(base), "licence")) {
			fs.LicenseFile = f.Path
		}
		clean := strings.ReplaceAll(f.Path, "\\", "/")
		if idx := strings.Index(clean, "/"); idx > 0 {
			dirCounts[clean[:idx]]++
		} else {
			dirCounts["."]++
		}
	}
	for dir, count := range dirCounts {
		fs.TopDirs = append(fs.TopDirs, DirSummary{Path: dir, Files: count})
	}
	sort.Slice(fs.TopDirs, func(i, j int) bool {
		if fs.TopDirs[i].Files == fs.TopDirs[j].Files {
			return fs.TopDirs[i].Path < fs.TopDirs[j].Path
		}
		return fs.TopDirs[i].Files > fs.TopDirs[j].Files
	})
	if len(fs.TopDirs) > 10 {
		fs.TopDirs = fs.TopDirs[:10]
	}
	sort.Strings(fs.Manifests)
	sort.Strings(fs.EntryPoints)
	sort.Strings(fs.Tests)

	edgeRows, err := st.DB.QueryContext(ctx, `SELECT to_key, from_key, relation FROM graph_edges WHERE repository_id = ? AND relation IN ('IMPORTS','CALLS')`, repo.ID)
	inDeg := map[string]int{}
	outDeg := map[string]int{}
	for edgeRows.Next() {
		var to, from, rel string
		if err := edgeRows.Scan(&to, &from, &rel); err != nil {
			break
		}
		inDeg[to]++
		outDeg[from]++
		fs.DependencyCounts[rel]++
	}
	edgeRows.Close()
	for _, f := range files {
		key := "file:" + f.Path
		if inDeg[key] == 0 && outDeg[key] == 0 {
			continue
		}
		fs.KeyFiles = append(fs.KeyFiles, KeyFile{Path: f.Path, Language: f.Language, Lines: f.LineCount, InDegree: inDeg[key], OutDegree: outDeg[key], Role: roleOf(f.Path)})
	}
	sort.Slice(fs.KeyFiles, func(i, j int) bool { return fs.KeyFiles[i].InDegree > fs.KeyFiles[j].InDegree })
	if len(fs.KeyFiles) > 20 {
		fs.KeyFiles = fs.KeyFiles[:20]
	}
	if commits, err := st.ListCommits(ctx, repo.ID, 10); err == nil {
		fs.Commits = commits
	}
	if findings, err := st.ListFindings(ctx, repo.ID, ""); err == nil {
		fs.Findings = findings
	}
	return fs, nil
}

func roleOf(p string) string {
	lower := strings.ToLower(p)
	switch {
	case strings.Contains(lower, "auth"):
		return "authentication"
	case strings.Contains(lower, "route") || strings.Contains(lower, "controller"):
		return "API layer"
	case strings.Contains(lower, "repository") || strings.Contains(lower, "store") || strings.Contains(lower, "db"):
		return "data access"
	case strings.Contains(lower, "middleware"):
		return "middleware"
	case strings.Contains(lower, "component") || strings.HasSuffix(lower, ".tsx"):
		return "UI component"
	case strings.Contains(lower, "hook"):
		return "client state"
	case strings.Contains(lower, "api") || strings.Contains(lower, "client"):
		return "client transport"
	case strings.Contains(lower, "test") || strings.Contains(lower, "spec"):
		return "test"
	case strings.HasSuffix(lower, ".sql"):
		return "schema"
	case strings.HasSuffix(lower, ".md"):
		return "documentation"
	default:
		return "source"
	}
}

// OnboardingPlan is a generated learning path grounded in real structure.
type OnboardingPlan struct {
	Overview       []string   `json:"overview"`
	Architecture   []string   `json:"architecture"`
	Steps          []PlanStep `json:"steps"`
	KeyFiles       []KeyFile  `json:"key_files"`
	Questions      []string   `json:"questions_to_ask_the_codebase"`
	EstimatedHours int        `json:"estimated_hours"`
	Facts          FactSheet  `json:"facts"`
}

type PlanStep struct {
	Order    int      `json:"order"`
	Title    string   `json:"title"`
	Why      string   `json:"why"`
	Files    []string `json:"files"`
	Exercise string   `json:"exercise"`
}

func BuildOnboarding(ctx context.Context, st *store.Store, repo models.Repository, branch string) (OnboardingPlan, error) {
	fs, err := BuildFacts(ctx, st, repo, branch)
	if err != nil {
		return OnboardingPlan{}, err
	}
	plan := OnboardingPlan{Facts: fs, KeyFiles: fs.KeyFiles, Steps: []PlanStep{}, Overview: []string{}, Architecture: []string{}, Questions: []string{}}

	langs := topLanguages(fs.Languages, 4)
	plan.Overview = append(plan.Overview,
		fmt.Sprintf("%s is a %s repository with %d indexed files and about %d lines of code.", repo.FullName, repo.Language, fs.Stats.Files, fs.Stats.Lines),
		fmt.Sprintf("It contains %d functions, %d classes/components and %d detected API endpoints across %d modules.", fs.Stats.Functions, fs.Stats.Classes+fs.Stats.Components, len(fs.Endpoints), len(fs.Modules)),
	)
	if len(langs) > 0 {
		plan.Overview = append(plan.Overview, "Primary languages: "+strings.Join(langs, ", ")+".")
	}
	if len(fs.EntryPoints) > 0 {
		plan.Architecture = append(plan.Architecture, "Execution starts at "+strings.Join(limitStrings(fs.EntryPoints, 4), ", ")+".")
	}
	if len(fs.Endpoints) > 0 {
		plan.Architecture = append(plan.Architecture, "The system exposes "+strings.Join(limitStrings(fs.Endpoints, 5), ", ")+".")
	}
	if len(fs.Entities) > 0 {
		plan.Architecture = append(plan.Architecture, "Persistent entities: "+strings.Join(fs.Entities, ", ")+".")
	}

	order := 1
	addStep := func(title, why string, files []string, exercise string) {
		if len(files) == 0 && why == "" {
			return
		}
		plan.Steps = append(plan.Steps, PlanStep{Order: order, Title: title, Why: why, Files: files, Exercise: exercise})
		order++
	}

	addStep("Read the entry point", "Follow how the process starts and which routers or providers are registered.", limitStrings(fs.EntryPoints, 3),
		"List every route or handler registered before the first domain module loads.")
	addStep("Map the request path", "Trace one request from its entry point to its data access call.", topRole(fs.KeyFiles, 3, "API layer"),
		"Pick a single endpoint and write down each function it calls in order.")
	if authFiles := topRole(fs.KeyFiles, 4, "authentication"); len(authFiles) > 0 {
		addStep("Understand authentication", "Authentication determines the trust boundary for every other feature.", authFiles,
			"Identify which functions issue, validate and revoke credentials.")
	}
	if dbFiles := topRole(fs.KeyFiles, 4, "data access"); len(dbFiles) > 0 {
		addStep("Follow persistence", "Understand the shape of stored data and where queries are issued.", dbFiles,
			"Draw the tables and the functions that read or write each one.")
	}
	if len(fs.Modules) > 0 {
		addStep("Walk module by module", "Each module owns a slice of behaviour. Reading them in dependency order builds an accurate mental model.", limitStrings(fs.Modules, 8),
			"For each module, write a one-sentence responsibility statement.")
	}
	if testFiles := limitStrings(fs.Tests, 4); len(testFiles) > 0 {
		addStep("Read the tests", "Tests encode intended behaviour and edge cases faster than prose.", testFiles,
			"Run the suite and read one failing or skipped test if present.")
	}
	addStep("Review known risks", "Existing findings show where the codebase is fragile, so you avoid learning a pattern that is already planned for change.",
		findingFiles(fs.Findings, 4), "Pick the highest severity finding and confirm whether it is still accurate.")

	plan.Questions = []string{
		"How does a request reach the database in this repository?",
		"What happens if the authentication token is revoked mid-session?",
		"Which modules would break if the primary data model changed?",
		"Where is error handling centralised, and where is it duplicated?",
	}
	if len(fs.Endpoints) > 0 {
		plan.Questions = append(plan.Questions, "What are the failure modes of "+fs.Endpoints[0]+"?")
	}
	plan.EstimatedHours = 2 + len(fs.Modules) + len(fs.Endpoints)/4
	return plan, nil
}

func topLanguages(langs map[string]int, n int) []string {
	type kv struct {
		k string
		v int
	}
	list := make([]kv, 0, len(langs))
	for k, v := range langs {
		list = append(list, kv{k, v})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].v > list[j].v })
	out := []string{}
	for i, item := range list {
		if i >= n {
			break
		}
		out = append(out, fmt.Sprintf("%s (%d %s)", item.k, item.v, countLabel(item.v, "file", "files")))
	}
	return out
}

func topRole(files []KeyFile, n int, role string) []string {
	out := []string{}
	for _, f := range files {
		if f.Role == role {
			out = append(out, f.Path)
			if len(out) >= n {
				break
			}
		}
	}
	return out
}

func findingFiles(findings []models.Finding, n int) []string {
	out := []string{}
	for _, f := range findings {
		if f.FilePath == "" {
			continue
		}
		out = appendUnique(out, f.FilePath)
		if len(out) >= n {
			break
		}
	}
	return out
}
