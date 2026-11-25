// Package check implements the deterministic CI gate used by the leknowde CLI.
// A rule either passes or produces a violation with a file and line where one
// exists, so the result can be rendered as GitHub/GitLab annotations.
package check

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/analysis"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/platform"
	"github.com/leknowde/platform/backend/internal/store"
)

type Config struct {
	FailOn                string                `json:"fail_on"`
	MinHealth             int                   `json:"min_health"`
	MaxCycles             int                   `json:"max_cycles"`
	MaxFindings           map[string]int        `json:"max_findings"`
	MaxModuleFanout       int                   `json:"max_module_fanout"`
	ForbiddenDependencies []ForbiddenDependency `json:"forbidden_dependencies"`
	RequireDocCurrent     bool                  `json:"require_doc_current"`
	MinBusFactor          int                   `json:"min_bus_factor"`
	IgnorePaths           []string              `json:"ignore_paths"`
}

type ForbiddenDependency struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Reason string `json:"reason"`
}

func DefaultConfig() Config {
	return Config{FailOn: "high", MinHealth: 60, MaxCycles: -1, MaxFindings: map[string]int{}}
}

type fileConfig struct {
	FailOn                *string                `json:"fail_on"`
	MinHealth             *int                   `json:"min_health"`
	MaxCycles             *int                   `json:"max_cycles"`
	MaxFindings           map[string]int         `json:"max_findings"`
	MaxModuleFanout       *int                   `json:"max_module_fanout"`
	ForbiddenDependencies []ForbiddenDependency  `json:"forbidden_dependencies"`
	RequireDocCurrent     *bool                  `json:"require_doc_current"`
	MinBusFactor          *int                   `json:"min_bus_factor"`
	IgnorePaths           []string               `json:"ignore_paths"`
}

// LoadConfig reads a JSON policy file. Missing fields inherit the safe
// defaults, so a small policy file does not need to repeat every threshold.
func LoadConfig(path string) (Config, error) {
	cfg := DefaultConfig()
	if strings.TrimSpace(path) == "" {
		return cfg, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	var fc fileConfig
	if err := json.Unmarshal(raw, &fc); err != nil {
		return cfg, fmt.Errorf("parse %s: %w", path, err)
	}
	if fc.FailOn != nil {
		cfg.FailOn = *fc.FailOn
	}
	if fc.MinHealth != nil {
		cfg.MinHealth = *fc.MinHealth
	}
	if fc.MaxCycles != nil {
		cfg.MaxCycles = *fc.MaxCycles
	}
	if fc.MaxFindings != nil {
		cfg.MaxFindings = fc.MaxFindings
	}
	if fc.MaxModuleFanout != nil {
		cfg.MaxModuleFanout = *fc.MaxModuleFanout
	}
	if fc.RequireDocCurrent != nil {
		cfg.RequireDocCurrent = *fc.RequireDocCurrent
	}
	if fc.MinBusFactor != nil {
		cfg.MinBusFactor = *fc.MinBusFactor
	}
	cfg.ForbiddenDependencies = fc.ForbiddenDependencies
	cfg.IgnorePaths = fc.IgnorePaths
	return cfg, nil
}

type Violation struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
	File     string `json:"file,omitempty"`
	Line     int    `json:"line,omitempty"`
	EndLine  int    `json:"end_line,omitempty"`
	Rule     string `json:"rule"`
}

type Result struct {
	Repository  models.Repository     `json:"repository"`
	Branch      string                `json:"branch"`
	Verdict     string                `json:"verdict"`
	Passed      bool                  `json:"passed"`
	Health      analysis.HealthSummary `json:"health"`
	Violations  []Violation           `json:"violations"`
	Counts      map[string]int        `json:"counts"`
	Policy      Config                `json:"policy"`
	GeneratedAt string                `json:"generated_at"`
	Limitations []string              `json:"limitations"`
}

// Evaluate runs every configured rule against the indexed repository.
func Evaluate(ctx context.Context, st *store.Store, repo models.Repository, branch string, cfg Config) (Result, error) {
	result := Result{
		Repository: repo, Branch: branch, Violations: []Violation{}, Counts: map[string]int{},
		Policy: cfg, GeneratedAt: platform.Now(),
		Limitations: []string{
			"The gate reads the indexed snapshot in LeKnowde's database, not the working tree. Index the ref before running it.",
			"Findings are deterministic pattern matches and dependency signals, not a formal proof of defects.",
		},
	}
	report, err := analysis.BuildHealthReport(ctx, st, repo.ID, branch, "")
	if err != nil {
		return result, err
	}
	result.Health = report.Summary

	failRank := severityRank(cfg.FailOn)
	if cfg.FailOn != "none" {
		for _, f := range report.Findings {
			if severityRank(f.Severity) < failRank {
				continue
			}
			if ignoredPath(cfg.IgnorePaths, f.FilePath) {
				continue
			}
			result.Violations = append(result.Violations, Violation{
				Code: "finding:" + f.Kind, Severity: f.Severity, Message: f.Title + " — " + f.Description,
				File: f.FilePath, Line: f.StartLine, EndLine: f.EndLine, Rule: "fail_on",
			})
		}
	}
	if cfg.MinHealth > 0 && report.Summary.Score < cfg.MinHealth {
		result.Violations = append(result.Violations, Violation{
			Code: "health_below_budget", Severity: "high", Rule: "min_health",
			Message: fmt.Sprintf("Health score %d is below the policy minimum of %d (grade %s, %d findings).", report.Summary.Score, cfg.MinHealth, report.Summary.Grade, report.Summary.Findings),
		})
	}
	if cfg.MaxCycles >= 0 && len(report.Cycles) > cfg.MaxCycles {
		first := ""
		if len(report.Cycles) > 0 {
			first = strings.TrimPrefix(report.Cycles[0][0], "file:")
		}
		result.Violations = append(result.Violations, Violation{
			Code: "cycle_budget", Severity: "high", Rule: "max_cycles", File: first,
			Message: fmt.Sprintf("%d circular import group(s) exceed the policy maximum of %d.", len(report.Cycles), cfg.MaxCycles),
		})
	}
	for severity, limit := range cfg.MaxFindings {
		count := report.Summary.BySeverity[severity]
		if count > limit {
			result.Violations = append(result.Violations, Violation{
				Code: "finding_budget:" + severity, Severity: severity, Rule: "max_findings",
				Message: fmt.Sprintf("%d %s findings exceed the policy maximum of %d.", count, severity, limit),
			})
		}
	}
	moduleEdges, err := st.ModuleDependencyEdges(ctx, repo.ID)
	if err == nil {
		sort.Slice(moduleEdges, func(i, j int) bool {
			if moduleEdges[i].From != moduleEdges[j].From {
				return moduleEdges[i].From < moduleEdges[j].From
			}
			return moduleEdges[i].To < moduleEdges[j].To
		})
		for _, rule := range cfg.ForbiddenDependencies {
			for _, edge := range moduleEdges {
				if edge.From == edge.To {
					continue
				}
				if matchPattern(rule.From, edge.From) && matchPattern(rule.To, edge.To) {
					reason := strings.TrimSpace(rule.Reason)
					if reason == "" {
						reason = "This dependency direction is forbidden by the repository fitness policy."
					}
					result.Violations = append(result.Violations, Violation{
						Code: "forbidden_dependency", Severity: "high", Rule: "forbidden_dependencies",
						Message: fmt.Sprintf("%s depends on %s (%d file import(s)). %s", edge.From, edge.To, edge.Count, reason),
					})
				}
			}
		}
		if cfg.MaxModuleFanout > 0 {
			fanout := map[string]int{}
			for _, edge := range moduleEdges {
				if edge.From != edge.To {
					fanout[edge.From]++
				}
			}
			mods := make([]string, 0, len(fanout))
			for m := range fanout {
				mods = append(mods, m)
			}
			sort.Strings(mods)
			for _, m := range mods {
				if fanout[m] > cfg.MaxModuleFanout {
					result.Violations = append(result.Violations, Violation{
						Code: "module_fanout", Severity: "medium", Rule: "max_module_fanout",
						Message: fmt.Sprintf("%s depends on %d modules, above the policy maximum of %d.", m, fanout[m], cfg.MaxModuleFanout),
					})
				}
			}
		}
	}
	if cfg.MinBusFactor > 0 {
		ownership, err := analysis.BuildOwnership(ctx, st, repo, branch)
		if err == nil {
			if ownership.RepoBusFactor < cfg.MinBusFactor {
				result.Violations = append(result.Violations, Violation{
					Code: "bus_factor", Severity: "medium", Rule: "min_bus_factor",
					Message: fmt.Sprintf("Repository knowledge bus factor is %d, below the policy minimum of %d. Top author share is %.0f%%.", ownership.RepoBusFactor, cfg.MinBusFactor, ownership.TopAuthorShare*100),
				})
			}
			lowModules := []string{}
			for _, m := range ownership.Modules {
				if m.Touches >= 2 && m.BusFactor > 0 && m.BusFactor < cfg.MinBusFactor {
					lowModules = append(lowModules, fmt.Sprintf("%s (%d)", m.Module, m.BusFactor))
				}
			}
			if len(lowModules) > 0 {
				result.Violations = append(result.Violations, Violation{
					Code: "module_bus_factor", Severity: "low", Rule: "min_bus_factor",
					Message: "Modules below the bus-factor minimum: " + strings.Join(lowModules, ", ") + ".",
				})
			}
		}
	}
	if cfg.RequireDocCurrent {
		docs, err := st.ListDocuments(ctx, repo.ID)
		if err != nil {
			return result, err
		}
		if len(docs) == 0 {
			result.Violations = append(result.Violations, Violation{
				Code: "documentation_missing", Severity: "medium", Rule: "require_doc_current",
				Message: "No generated documentation exists for this repository.",
			})
		} else {
			facts, ferr := analysis.BuildFacts(ctx, st, repo, branch)
			current := ""
			if ferr == nil {
				current = analysis.SourceFingerprint(facts)
			}
			for _, d := range docs {
				if d.SourceFingerprint != "" && current != "" && d.SourceFingerprint != current {
					filePath := d.Path
					if filePath == "" {
						filePath = "docs/" + d.Kind + ".md"
					}
					result.Violations = append(result.Violations, Violation{
						Code: "documentation_drift", Severity: "medium", Rule: "require_doc_current", File: filePath,
						Message: fmt.Sprintf("Generated %s documentation is older than the indexed source. Regenerate it before merging.", d.Kind),
					})
				}
			}
		}
	}

	sortViolations(result.Violations)
	for _, v := range result.Violations {
		result.Counts[v.Severity]++
	}
	result.Counts["total"] = len(result.Violations)
	result.Passed = len(result.Violations) == 0
	result.Verdict = "pass"
	if !result.Passed {
		result.Verdict = "fail"
	}
	return result, nil
}

func sortViolations(list []Violation) {
	rank := func(s string) int { return 5 - severityRank(s) }
	sort.SliceStable(list, func(i, j int) bool {
		if rank(list[i].Severity) != rank(list[j].Severity) {
			return rank(list[i].Severity) < rank(list[j].Severity)
		}
		if list[i].File != list[j].File {
			return list[i].File < list[j].File
		}
		if list[i].Line != list[j].Line {
			return list[i].Line < list[j].Line
		}
		return list[i].Code < list[j].Code
	})
}

func severityRank(s string) int {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	case "info":
		return 0
	default:
		return 3
	}
}

func ignoredPath(patterns []string, file string) bool {
	for _, p := range patterns {
		if matchPattern(p, file) {
			return true
		}
	}
	return false
}

// matchPattern supports * and ? globs. Without a wildcard it matches the exact
// value or a path prefix, which is what most ignore entries mean.
func matchPattern(pattern, value string) bool {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return false
	}
	if !strings.ContainsAny(pattern, "*?") {
		trimmed := strings.TrimSuffix(pattern, "/")
		return value == trimmed || strings.HasPrefix(value, trimmed+"/")
	}
	var b strings.Builder
	b.WriteString("^")
	for _, r := range pattern {
		switch r {
		case '*':
			b.WriteString(".*")
		case '?':
			b.WriteString(".")
		default:
			b.WriteString(regexp.QuoteMeta(string(r)))
		}
	}
	b.WriteString("$")
	re, err := regexp.Compile(b.String())
	if err != nil {
		return false
	}
	return re.MatchString(value)
}
