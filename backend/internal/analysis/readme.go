package analysis

import (
	"fmt"
	"strings"
)

// MaxAboutTopics is GitHub's hard limit on repository topics.
const MaxAboutTopics = 20

// AboutMetadata mirrors the fields GitHub exposes on a repository About panel:
// one short description and up to twenty lowercase topics.
type AboutMetadata struct {
	Description string   `json:"description"`
	Topics      []string `json:"topics"`
	Source      string   `json:"source"`
	Fingerprint string   `json:"source_fingerprint"`
	Limits      []string `json:"limits"`
}

var topicStopWords = map[string]bool{
	"the": true, "and": true, "for": true, "with": true, "this": true, "that": true, "from": true,
	"into": true, "your": true, "their": true, "have": true, "will": true, "when": true, "what": true,
	"which": true, "while": true, "using": true, "used": true, "uses": true, "code": true, "codes": true,
	"project": true, "repository": true, "repo": true, "source": true, "files": true, "file": true,
	"based": true, "built": true, "small": true, "simple": true, "about": true, "over": true, "only": true,
	"more": true, "less": true, "all": true, "any": true, "can": true, "are": true, "not": true,
	"internal": true, "src": true, "app": true, "server": true, "backend": true, "frontend": true,
	"web": true, "cmd": true, "pkg": true, "lib": true, "components": true, "pages": true, "public": true,
	"assets": true, "utils": true, "util": true, "config": true, "models": true, "handlers": true,
	"services": true, "service": true, "routes": true, "router": true, "db": true, "data": true,
	"test": true, "tests": true, "docs": true, "doc": true, "scripts": true, "examples": true,
	"shared": true, "common": true, "core": true, "module": true, "modules": true, "index": true,
	"main": true, "root": true, "new": true, "get": true, "set": true, "go": false,
	"application": true, "applications": true, "framework": true, "library": true, "tool": true,
	"tools": true, "tooling": true, "management": true, "interface": true, "support": true,
	"provide": true, "provides": true, "including": true, "includes": true, "allow": true,
	"allows": true, "enable": true, "enables": true, "easily": true, "lightweight": true,
	"modern": true, "powerful": true, "system": true, "platform": true, "auth": true,
}

var languageTopics = map[string]string{
	"TypeScript": "typescript",
	"JavaScript": "javascript",
	"Python":     "python",
	"Go":         "go",
	"Rust":       "rust",
	"Java":       "java",
	"Kotlin":     "kotlin",
	"Ruby":       "ruby",
	"PHP":        "php",
	"C#":         "csharp",
	"C++":        "cpp",
	"C":          "c",
	"SQL":        "sql",
	"Shell":      "shell",
	"HTML":       "html",
	"CSS":        "css",
	"SCSS":       "scss",
	"Dockerfile": "docker",
	"Swift":      "swift",
	"Dart":       "dart",
	"Elixir":     "elixir",
	"Scala":      "scala",
}

// pathTopicSignals maps an indexed path fragment to a topic. Every signal is a
// file that exists in the branch, so the topic is observable, not guessed.
var pathTopicSignals = []struct {
	needle string
	topic  string
}{
	{"auth", "authentication"},
	{"jwt", "jwt"},
	{"oauth", "oauth"},
	{"openid", "openid-connect"},
	{"session", "session-management"},
	{"middleware", "middleware"},
	{"refresh", "token-refresh"},
	{"webhook", "webhooks"},
	{"graphql", "graphql"},
	{"websocket", "websockets"},
	{"worker", "background-jobs"},
	{"queue", "job-queue"},
	{"migration", "database-migrations"},
	{"schema.sql", "database-schema"},
	{"hook", "react-hooks"},
	{".tsx", "react"},
	{".jsx", "react"},
	{"logger", "logging"},
	{"logging", "logging"},
	{"cache", "caching"},
	{"redis", "redis"},
	{"postgres", "postgresql"},
	{"mongo", "mongodb"},
	{"neo4j", "neo4j"},
	{"prisma", "prisma"},
	{"drizzle", "drizzle-orm"},
	{"tailwind", "tailwindcss"},
	{"vite.config", "vite"},
	{"next.config", "nextjs"},
	{"docker", "docker"},
	{"kubernetes", "kubernetes"},
	{"terraform", "terraform"},
	{"i18n", "internationalization"},
	{"/cli", "cli"},
}

// BuildAbout derives an About panel from indexed structure. Nothing is invented:
// when the repository has no provider description, the description states only
// measured counts.
func BuildAbout(fs FactSheet) AboutMetadata {
	repo := fs.Repository
	about := AboutMetadata{Topics: []string{}, Source: "generated", Limits: []string{}}
	about.Fingerprint = SourceFingerprint(fs)

	// --- Description ------------------------------------------------------
	if desc := strings.TrimSpace(repo.Description); desc != "" {
		about.Description = truncateRunes(desc, 300)
	} else {
		langs := topLanguages(fs.Languages, 2)
		subject := "Repository"
		if len(langs) > 0 {
			subject = strings.Join(langs, " and ") + " repository"
		}
		parts := []string{fmt.Sprintf("%s with %d indexed files across %d modules", subject, fs.Stats.Files, len(fs.Modules))}
		if len(fs.Endpoints) > 0 {
			parts = append(parts, fmt.Sprintf("%d detected routes", len(fs.Endpoints)))
		}
		if len(fs.Entities) > 0 {
			parts = append(parts, fmt.Sprintf("%d database entities", len(fs.Entities)))
		}
		about.Description = truncateRunes(strings.Join(parts, ", ")+".", 300)
		about.Limits = append(about.Limits, "No provider description was supplied, so this sentence reports measured structure only.")
	}

	// --- Topics -----------------------------------------------------------
	seen := map[string]bool{}
	add := func(topic string) {
		if len(about.Topics) >= MaxAboutTopics {
			return
		}
		t := normaliseTopic(topic)
		if t == "" || seen[t] {
			return
		}
		seen[t] = true
		about.Topics = append(about.Topics, t)
	}

	for _, lang := range topLanguages(fs.Languages, 4) {
		if topic, ok := languageTopics[lang]; ok {
			add(topic)
		}
	}
	add(repo.Name)

	manifestSet := map[string]bool{}
	for _, m := range fs.Manifests {
		manifestSet[strings.ToLower(m)] = true
	}
	hasManifest := func(suffix string) bool {
		for m := range manifestSet {
			if strings.HasSuffix(m, suffix) {
				return true
			}
		}
		return false
	}
	tsx := false
	for _, f := range fs.KeyFiles {
		switch strings.ToLower(f.Language) {
		case "typescript", "javascript":
			if strings.HasSuffix(strings.ToLower(f.Path), ".tsx") || strings.HasSuffix(strings.ToLower(f.Path), ".jsx") {
				tsx = true
			}
		}
	}
	if hasManifest("next.config.ts") || hasManifest("next.config.js") || hasManifest("next.config.mjs") {
		add("nextjs")
	}
	if tsx {
		add("react")
	}
	if hasManifest("dockerfile") || hasManifest("docker-compose.yml") || hasManifest("docker-compose.yaml") {
		add("docker")
	}
	if len(fs.Endpoints) > 0 {
		add("rest-api")
	}
	if len(fs.DependencyCounts) > 0 {
		add("dependency-graph")
	}
	if len(fs.Entities) > 0 {
		add("sql")
	}
	if len(fs.Tests) > 0 {
		add("testing")
	}
	if fs.HasReadme {
		add("documentation")
	}
	if len(fs.Findings) > 0 {
		add("static-analysis")
	}
	if len(fs.Modules) > 0 {
		add("software-architecture")
	}
	if countNestedManifests(fs.Manifests, "package.json") > 1 {
		add("monorepo")
	}

	for _, word := range descriptionKeywords(repo.Description) {
		add(word)
	}
	for _, signal := range pathTopicSignals {
		for _, p := range fs.Paths {
			if strings.Contains(strings.ToLower(p), signal.needle) {
				add(signal.topic)
				break
			}
		}
	}
	for _, module := range fs.Modules {
		add(lastSegment(module))
	}
	for _, entity := range fs.Entities {
		add(entity)
	}

	about.Limits = append(about.Limits,
		fmt.Sprintf("The generator proposed %d topics from detected languages, manifests, paths and entities. GitHub accepts up to %d; edit them before publishing if the repository has a different subject.", len(about.Topics), MaxAboutTopics))
	return about
}

// GenerateReadme renders a README from verified facts plus the About metadata.
// It never claims runtime behaviour that static analysis cannot observe.
func GenerateReadme(fs FactSheet, about AboutMetadata) (string, string) {
	repo := fs.Repository
	title := repo.Name
	if title == "" {
		title = repo.FullName
	}
	langs := topLanguages(fs.Languages, 3)
	var b strings.Builder

	b.WriteString("# " + title + "\n\n")
	if about.Description != "" {
		b.WriteString(about.Description + "\n\n")
	}
	if len(langs) > 0 {
		b.WriteString(fmt.Sprintf("**Language:** %s · **Branch:** `%s` · **Files:** %d · **Symbols:** %d\n\n",
			strings.Join(langs, ", "), fs.Branch, fs.Stats.Files, fs.Stats.Symbols))
	} else {
		b.WriteString(fmt.Sprintf("**Branch:** `%s` · **Files:** %d\n\n", fs.Branch, fs.Stats.Files))
	}
	b.WriteString("> Draft generated by LeKnowde from indexed structure at commit `" + shortSHA(repo.LastIndexedCommit) + "`.\n")
	b.WriteString("> Nothing here is copied from a live provider. Review before publishing.\n\n")

	b.WriteString("## Overview\n\n")
	b.WriteString(fmt.Sprintf("This branch contains %d indexed source %s totalling %d lines. Static analysis resolved %d symbols",
		fs.Stats.Files, countLabel(fs.Stats.Files, "file", "files"), fs.Stats.Lines, fs.Stats.Symbols))
	if len(fs.Modules) > 0 {
		b.WriteString(fmt.Sprintf(" across %d modules", len(fs.Modules)))
	}
	b.WriteString(".")
	if len(fs.Endpoints) > 0 {
		b.WriteString(fmt.Sprintf(" It declares %d detected %s", len(fs.Endpoints), countLabel(len(fs.Endpoints), "route", "routes")))
		if len(fs.Entities) > 0 {
			b.WriteString(fmt.Sprintf(" over %d %s", len(fs.Entities), countLabel(len(fs.Entities), "database entity", "database entities")))
		}
		b.WriteString(".")
	} else if len(fs.Entities) > 0 {
		b.WriteString(fmt.Sprintf(" It declares %d %s.", len(fs.Entities), countLabel(len(fs.Entities), "database entity", "database entities")))
	}
	b.WriteString("\n\n")

	if len(fs.Endpoints) > 0 {
		b.WriteString("## API surface\n\n")
		b.WriteString("Routes detected from declarations in the indexed source. Request and response schemas are not inferred.\n\n")
		mounts := false
		for _, e := range fs.Endpoints {
			if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(e)), "USE ") {
				mounts = true
				break
			}
		}
		if mounts {
			b.WriteString("`USE` rows are router mounts rather than request handlers.\n\n")
		}
		shown := fs.Endpoints
		if len(shown) > 12 {
			shown = shown[:12]
		}
		b.WriteString("| Method | Path |\n|---|---|\n")
		for _, e := range shown {
			method, p := splitEndpoint(e)
			b.WriteString(fmt.Sprintf("| `%s` | `%s` |\n", method, p))
		}
		if len(fs.Endpoints) > len(shown) {
			b.WriteString(fmt.Sprintf("\n<details>\n<summary>All %d detected endpoints</summary>\n\n", len(fs.Endpoints)))
			for _, e := range fs.Endpoints[12:] {
				b.WriteString("- `" + e + "`\n")
			}
			b.WriteString("\n</details>\n")
		}
		b.WriteString("\n")
	}

	if len(fs.Modules) > 0 {
		b.WriteString("## Architecture\n\n")
		b.WriteString("Modules are directory prefixes that contain indexed files. Counts come from the dependency graph.\n\n")
		b.WriteString("| Module | Role |\n|---|---|\n")
		moduleRoles := map[string][]string{}
		for _, f := range fs.KeyFiles {
			module := lastSegment(f.Path)
			if module == "" {
				continue
			}
			moduleRoles[module] = append(moduleRoles[module], f.Role)
		}
		for _, m := range fs.Modules {
			role := "source"
			if roles := moduleRoles[lastSegment(m)]; len(roles) > 0 {
				role = roles[0]
			}
			b.WriteString(fmt.Sprintf("| `%s` | %s |\n", m, role))
		}
		b.WriteString("\n")
	}

	if len(fs.TopDirs) > 0 {
		b.WriteString("## Project structure\n\n```\n")
		for _, d := range fs.TopDirs {
			label := d.Path
			if label == "." {
				label = "(root)"
			}
			b.WriteString(fmt.Sprintf("%-24s %4d %s\n", label, d.Files, countLabel(d.Files, "file", "files")))
		}
		b.WriteString("```\n\n")
	}

	b.WriteString("## Getting started\n\n")
	b.WriteString("Commands below are inferred from the manifests present in this branch. Confirm them against the detected entry points before relying on them.\n\n```bash\n")
	wrote := false
	if hasPathSuffix(fs.Manifests, "package.json") {
		b.WriteString("npm install\nnpm run dev\n")
		wrote = true
	}
	if hasPathSuffix(fs.Manifests, "go.mod") {
		b.WriteString("go mod download\ngo run ./cmd/server\n")
		wrote = true
	}
	if hasPathSuffix(fs.Manifests, "requirements.txt") || hasPathSuffix(fs.Manifests, "pyproject.toml") {
		b.WriteString("pip install -r requirements.txt\nuvicorn app.main:app --reload\n")
		wrote = true
	}
	if hasPathSuffix(fs.Manifests, "docker-compose.yml") || hasPathSuffix(fs.Manifests, "docker-compose.yaml") {
		b.WriteString("docker compose up\n")
		wrote = true
	}
	if !wrote {
		b.WriteString("# No package manifest was detected in the indexed branch.\n")
	}
	b.WriteString("```\n\n")
	if len(fs.EntryPoints) > 0 {
		b.WriteString("Detected entry points:\n\n")
		for _, e := range limitPlain(fs.EntryPoints, 6) {
			b.WriteString("- `" + e + "`\n")
		}
		b.WriteString("\n")
	}

	b.WriteString("## Testing\n\n")
	if len(fs.Tests) == 0 {
		b.WriteString("No test files were detected by path convention. This is a structural signal, not a statement that the project is untested.\n\n")
	} else {
		b.WriteString(fmt.Sprintf("%d test files were detected by path convention.\n\n", len(fs.Tests)))
		for _, t := range limitPlain(fs.Tests, 8) {
			b.WriteString("- `" + t + "`\n")
		}
		b.WriteString("\nCoverage percentages are not reported unless runtime coverage data is supplied.\n\n")
	}

	b.WriteString("## License\n\n")
	if fs.LicenseFile != "" {
		b.WriteString("A licence file was detected at `" + fs.LicenseFile + "`. Read it for the exact terms.\n\n")
	} else {
		b.WriteString("No licence file was detected in the indexed branch. Add one before publishing.\n\n")
	}

	b.WriteString("## Notes\n\n")
	b.WriteString("- Structure, imports, routes and entities are read from source by static analysis.\n")
	b.WriteString("- Dynamic imports, reflection, runtime wiring and external services are invisible to this analysis.\n")
	if repo.IsDemo {
		b.WriteString("- This repository is the bundled demo dataset. Commit history is illustrative.\n")
	}
	if fs.HasReadme {
		b.WriteString("- An existing `README.md` was found in the branch. This draft does not overwrite it until you save it.\n")
	}
	b.WriteString("\n---\n\n")
	b.WriteString("_Generated by LeKnowde. Facts are computed; prose in this draft is assembled from those facts._\n")

	return title, b.String()
}

// SourceTopics renders topics as a markdown checklist for GitHub's About panel.
func SourceTopics(topics []string) string {
	var b strings.Builder
	b.WriteString("GitHub About topics:\n\n")
	for _, t := range topics {
		b.WriteString("- `" + t + "`\n")
	}
	return b.String()
}

// NormaliseTopic exposes topic cleaning to the API layer so stored and
// generated topics obey the same rules.
func NormaliseTopic(raw string) string { return normaliseTopic(raw) }

func normaliseTopic(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, "_", "-")
	s = strings.ReplaceAll(s, " ", "-")
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '+' || r == '#' || r == '.':
			if !lastDash && b.Len() > 0 {
				b.WriteRune('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) < 2 || len(out) > 35 {
		return ""
	}
	if topicStopWords[out] {
		return ""
	}
	return out
}

func descriptionKeywords(desc string) []string {
	if strings.TrimSpace(desc) == "" {
		return nil
	}
	fields := strings.FieldsFunc(strings.ToLower(desc), func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	})
	out := []string{}
	for _, f := range fields {
		if len(f) < 3 || topicStopWords[f] {
			continue
		}
		out = append(out, f)
		if len(out) >= 10 {
			break
		}
	}
	return out
}

func lastSegment(p string) string {
	clean := strings.ReplaceAll(p, "\\", "/")
	clean = strings.TrimSuffix(clean, "/")
	if idx := strings.LastIndex(clean, "/"); idx >= 0 {
		clean = clean[idx+1:]
	}
	return clean
}

func splitEndpoint(e string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(e), " ", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return "GET", e
}

func hasPathSuffix(paths []string, suffix string) bool {
	for _, p := range paths {
		if strings.HasSuffix(strings.ToLower(p), strings.ToLower(suffix)) {
			return true
		}
	}
	return false
}

func countNestedManifests(paths []string, base string) int {
	n := 0
	for _, p := range paths {
		if strings.EqualFold(lastSegment(p), base) {
			n++
		}
	}
	return n
}

func truncateRunes(s string, max int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= max {
		return string(runes)
	}
	cut := string(runes[:max])
	if idx := strings.LastIndex(cut, " "); idx > max-30 {
		cut = cut[:idx]
	}
	return strings.TrimRight(cut, " ,.;:") + "…"
}

func limitPlain(list []string, n int) []string {
	if len(list) <= n {
		return list
	}
	return list[:n]
}

func countLabel(n int, singular, plural string) string {
	if n == 1 {
		return singular
	}
	return plural
}
