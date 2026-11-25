package analysis

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

// TestSelection recommends the smallest defensible test set for a change and
// returns the exact command an engineer or CI job can run.
type TestSelection struct {
	Repository       models.Repository `json:"repository"`
	Branch           string            `json:"branch"`
	ChangedFiles     []string          `json:"changed_files"`
	AffectedFiles    []AffectedFile    `json:"affected_files"`
	DirectTests      []string          `json:"direct_tests"`
	TransitiveTests  []string          `json:"transitive_tests"`
	SelectedTests    []string          `json:"selected_tests"`
	Reasons          []TestReason      `json:"reasons"`
	UnmappedFiles    []string          `json:"unmapped_files"`
	Runner           string            `json:"runner"`
	Command          string            `json:"command"`
	FullSuiteCommand string            `json:"full_suite_command"`
	CommandRationale string            `json:"command_rationale"`
	Confidence       string            `json:"confidence"`
	ConfidenceScore  int               `json:"confidence_score"`
	Caveats          []string          `json:"caveats"`
}

type TestReason struct {
	Test       string   `json:"test"`
	Covers     string   `json:"covers"`
	Hops       int      `json:"hops"`
	Chain      []string `json:"chain"`
	Confidence string   `json:"confidence"`
	Evidence   string   `json:"evidence"`
}

// SelectTests maps changed paths through the dependency graph to tests. The
// graph is built from static imports and test relationships; it is not runtime
// coverage.
func SelectTests(ctx context.Context, st *store.Store, repo models.Repository, branch string, changed []string) (TestSelection, error) {
	out := TestSelection{
		Repository: repo, Branch: branch, ChangedFiles: []string{}, AffectedFiles: []AffectedFile{},
		DirectTests: []string{}, TransitiveTests: []string{}, SelectedTests: []string{}, Reasons: []TestReason{},
		UnmappedFiles: []string{}, Caveats: []string{},
	}
	seen := map[string]bool{}
	for _, raw := range changed {
		p := strings.TrimSpace(strings.ReplaceAll(raw, "\\", "/"))
		p = strings.TrimPrefix(p, "./")
		if p == "" || strings.HasPrefix(p, "../") || strings.HasPrefix(p, "/") || strings.Contains(p, "..") {
			continue
		}
		if !seen[p] {
			seen[p] = true
			out.ChangedFiles = append(out.ChangedFiles, p)
		}
	}
	sort.Strings(out.ChangedFiles)
	if len(out.ChangedFiles) == 0 {
		out.Confidence = "insufficient"
		out.CommandRationale = "No repository-relative paths were supplied."
		out.Caveats = []string{"Pass one or more changed paths, or a pull request number, to select tests."}
		return out, nil
	}

	seeds := make([]string, 0, len(out.ChangedFiles))
	for _, p := range out.ChangedFiles {
		seeds = append(seeds, "file:"+p)
	}
	impacts, err := st.ReverseClosure(ctx, repo.ID, seeds, 4, 250)
	if err != nil {
		return out, err
	}
	impactByPath := map[string]store.ImpactNode{}
	for _, im := range impacts {
		if im.Kind == "file" {
			p := strings.TrimPrefix(im.Key, "file:")
			if _, exists := impactByPath[p]; !exists {
				impactByPath[p] = im
				out.AffectedFiles = append(out.AffectedFiles, AffectedFile{
					Path: p, Depth: im.Depth, Via: im.Via,
					Why:   fmt.Sprintf("Reached %d hop(s) from a changed file through %s.", im.Depth, im.Via),
					Chain: trimPath(im.Path),
				})
			}
		}
	}
	sort.Slice(out.AffectedFiles, func(i, j int) bool {
		if out.AffectedFiles[i].Depth != out.AffectedFiles[j].Depth {
			return out.AffectedFiles[i].Depth < out.AffectedFiles[j].Depth
		}
		return out.AffectedFiles[i].Path < out.AffectedFiles[j].Path
	})

	directTests := map[string]bool{}
	transitiveTests := map[string]bool{}
	for _, p := range out.ChangedFiles {
		if isTestPath(p) {
			directTests[p] = true
		}
	}
	direct, _ := st.TestsForPaths(ctx, repo.ID, out.ChangedFiles)
	for _, t := range direct {
		directTests[t] = true
	}
	affectedPaths := make([]string, 0, len(out.AffectedFiles))
	for _, f := range out.AffectedFiles {
		affectedPaths = append(affectedPaths, f.Path)
	}
	transitive, _ := st.TestsForPaths(ctx, repo.ID, affectedPaths)
	for _, t := range transitive {
		transitiveTests[t] = true
	}
	// A test that is itself in the reverse closure should be selected even when
	// its TESTS edge points at a transitive file.
	for _, im := range impacts {
		if im.Kind == "test" {
			transitiveTests[strings.TrimPrefix(im.Key, "test:")] = true
		}
	}
	for t := range directTests {
		delete(transitiveTests, t)
		out.DirectTests = append(out.DirectTests, t)
	}
	for t := range transitiveTests {
		out.TransitiveTests = append(out.TransitiveTests, t)
	}
	sort.Strings(out.DirectTests)
	sort.Strings(out.TransitiveTests)
	all := map[string]bool{}
	for _, t := range out.DirectTests {
		all[t] = true
	}
	for _, t := range out.TransitiveTests {
		all[t] = true
	}
	for t := range all {
		out.SelectedTests = append(out.SelectedTests, t)
	}
	sort.Strings(out.SelectedTests)

	// Build explicit reason chains from TESTS edges.
	coverMap := testsCoveringPaths(ctx, st, repo.ID, append(append([]string{}, out.ChangedFiles...), affectedPaths...))
	coveredChanged := map[string]bool{}
	for test, covers := range coverMap {
		for _, cover := range covers {
			if containsString(out.ChangedFiles, cover) {
				coveredChanged[cover] = true
			}
			hops := 1
			chain := []string{cover, test}
			if im, ok := impactByPath[cover]; ok {
				hops = im.Depth + 1
				chain = append(trimPath(im.Path), test)
			}
			confidence := "medium"
			if hops == 1 {
				confidence = "high"
			}
			out.Reasons = append(out.Reasons, TestReason{
				Test: test, Covers: cover, Hops: hops, Chain: chain, Confidence: confidence,
				Evidence: fmt.Sprintf("%s has a TESTS edge to %s.", test, cover),
			})
		}
	}
	for _, t := range out.SelectedTests {
		if isTestPath(t) && containsString(out.ChangedFiles, t) {
			out.Reasons = append(out.Reasons, TestReason{
				Test: t, Covers: t, Hops: 0, Chain: []string{t}, Confidence: "high",
				Evidence: "The changed file is itself a test file.",
			})
		}
	}
	sort.SliceStable(out.Reasons, func(i, j int) bool {
		if out.Reasons[i].Test != out.Reasons[j].Test {
			return out.Reasons[i].Test < out.Reasons[j].Test
		}
		return out.Reasons[i].Covers < out.Reasons[j].Covers
	})

	for _, p := range out.ChangedFiles {
		if isTestPath(p) {
			continue
		}
		if !coveredChanged[p] {
			out.UnmappedFiles = append(out.UnmappedFiles, p)
		}
	}
	sort.Strings(out.UnmappedFiles)

	out.Runner, out.FullSuiteCommand = detectRunner(ctx, st, repo, branch, out.ChangedFiles)
	if len(out.SelectedTests) > 0 {
		out.Command = buildTestCommand(out.Runner, out.SelectedTests)
		if out.Command == "" {
			out.Command = out.FullSuiteCommand
			out.CommandRationale = "A runner could not be inferred from the repository manifests, so the full-suite command is shown."
		} else {
			out.CommandRationale = fmt.Sprintf("%s selected by static dependency analysis; %d direct and %d transitive test(s).", out.Runner, len(out.DirectTests), len(out.TransitiveTests))
		}
	} else {
		out.Command = out.FullSuiteCommand
		out.CommandRationale = "No test in the indexed graph imports a changed or affected file. The safe fallback is the full suite."
	}

	// Confidence reflects mapping quality, not the probability that tests pass.
	totalSource := 0
	for _, p := range out.ChangedFiles {
		if !isTestPath(p) {
			totalSource++
		}
	}
	switch {
	case len(out.SelectedTests) == 0:
		out.Confidence = "insufficient"
		out.ConfidenceScore = 0
	case totalSource > 0 && len(out.UnmappedFiles) == 0:
		out.Confidence = "high"
		out.ConfidenceScore = 90
	case len(out.UnmappedFiles) <= totalSource/2:
		out.Confidence = "medium"
		out.ConfidenceScore = 65
	default:
		out.Confidence = "low"
		out.ConfidenceScore = 35
	}
	if out.ConfidenceScore > 0 && len(out.DirectTests) == 0 {
		out.ConfidenceScore -= 10
	}
	out.Caveats = []string{
		"Test selection uses static import and TESTS relationships. Dynamically loaded modules, runtime wiring and generated test suites can be missed.",
		"Selecting a test does not prove it covers the changed behaviour; it only means the indexed graph connects the test to the file.",
		"The command is returned for review. LeKnowde does not execute tests or arbitrary commands.",
	}
	if len(out.UnmappedFiles) > 0 {
		out.Caveats = append(out.Caveats, fmt.Sprintf("%d changed source file(s) have no direct test reference: %s.", len(out.UnmappedFiles), strings.Join(out.UnmappedFiles, ", ")))
	}
	if repo.Provider == "demo" {
		out.Caveats = append(out.Caveats, "This repository is the bundled demo dataset; its tests are fixture files.")
	}
	return out, nil
}

func testsCoveringPaths(ctx context.Context, st *store.Store, repoID string, paths []string) map[string][]string {
	out := map[string][]string{}
	if len(paths) == 0 {
		return out
	}
	args := []any{repoID}
	placeholders := make([]string, 0, len(paths))
	seen := map[string]bool{}
	for _, p := range paths {
		if seen[p] {
			continue
		}
		seen[p] = true
		placeholders = append(placeholders, "?")
		args = append(args, "file:"+p)
	}
	if len(placeholders) == 0 {
		return out
	}
	rows, err := st.DB.QueryContext(ctx, `SELECT from_key, to_key FROM graph_edges
		WHERE repository_id = ? AND relation = 'TESTS' AND to_key IN (`+strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var from, to string
		if rows.Scan(&from, &to) != nil {
			continue
		}
		test := strings.TrimPrefix(from, "test:")
		cover := strings.TrimPrefix(to, "file:")
		out[test] = appendUnique(out[test], cover)
	}
	return out
}

func isTestPath(p string) bool {
	lower := strings.ToLower(strings.ReplaceAll(p, "\\", "/"))
	base := path.Base(lower)
	return strings.Contains(lower, "test") || strings.Contains(lower, "spec") ||
		strings.HasSuffix(base, "_test.go") || strings.HasPrefix(base, "test_")
}

func containsString(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

func detectRunner(ctx context.Context, st *store.Store, repo models.Repository, branch string, changed []string) (string, string) {
	var packageJSON string
	_ = st.DB.QueryRowContext(ctx, `SELECT content FROM repository_files WHERE repository_id = ? AND branch = ? AND path = 'package.json' LIMIT 1`, repo.ID, branch).Scan(&packageJSON)
	var goMod, pyproject, pytestINI, setupCfg, requirements string
	_ = st.DB.QueryRowContext(ctx, `SELECT path FROM repository_files WHERE repository_id = ? AND branch = ? AND path = 'go.mod' LIMIT 1`, repo.ID, branch).Scan(&goMod)
	_ = st.DB.QueryRowContext(ctx, `SELECT path FROM repository_files WHERE repository_id = ? AND branch = ? AND path = 'pyproject.toml' LIMIT 1`, repo.ID, branch).Scan(&pyproject)
	_ = st.DB.QueryRowContext(ctx, `SELECT path FROM repository_files WHERE repository_id = ? AND branch = ? AND path = 'pytest.ini' LIMIT 1`, repo.ID, branch).Scan(&pytestINI)
	_ = st.DB.QueryRowContext(ctx, `SELECT path FROM repository_files WHERE repository_id = ? AND branch = ? AND path IN ('setup.cfg','tox.ini') LIMIT 1`, repo.ID, branch).Scan(&setupCfg)
	_ = st.DB.QueryRowContext(ctx, `SELECT path FROM repository_files WHERE repository_id = ? AND branch = ? AND path = 'requirements.txt' LIMIT 1`, repo.ID, branch).Scan(&requirements)

	if goMod != "" {
		return "go test", "go test ./..."
	}
	if pyproject != "" || pytestINI != "" || setupCfg != "" || requirements != "" {
		return "pytest", "pytest"
	}
	if packageJSON != "" {
		var pkg struct {
			Scripts map[string]string `json:"scripts"`
			Dependencies map[string]string `json:"dependencies"`
			DevDependencies map[string]string `json:"devDependencies"`
		}
		_ = json.Unmarshal([]byte(packageJSON), &pkg)
		testScript := pkg.Scripts["test"]
		switch {
		case strings.Contains(testScript, "vitest") || hasKey(pkg.DevDependencies, "vitest") || hasKey(pkg.Dependencies, "vitest"):
			return "npx vitest run", "npx vitest run"
		case strings.Contains(testScript, "jest") || hasKey(pkg.DevDependencies, "jest") || hasKey(pkg.Dependencies, "jest"):
			return "npx jest", "npx jest"
		case strings.Contains(testScript, "mocha") || hasKey(pkg.DevDependencies, "mocha"):
			return "npx mocha", "npx mocha"
		case testScript != "":
			return "npm test", "npm test"
		}
		return "npm test", "npm test"
	}
	switch repo.Language {
	case "TypeScript", "JavaScript":
		return "npm test", "npm test"
	case "Go":
		return "go test", "go test ./..."
	case "Python":
		return "pytest", "pytest"
	}
	return "", ""
}

func hasKey(m map[string]string, key string) bool {
	if m == nil {
		return false
	}
	_, ok := m[key]
	return ok
}

func buildTestCommand(runner string, tests []string) string {
	if runner == "" || len(tests) == 0 {
		return ""
	}
	if runner == "go test" {
		dirs := map[string]bool{}
		for _, t := range tests {
			dir := path.Dir(t)
			if dir == "." || dir == "" {
				dir = "."
			}
			dirs["./"+strings.TrimPrefix(dir, "./")+"/..."] = true
		}
		list := make([]string, 0, len(dirs))
		for d := range dirs {
			list = append(list, d)
		}
		sort.Strings(list)
		return "go test " + strings.Join(list, " ")
	}
	quoted := make([]string, 0, len(tests))
	for _, t := range tests {
		quoted = append(quoted, shellQuote(t))
	}
	command := runner + " " + strings.Join(quoted, " ")
	if len(command) > 4000 {
		return runner
	}
	return command
}

func shellQuote(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`, "`", "\\`", `$`, `\$`).Replace(s) + `"`
}
