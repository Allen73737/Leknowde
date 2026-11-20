package analysis

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

// HealthSummary is a deterministic, explainable quality score. Every penalty is
// tied to a finding that the user can inspect; the score is not a black box.
type HealthSummary struct {
	Score        int            `json:"score"`
	Grade        string         `json:"grade"`
	Findings     int            `json:"findings"`
	BySeverity   map[string]int `json:"by_severity"`
	ByKind       map[string]int `json:"by_kind"`
	Penalties    []Penalty      `json:"penalties"`
	Limitations  []string       `json:"limitations"`
	Metrics      Metrics        `json:"metrics"`
}

type Penalty struct {
	Label  string `json:"label"`
	Points int    `json:"points"`
	Count  int    `json:"count"`
}

type Metrics struct {
	Files            int     `json:"files"`
	Lines            int     `json:"lines"`
	Functions        int     `json:"functions"`
	AverageFunctionLength float64 `json:"average_function_length"`
	MaxComplexity    int     `json:"max_cyclomatic_complexity"`
	AverageComplexity float64 `json:"average_cyclomatic_complexity"`
	DuplicateBlocks  int     `json:"duplicate_blocks"`
	CircularGroups   int     `json:"circular_groups"`
	UntestedFiles    int     `json:"untested_files"`
	CommentRatio     float64 `json:"comment_ratio"`
}

var (
	reSecret     = regexp.MustCompile(`(?i)(api[_-]?key|apikey|secret|passwd|password|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']`)
	reSQLConcat  = regexp.MustCompile("(?i)(SELECT|INSERT|UPDATE|DELETE)[^;]{0,80}(\\$\\{|\\+\\s*[a-zA-Z_])")
	reTODO       = regexp.MustCompile(`(?i)\b(TODO|FIXME|HACK|XXX)\b`)
	reEval       = regexp.MustCompile(`\beval\s*\(|new\s+Function\s*\(`)
	reDangerHTML = regexp.MustCompile(`dangerouslySetInnerHTML`)
	reBranch     = regexp.MustCompile(`\b(if|for|while|case|catch|elif|except|when)\b|&&|\|\||\?\.`)
)

// BuildFindings runs deterministic static analysis over indexed source.
func BuildFindings(ctx context.Context, st *store.Store, repoID, branch string) ([]models.Finding, error) {
	rows, err := st.DB.QueryContext(ctx, `SELECT path, language, line_count, content FROM repository_files
		WHERE repository_id = ? AND branch = ? AND is_binary = 0 ORDER BY path ASC`, repoID, branch)
	if err != nil {
		return nil, err
	}
	type fileRow struct {
		path, language, content string
		lines                   int
	}
	files := []fileRow{}
	for rows.Next() {
		var f fileRow
		var content *string
		if err := rows.Scan(&f.path, &f.language, &f.lines, &content); err != nil {
			rows.Close()
			return nil, err
		}
		if content != nil {
			f.content = *content
		}
		files = append(files, f)
	}
	rows.Close()

	findings := []models.Finding{}
	add := func(kind, severity, title, description, filePath string, start, end int, evidence map[string]any) {
		raw, _ := json.Marshal(evidence)
		findings = append(findings, models.Finding{
			Kind: kind, Severity: severity, Title: title, Description: description,
			FilePath: filePath, StartLine: start, EndLine: end, Status: "open", Evidence: string(raw),
		})
	}

	// --- File and complexity level checks -----------------------------------
	totalLines := 0
	totalComplexity := 0
	maxComplexity := 0
	commentLines := 0
	sloc := 0
	windowOwners := map[string][]string{}
	for _, f := range files {
		if strings.HasPrefix(f.language, "Markdown") || f.language == "JSON" || f.language == "YAML" || f.language == "Config" || f.language == "SQL" {
			continue
		}
		totalLines += f.lines
		lines := strings.Split(f.content, "\n")
		fileComplexity := 1
		blank := 0
		comments := 0
		for _, l := range lines {
			t := strings.TrimSpace(l)
			if t == "" {
				blank++
				continue
			}
			if strings.HasPrefix(t, "//") || strings.HasPrefix(t, "#") || strings.HasPrefix(t, "*") || strings.HasPrefix(t, "/*") || strings.HasPrefix(t, "<!--") {
				comments++
			}
			fileComplexity += len(reBranch.FindAllString(l, -1))
		}
		sloc += len(lines) - blank
		commentLines += comments
		totalComplexity += fileComplexity
		if fileComplexity > maxComplexity {
			maxComplexity = fileComplexity
		}

		if f.lines > 700 {
			add("large_file", "medium", "Large file: "+shortPath(f.path),
				fmt.Sprintf("This file has %d lines. Large files are harder to review, test and reason about. Consider splitting cohesive responsibilities into separate modules.", f.lines),
				f.path, 1, f.lines, map[string]any{"lines": f.lines})
		} else if f.lines > 400 {
			add("large_file", "low", "Long file: "+shortPath(f.path),
				fmt.Sprintf("This file has %d lines, which is above the 400 line guideline used by this analysis.", f.lines),
				f.path, 1, f.lines, map[string]any{"lines": f.lines})
		}
		if f.lines > 80 && fileComplexity > 40 {
			add("high_complexity", "high", "High branching complexity in "+shortPath(f.path),
				fmt.Sprintf("Approximately %d branch points across %d lines. Dense control flow increases the number of paths that need test coverage.", fileComplexity, f.lines),
				f.path, 1, f.lines, map[string]any{"cyclomatic_estimate": fileComplexity, "method": "branch-keyword counting"})
		} else if f.lines > 80 && fileComplexity > 22 {
			add("high_complexity", "medium", "Elevated branching complexity in "+shortPath(f.path),
				fmt.Sprintf("Approximately %d branch points across %d lines.", fileComplexity, f.lines),
				f.path, 1, f.lines, map[string]any{"cyclomatic_estimate": fileComplexity})
		}

		// Security heuristics. These are candidates for review, not verdicts.
		if loc := reSecret.FindStringIndex(f.content); loc != nil {
			line := strings.Count(f.content[:loc[0]], "\n") + 1
			add("security", "high", "Possible hard-coded credential",
				"A string literal looks like a credential or token assigned in source. Move secrets into environment configuration and rotate the value if it was real.",
				f.path, line, line, map[string]any{"pattern": "credential-assignment", "confidence": 0.6})
		}
		if reSQLConcat.MatchString(f.content) {
			add("security", "medium", "Possible dynamic SQL construction",
				"A SQL statement appears to be assembled with string interpolation or concatenation. Use parameterised queries and verify the call site.",
				f.path, 1, f.lines, map[string]any{"pattern": "sql-string-building", "confidence": 0.5})
		}
		if reEval.MatchString(f.content) {
			add("security", "medium", "Dynamic code evaluation",
				"`eval` or `new Function` executes strings as code. Confirm the input is never user controlled.",
				f.path, 1, f.lines, map[string]any{"pattern": "eval"})
		}
		if reDangerHTML.MatchString(f.content) && !strings.Contains(f.path, "test") {
			add("security", "medium", "Raw HTML injection point",
				"`dangerouslySetInnerHTML` bypasses React escaping. Confirm the content is sanitised.",
				f.path, 1, f.lines, map[string]any{"pattern": "dangerouslySetInnerHTML"})
		}
		if strings.Contains(f.content, "http://") && !strings.Contains(f.path, "test") {
			add("security", "low", "Non-TLS endpoint referenced",
				"This file references an http:// URL. Confirm it is intentional (for example a local development default).",
				f.path, 1, f.lines, map[string]any{"pattern": "http-url"})
		}
		if reTODO.MatchString(f.content) {
			matches := reTODO.FindAllString(f.content, -1)
			add("tech_debt", "low", fmt.Sprintf("%d outstanding TODO marker(s) in %s", len(matches), shortPath(f.path)),
				"TODO/FIXME markers indicate deferred work. They are tracked here so they are visible rather than lost.",
				f.path, 1, f.lines, map[string]any{"count": len(matches)})
		}

		// Duplication: normalised 6-line windows repeated across files.
		lines = strings.Split(f.content, "\n")
		seen := map[string]bool{}
		for i := 0; i+6 <= len(lines); i++ {
			window := normaliseWindow(lines[i : i+6])
			if len(window) < 120 || seen[window] {
				continue
			}
			seen[window] = true
			windowOwners[window] = append(windowOwners[window], f.path)
		}
	}

	duplicateBlocks := 0
	duplicateFiles := map[string]int{}
	for _, owners := range windowOwners {
		if len(owners) < 2 {
			continue
		}
		unique := map[string]bool{}
		for _, o := range owners {
			unique[o] = true
		}
		if len(unique) < 2 {
			continue
		}
		duplicateBlocks++
		for o := range unique {
			duplicateFiles[o]++
		}
	}
	dupPaths := make([]string, 0, len(duplicateFiles))
	for p, count := range duplicateFiles {
		if count >= 3 {
			dupPaths = append(dupPaths, p)
		}
	}
	sort.Strings(dupPaths)
	if len(dupPaths) > 0 {
		add("duplication", "medium", fmt.Sprintf("Repeated code blocks across %d files", len(dupPaths)),
			"Identical normalised blocks of six or more lines appear in multiple files. Extracting a shared module reduces maintenance risk. Matching is whitespace-insensitive and ignores short fragments.",
			strings.Join(dupPaths[:min(len(dupPaths), 5)], ", "), 0, 0,
			map[string]any{"files": dupPaths, "duplicate_blocks": duplicateBlocks})
	}

	// --- Symbol level checks ------------------------------------------------
	symRows, err := st.DB.QueryContext(ctx, `SELECT c.name, c.kind, f.path, c.start_line, c.end_line, c.exported
		FROM code_symbols c JOIN repository_files f ON f.id = c.file_id
		WHERE c.repository_id = ? ORDER BY f.path`, repoID)
	if err != nil {
		return nil, err
	}
	type symRow struct {
		name, kind, path string
		start, end       int
		exported         int
	}
	syms := []symRow{}
	for symRows.Next() {
		var s symRow
		if err := symRows.Scan(&s.name, &s.kind, &s.path, &s.start, &s.end, &s.exported); err != nil {
			symRows.Close()
			return nil, err
		}
		syms = append(syms, s)
	}
	symRows.Close()
	for _, s := range syms {
		length := s.end - s.start
		if (s.kind == "function" || s.kind == "method") && length > 90 {
			add("long_function", "medium", fmt.Sprintf("Long function: %s", s.name),
				fmt.Sprintf("%s spans about %d lines. Long functions are harder to test and review; consider extracting steps into named helpers.", s.name, length),
				s.path, s.start, s.end, map[string]any{"function": s.name, "length": length})
		}
	}

	// --- Graph based checks -------------------------------------------------
	cycles, err := st.FindCycles(ctx, repoID)
	if err == nil {
		for _, cycle := range cycles {
			add("circular_dependency", "high", "Circular import chain detected",
				"These files import each other in a cycle: "+strings.Join(cycle, " → ")+". Cycles make initialisation order fragile and complicate testing.",
				strings.TrimPrefix(cycle[0], "file:"), 0, 0, map[string]any{"cycle": cycle})
		}
	}
	unused, err := st.UnusedImportCandidates(ctx, repoID)
	if err == nil {
		for _, u := range unused {
			path, _ := u["file"].(string)
			line, _ := u["line"].(int)
			imp, _ := u["imports"].(string)
			add("unused_import", "low", "Unused import candidate",
				fmt.Sprintf("`%s` is imported but its module name does not appear elsewhere in the file. Verify before removing: re-exports, side-effect imports and framework conventions can make this a false positive.", imp),
				path, line, line, u)
		}
	}

	// --- Test coverage signal ----------------------------------------------
	testFiles := map[string]bool{}
	covered := map[string]bool{}
	edgeRows, err := st.DB.QueryContext(ctx, `SELECT from_key, to_key, relation FROM graph_edges WHERE repository_id = ? AND (relation = 'TESTS' OR relation = 'IMPORTS')`, repoID)
	if err == nil {
		for edgeRows.Next() {
			var from, to, rel string
			if err := edgeRows.Scan(&from, &to, &rel); err != nil {
				break
			}
			if strings.HasPrefix(from, "test:") {
				testFiles[strings.TrimPrefix(from, "test:")] = true
				if rel == "TESTS" || rel == "IMPORTS" {
					covered[strings.TrimPrefix(to, "file:")] = true
				}
			}
		}
		edgeRows.Close()
	}
	untested := []string{}
	for _, s := range syms {
		if s.exported == 0 {
			continue
		}
		if testFiles[s.path] || covered[s.path] || strings.Contains(strings.ToLower(s.path), "page") || strings.Contains(strings.ToLower(s.path), "component") {
			continue
		}
		if !contains(untested, s.path) {
			untested = append(untested, s.path)
		}
	}
	sort.Strings(untested)
	if len(untested) > 0 {
		add("missing_tests", "medium", fmt.Sprintf("%d exported source files have no test reference", len(untested)),
			"These files export symbols but no test file imports them. This is a static signal only: runtime coverage may still exist through indirect loading, fixtures or framework conventions.",
			strings.Join(untested[:min(len(untested), 5)], ", "), 0, 0, map[string]any{"files": untested, "confidence": 0.5})
	}

	// Sort by severity and cap the stored volume.
	order := map[string]int{"critical": 0, "high": 1, "medium": 2, "low": 3}
	sort.SliceStable(findings, func(i, j int) bool {
		if order[findings[i].Severity] != order[findings[j].Severity] {
			return order[findings[i].Severity] < order[findings[j].Severity]
		}
		return findings[i].FilePath < findings[j].FilePath
	})
	if len(findings) > 300 {
		findings = findings[:300]
	}
	return findings, nil
}

// SummariseHealth converts stored findings plus repository metrics into a score.
func SummariseHealth(findings []models.Finding, m Metrics) HealthSummary {
	summary := HealthSummary{
		BySeverity: map[string]int{"critical": 0, "high": 0, "medium": 0, "low": 0},
		ByKind:     map[string]int{},
		Penalties:  []Penalty{},
		Metrics:    m,
		Limitations: []string{
			"Complexity values are approximate branch-point counts, not a formal cyclomatic complexity AST pass.",
			"Security checks are pattern based and produce review candidates, never confirmed vulnerabilities.",
			"Test coverage is inferred from import relationships; no runtime coverage data is collected.",
			"Dependency vulnerability checks require an external advisory database and are not performed here.",
		},
	}
	weights := map[string]int{"critical": 12, "high": 6, "medium": 2, "low": 1}
	kindWeights := map[string]int{}
	for _, f := range findings {
		summary.BySeverity[f.Severity]++
		summary.ByKind[f.Kind]++
		kindWeights[f.Kind] += weights[f.Severity]
	}
	score := 100
	keys := make([]string, 0, len(kindWeights))
	for k := range kindWeights {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		// Diminishing penalty so a single category cannot dominate the score.
		points := kindWeights[k]
		capped := points
		if capped > 25 {
			capped = 25
		}
		score -= capped
		summary.Penalties = append(summary.Penalties, Penalty{Label: k, Points: capped, Count: summary.ByKind[k]})
	}
	if score < 0 {
		score = 0
	}
	summary.Score = score
	summary.Findings = len(findings)
	switch {
	case score >= 85:
		summary.Grade = "healthy"
	case score >= 70:
		summary.Grade = "fair"
	case score >= 50:
		summary.Grade = "needs_attention"
	default:
		summary.Grade = "at_risk"
	}
	return summary
}

func normaliseWindow(lines []string) string {
	var b strings.Builder
	for _, l := range lines {
		t := strings.TrimSpace(l)
		if t == "" || strings.HasPrefix(t, "//") || strings.HasPrefix(t, "*") {
			continue
		}
		t = strings.ReplaceAll(t, " ", "")
		t = strings.ReplaceAll(t, "\t", "")
		b.WriteString(t)
	}
	return b.String()
}

func shortPath(p string) string {
	parts := strings.Split(p, "/")
	if len(parts) <= 2 {
		return p
	}
	return strings.Join(parts[len(parts)-2:], "/")
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
