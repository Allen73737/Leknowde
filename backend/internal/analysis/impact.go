package analysis

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/retrieval"
	"github.com/leknowde/platform/backend/internal/store"
)

type ImpactSeed struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Kind     string `json:"kind"`
	FilePath string `json:"file_path"`
	Why      string `json:"why"`
}

type AffectedFile struct {
	Path  string   `json:"path"`
	Depth int      `json:"depth"`
	Via   string   `json:"via"`
	Why   string   `json:"why"`
	Chain []string `json:"chain"`
}

type AffectedAPI struct {
	Method  string `json:"method"`
	Path    string `json:"path"`
	File    string `json:"file"`
	Via     string `json:"via"`
	Depth   int    `json:"depth"`
}

type RiskFactor struct {
	Label    string `json:"label"`
	Weight   int    `json:"weight"`
	Evidence string `json:"evidence"`
}

type RiskAssessment struct {
	Level     string       `json:"level"`
	Score     int          `json:"score"`
	Rationale string       `json:"rationale"`
	Factors   []RiskFactor `json:"factors"`
	Formula   string       `json:"formula"`
}

type ImpactPayload struct {
	Request          string          `json:"request"`
	Seeds            []ImpactSeed    `json:"seeds"`
	AffectedFiles    []AffectedFile  `json:"affected_files"`
	AffectedSymbols  []ImpactSeed    `json:"affected_symbols"`
	AffectedAPIs     []AffectedAPI   `json:"affected_apis"`
	AffectedServices []string        `json:"affected_services"`
	AffectedEntities []string        `json:"affected_entities"`
	Tests            []string        `json:"recommended_tests"`
	ExistingTests    []string        `json:"existing_tests"`
	Commits          []models.Commit `json:"recent_commits"`
	Graph            models.Graph    `json:"graph"`
	Risk             RiskAssessment  `json:"risk"`
	Sequence         []string        `json:"implementation_sequence"`
	TestPlan         []string        `json:"test_plan"`
	Documentation    []string        `json:"documentation_updates"`
	Rollback         []string        `json:"rollback_considerations"`
	Uncertainty      []string        `json:"uncertainty"`
	Evidence         []models.Evidence `json:"evidence"`
	Strategy         string          `json:"strategy"`
	Parser           string          `json:"parser"`
}

// BuildImpact produces a deterministic, evidence-backed impact assessment.
// No probabilities are invented: the score is the sum of explicit, visible
// factors and the formula is returned alongside it.
func BuildImpact(ctx context.Context, st *store.Store, repo models.Repository, branch, request string) (ImpactPayload, error) {
	payload := ImpactPayload{
		Request: request, Seeds: []ImpactSeed{}, AffectedFiles: []AffectedFile{}, AffectedSymbols: []ImpactSeed{},
		AffectedAPIs: []AffectedAPI{}, AffectedServices: []string{}, AffectedEntities: []string{},
		Tests: []string{}, ExistingTests: []string{}, Commits: []models.Commit{}, Graph: models.Graph{Nodes: []models.GraphNode{}, Edges: []models.GraphEdge{}},
		Sequence: []string{}, TestPlan: []string{}, Documentation: []string{}, Rollback: []string{}, Uncertainty: []string{},
		Evidence: []models.Evidence{}, Parser: repo.ParserMode,
	}
	payload.Strategy = "deterministic retrieval + reverse dependency closure"

	found, err := retrieval.Search(ctx, st, repo.ID, branch, request, 12)
	if err != nil {
		return payload, err
	}
	payload.Evidence = found.Evidence
	payload.Strategy = found.Strategy + " → reverse dependency closure"

	seedKeys := map[string]bool{}
	for _, sy := range found.Symbols {
		if sy.Kind == "entity" {
			continue
		}
		key := "symbol:" + sy.FilePath + "#" + sy.QualifiedName
		payload.Seeds = append(payload.Seeds, ImpactSeed{
			Key: key, Label: sy.QualifiedName, Kind: sy.Kind, FilePath: sy.FilePath,
			Why: fmt.Sprintf("%s declaration matched the requested change", sy.Kind),
		})
		seedKeys[key] = true
	}
	for _, e := range found.Evidence {
		key := "file:" + e.FilePath
		if seedKeys[key] {
			continue
		}
		payload.Seeds = append(payload.Seeds, ImpactSeed{Key: key, Label: e.FilePath, Kind: "file", FilePath: e.FilePath, Why: e.Reason})
		seedKeys[key] = true
		if len(payload.Seeds) >= 14 {
			break
		}
	}
	for _, sy := range found.Symbols {
		if sy.Kind == "entity" {
			payload.AffectedEntities = appendUnique(payload.AffectedEntities, sy.Name)
		}
	}

	if len(payload.Seeds) == 0 {
		payload.Uncertainty = append(payload.Uncertainty,
			"No source evidence matched the request. The change may reference behaviour that is not present in the indexed branch, or use vocabulary that does not appear in the code.")
		payload.Risk = RiskAssessment{Level: "unknown", Score: 0, Rationale: "No evidence was retrieved, so no risk estimate is defensible.", Factors: []RiskFactor{}, Formula: "n/a"}
		return payload, nil
	}

	seeds := make([]string, 0, len(seedKeys))
	for k := range seedKeys {
		seeds = append(seeds, k)
	}
	impacts, err := st.ReverseClosure(ctx, repo.ID, seeds, 5, 300)
	if err != nil {
		return payload, err
	}

	seenFiles := map[string]bool{}
	for _, seed := range payload.Seeds {
		if seed.FilePath != "" && !seenFiles[seed.FilePath] {
			seenFiles[seed.FilePath] = true
			payload.AffectedFiles = append(payload.AffectedFiles, AffectedFile{
				Path: seed.FilePath, Depth: 0, Via: "seed",
				Why: "Directly matched the change description.", Chain: []string{seed.FilePath},
			})
		}
	}
	for _, im := range impacts {
		if im.Kind == "file" {
			filePath := strings.TrimPrefix(im.Key, "file:")
			if seenFiles[filePath] {
				continue
			}
			seenFiles[filePath] = true
			payload.AffectedFiles = append(payload.AffectedFiles, AffectedFile{
				Path: filePath, Depth: im.Depth, Via: im.Via,
				Why: fmt.Sprintf("Reached through a %s relationship %d hop(s) from a matched seed.", im.Via, im.Depth),
				Chain: trimPath(im.Path),
			})
		} else if im.Kind == "symbol" {
			payload.AffectedSymbols = append(payload.AffectedSymbols, ImpactSeed{
				Key: im.Key, Label: im.Label, Kind: im.Kind, FilePath: im.FilePath,
				Why: fmt.Sprintf("Call site %d hop(s) from the change, via %s.", im.Depth, im.Via),
			})
		} else if im.Kind == "api" {
			method, apiPath := splitAPIKey(im.Key)
			payload.AffectedAPIs = append(payload.AffectedAPIs, AffectedAPI{Method: method, Path: apiPath, File: im.FilePath, Via: im.Via, Depth: im.Depth})
		} else if im.Kind == "test" {
			payload.ExistingTests = appendUnique(payload.ExistingTests, strings.TrimPrefix(im.Key, "test:"))
		} else if im.Kind == "service" || im.Kind == "module" {
			payload.AffectedServices = appendUnique(payload.AffectedServices, im.Label)
		} else if im.Kind == "entity" {
			payload.AffectedEntities = appendUnique(payload.AffectedEntities, im.Label)
		}
	}

	// Tests that import affected files.
	paths := make([]string, 0, len(payload.AffectedFiles))
	for _, f := range payload.AffectedFiles {
		paths = append(paths, f.Path)
	}
	if tests, err := st.TestsForPaths(ctx, repo.ID, paths); err == nil {
		for _, t := range tests {
			payload.ExistingTests = appendUnique(payload.ExistingTests, t)
		}
	}

	// Recent commits touching affected files add temporal evidence.
	if commits, err := st.ListCommits(ctx, repo.ID, 20); err == nil {
		filtered := []models.Commit{}
		for _, c := range commits {
			msg := strings.ToLower(c.Message)
			for _, f := range payload.AffectedFiles {
				base := strings.ToLower(f.Path)
				if idx := strings.LastIndex(base, "/"); idx >= 0 {
					base = base[idx+1:]
				}
				stem := strings.TrimSuffix(base, fileExt(base))
				if stem != "" && len(stem) > 3 && strings.Contains(msg, stem) {
					filtered = append(filtered, c)
					break
				}
			}
			if len(filtered) >= 5 {
				break
			}
		}
		payload.Commits = filtered
	}

	// Graph subgraph over the involved node set.
	keep := map[string]bool{}
	for _, s := range payload.Seeds {
		keep[s.Key] = true
	}
	for _, im := range impacts {
		keep[im.Key] = true
	}
	full, err := st.LoadGraph(ctx, repo.ID, nil, nil, 4000)
	if err == nil {
		for _, n := range full.Nodes {
			if keep[n.Key] {
				payload.Graph.Nodes = append(payload.Graph.Nodes, n)
			}
		}
		included := map[string]bool{}
		for _, n := range payload.Graph.Nodes {
			included[n.Key] = true
		}
		for _, e := range full.Edges {
			if included[e.From] && included[e.To] {
				payload.Graph.Edges = append(payload.Graph.Edges, e)
			}
		}
	}

	payload.Risk = scoreRisk(request, payload, impacts)
	payload.Sequence = buildSequence(payload)
	payload.TestPlan = buildTestPlan(payload)
	payload.Documentation = buildDocUpdates(payload)
	payload.Rollback = buildRollback(payload)

	payload.Uncertainty = append(payload.Uncertainty,
		"Impact is computed from static import and call relationships. Dynamic dispatch, reflection, dependency injection containers and runtime configuration can create dependencies that static analysis cannot see.",
		"Absence of a dependency is not proof of safety: files that reference this behaviour through strings, events or external clients may not appear here.",
	)
	if len(payload.ExistingTests) == 0 {
		payload.Uncertainty = append(payload.Uncertainty, "No test file in the repository imports the affected modules, so regression risk cannot be bounded by the existing test suite.")
	}
	if repo.ParserMode != "" && repo.ParserMode != "tree-sitter" {
		payload.Uncertainty = append(payload.Uncertainty, "Symbols were extracted with the "+repo.ParserMode+" parser, which is lower fidelity than tree-sitter.")
	}
	return payload, nil
}

// scoreRisk is a transparent additive model. Each factor exposes its weight and
// the evidence that produced it.
func scoreRisk(request string, p ImpactPayload, impacts []store.ImpactNode) RiskAssessment {
	factors := []RiskFactor{}
	score := 0
	add := func(label string, weight int, evidence string) {
		score += weight
		factors = append(factors, RiskFactor{Label: label, Weight: weight, Evidence: evidence})
	}
	if n := len(p.AffectedFiles); n > 0 {
		weight := minInt(n/3, 8)
		add("Breadth of affected files", weight, fmt.Sprintf("%d files are reachable from the matched change.", n))
	}
	if n := len(p.AffectedAPIs); n > 0 {
		weight := minInt(n*2, 10)
		add("Public API surface", weight, fmt.Sprintf("%d API endpoint(s) are exposed by affected files.", n))
	}
	if len(p.AffectedEntities) > 0 {
		add("Persistent data structure", 6, "Database entities are in scope: "+strings.Join(p.AffectedEntities, ", "))
	}
	if len(p.AffectedServices) > 0 {
		add("Cross-module spread", minInt(len(p.AffectedServices), 6), "Affected modules: "+strings.Join(p.AffectedServices, ", "))
	}
	low := strings.ToLower(request)
	for _, term := range []string{"auth", "token", "session", "password", "permission", "billing", "payment", "encryption", "migration", "delete"} {
		if strings.Contains(low, term) {
			add("Security or data sensitivity", 7, fmt.Sprintf("The request mentions %q, which is security- or data-critical.", term))
			break
		}
	}
	if len(p.ExistingTests) == 0 {
		add("No correlated tests", 8, "No test file imports the affected modules.")
	} else {
		add("Existing tests present", -4, fmt.Sprintf("%d test file(s) reference the affected modules, giving a safety net.", len(p.ExistingTests)))
	}
	if len(impacts) > 40 {
		add("Deep transitive fan-in", 5, fmt.Sprintf("%d transitive dependants were discovered.", len(impacts)))
	}
	if len(p.Commits) > 0 {
		add("Recent churn", minInt(len(p.Commits), 3), fmt.Sprintf("%d recent commit(s) mention the affected files.", len(p.Commits)))
	}
	if score < 0 {
		score = 0
	}
	level := "low"
	switch {
	case score >= 28:
		level = "critical"
	case score >= 18:
		level = "high"
	case score >= 8:
		level = "medium"
	}
	rationale := fmt.Sprintf("Additive score %d from %d visible factors. The model measures blast radius and sensitivity, not the probability of failure.", score, len(factors))
	return RiskAssessment{Level: level, Score: score, Rationale: rationale, Factors: factors,
		Formula: "score = sum(factor weights); level: <8 low, 8-17 medium, 18-27 high, >=28 critical"}
}

func buildSequence(p ImpactPayload) []string {
	steps := []string{}
	seeds := []string{}
	for _, f := range p.AffectedFiles {
		if f.Depth == 0 {
			seeds = append(seeds, f.Path)
		}
	}
	if len(seeds) > 0 {
		steps = append(steps, "Start with the primary implementation: "+strings.Join(limitStrings(seeds, 4), ", ")+". Read these files completely before editing.")
	}
	if len(p.AffectedSymbols) > 0 {
		labels := []string{}
		for _, s := range p.AffectedSymbols {
			if len(labels) < 5 {
				labels = append(labels, s.Label)
			}
		}
		steps = append(steps, "Update call sites: "+strings.Join(labels, ", ")+". Keep signatures backward compatible where an external consumer exists.")
	}
	deeper := []string{}
	for _, f := range p.AffectedFiles {
		if f.Depth > 0 {
			deeper = append(deeper, f.Path)
		}
	}
	if len(deeper) > 0 {
		steps = append(steps, "Propagate the change outwards through "+strings.Join(limitStrings(deeper, 5), ", ")+", ordered by dependency depth.")
	}
	if len(p.AffectedAPIs) > 0 {
		apis := []string{}
		for _, a := range p.AffectedAPIs {
			apis = append(apis, a.Method+" "+a.Path)
			if len(apis) >= 4 {
				break
			}
		}
		steps = append(steps, "Verify the externally visible contract for "+strings.Join(apis, ", ")+". Add a temporary compatibility path if clients cannot be updated atomically.")
	}
	if len(p.AffectedEntities) > 0 {
		steps = append(steps, "Apply database schema changes as a separate, reversible migration before deploying code that depends on them.")
	}
	steps = append(steps, "Run the recommended tests below, then re-index the repository so the digital twin reflects the new implementation.")
	return steps
}

func buildTestPlan(p ImpactPayload) []string {
	plan := []string{}
	if len(p.ExistingTests) > 0 {
		plan = append(plan, "Run existing related suites: "+strings.Join(limitStrings(p.ExistingTests, 6), ", "))
	}
	for _, a := range p.AffectedAPIs {
		if len(plan) >= 8 {
			break
		}
		plan = append(plan, fmt.Sprintf("Add or extend an integration test for %s %s covering success, rejection and unauthorised access.", a.Method, a.Path))
	}
	for _, f := range p.AffectedFiles {
		if f.Depth == 0 && len(plan) < 9 {
			plan = append(plan, "Add a focused unit test for "+f.Path+" around the behaviour being changed.")
		}
	}
	if len(p.AffectedEntities) > 0 {
		plan = append(plan, "Add a migration rollback test for: "+strings.Join(p.AffectedEntities, ", "))
	}
	if len(plan) == 0 {
		plan = append(plan, "Add a characterisation test that captures current behaviour before making the change.")
	}
	return plan
}

func buildDocUpdates(p ImpactPayload) []string {
	docs := []string{}
	if len(p.AffectedAPIs) > 0 {
		docs = append(docs, "Update API documentation for the affected endpoints and their error responses.")
	}
	if len(p.AffectedEntities) > 0 {
		docs = append(docs, "Update the database documentation and entity relationship diagram.")
	}
	docs = append(docs, "Regenerate the architecture document so the dependency view stays accurate.")
	if len(p.Commits) > 0 {
		docs = append(docs, "Record the decision as an ADR if the change alters an established pattern.")
	}
	return docs
}

func buildRollback(p ImpactPayload) []string {
	out := []string{
		"Keep the previous implementation behind a feature flag so traffic can be switched back without a redeploy.",
		"Deploy schema changes in an additive, backward-compatible step; destructive drops belong in a later release.",
	}
	if len(p.AffectedAPIs) > 0 {
		out = append(out, "Preserve the existing API response shape for at least one release cycle so clients can roll back independently.")
	}
	if len(p.ExistingTests) == 0 {
		out = append(out, "Because no correlated tests exist, capture a manual verification checklist before rolling out.")
	}
	return out
}

func splitAPIKey(key string) (string, string) {
	rest := strings.TrimPrefix(key, "api:")
	parts := strings.SplitN(rest, ":", 2)
	if len(parts) != 2 {
		return "GET", rest
	}
	return parts[0], parts[1]
}

func appendUnique(list []string, v string) []string {
	for _, s := range list {
		if s == v {
			return list
		}
	}
	return append(list, v)
}

func trimPath(p []string) []string {
	if len(p) <= 6 {
		return p
	}
	return append(append([]string{}, p[:3]...), append([]string{"…"}, p[len(p)-2:]...)...)
}

func fileExt(p string) string {
	idx := strings.LastIndex(p, ".")
	if idx < 0 {
		return ""
	}
	return p[idx:]
}

func limitStrings(list []string, n int) []string {
	if len(list) <= n {
		return list
	}
	return append(list[:n], "…")
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ScorePullRequestRisk applies the same additive model to a pull request's
// changed-file set. It is exposed so PR analysis and impact analysis explain
// risk in an identical way.
func ScorePullRequestRisk(changedFiles, impactedFiles, relatedTests, modules int) RiskAssessment {
	factors := []RiskFactor{}
	score := 0
	add := func(label string, weight int, evidence string) {
		score += weight
		factors = append(factors, RiskFactor{Label: label, Weight: weight, Evidence: evidence})
	}
	if changedFiles > 0 {
		add("Changed file volume", minInt(changedFiles/2, 8), fmt.Sprintf("%d files are modified in this pull request.", changedFiles))
	}
	if impactedFiles > 0 {
		add("Downstream reach", minInt(impactedFiles/2, 10), fmt.Sprintf("%d dependent files are reachable from the changed files.", impactedFiles))
	}
	if modules > 2 {
		add("Multiple modules touched", minInt(modules, 6), fmt.Sprintf("%d modules are affected.", modules))
	}
	if relatedTests == 0 {
		add("No related tests", 8, "No indexed test file imports the changed modules.")
	} else {
		add("Related tests exist", -4, fmt.Sprintf("%d related test file(s) were found.", relatedTests))
	}
	if score < 0 {
		score = 0
	}
	level := "low"
	switch {
	case score >= 26:
		level = "critical"
	case score >= 17:
		level = "high"
	case score >= 8:
		level = "medium"
	}
	return RiskAssessment{
		Level: level, Score: score, Factors: factors,
		Rationale: fmt.Sprintf("Additive score %d from %d visible factors (pull request variant of the impact model).", score, len(factors)),
		Formula:   "score = sum(factor weights); level: <8 low, 8-16 medium, 17-25 high, >=26 critical",
	}
}

// SortFindings is a stable severity sort used by API handlers.
func SortFindings(f []models.Finding) {
	order := map[string]int{"critical": 0, "high": 1, "medium": 2, "low": 3}
	sort.SliceStable(f, func(i, j int) bool { return order[f[i].Severity] < order[f[j].Severity] })
}
