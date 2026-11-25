package analysis

import (
	"context"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

// HealthReport is the complete deterministic health payload shared by the HTTP
// handler and the CI gate so both report exactly the same numbers.
type HealthReport struct {
	Summary    HealthSummary  `json:"summary"`
	Findings   []models.Finding `json:"findings"`
	Cycles     [][]string     `json:"cycles"`
	UnusedImports []map[string]any `json:"unused_import_candidates"`
	Metrics    Metrics        `json:"metrics"`
	Stats      store.RepoStats `json:"stats"`
}

// BuildHealthReport assembles stored findings and graph metrics into one
// explainable report.
func BuildHealthReport(ctx context.Context, st *store.Store, repoID, branch, severity string) (HealthReport, error) {
	report := HealthReport{
		Findings: []models.Finding{}, Cycles: [][]string{}, UnusedImports: []map[string]any{},
	}
	findings, err := st.ListFindings(ctx, repoID, severity)
	if err != nil {
		return report, err
	}
	stats, _ := st.RepoStats(ctx, repoID, branch)
	cycles, _ := st.FindCycles(ctx, repoID)
	unused, _ := st.UnusedImportCandidates(ctx, repoID)
	metrics := Metrics{
		Files: stats.Files, Lines: stats.Lines, Functions: stats.Functions,
		CircularGroups: len(cycles), DuplicateBlocks: 0,
	}
	for _, f := range findings {
		if f.Kind == "duplication" {
			metrics.DuplicateBlocks++
		}
		if f.Kind == "missing_tests" {
			metrics.UntestedFiles++
		}
	}
	// Complexity uses the same branch-keyword count as BuildFindings so the
	// displayed averages and the findings cannot disagree.
	var sourceFiles, totalComplexity, maxComplexity, commentLines, sloc int
	rows, err := st.DB.QueryContext(ctx, `SELECT language, line_count, content FROM repository_files
		WHERE repository_id = ? AND branch = ? AND is_binary = 0`, repoID, branch)
	if err == nil {
		for rows.Next() {
			var language, content string
			var lines int
			if rows.Scan(&language, &lines, &content) != nil {
				continue
			}
			if language == "Markdown" || language == "JSON" || language == "YAML" || language == "Config" || language == "SQL" {
				continue
			}
			sourceFiles++
			complexity := 1
			blank := 0
			for _, line := range splitLines(content) {
				trimmed := trimSpace(line)
				if trimmed == "" {
					blank++
					continue
				}
				if hasCommentPrefix(trimmed) {
					commentLines++
				}
				complexity += len(reBranch.FindAllString(line, -1))
			}
			sloc += lines - blank
			totalComplexity += complexity
			if complexity > maxComplexity {
				maxComplexity = complexity
			}
		}
		rows.Close()
	}
	if sourceFiles > 0 {
		metrics.AverageComplexity = float64(totalComplexity) / float64(sourceFiles)
	}
	metrics.MaxComplexity = maxComplexity
	if sloc > 0 {
		metrics.CommentRatio = float64(commentLines) / float64(sloc)
	}
	var symbolRows, totalLength int
	srows, err := st.DB.QueryContext(ctx, `SELECT start_line, end_line FROM code_symbols WHERE repository_id = ?`, repoID)
	if err == nil {
		for srows.Next() {
			var start, end int
			if srows.Scan(&start, &end) == nil && end > start {
				symbolRows++
				totalLength += end - start
			}
		}
		srows.Close()
	}
	if symbolRows > 0 {
		metrics.AverageFunctionLength = float64(totalLength) / float64(symbolRows)
	}
	summary := SummariseHealth(findings, metrics)
	report.Summary = summary
	report.Findings = findings
	report.Cycles = cycles
	report.UnusedImports = unused
	report.Metrics = metrics
	report.Stats = stats
	return report, nil
}

func splitLines(s string) []string { return strings.Split(s, "\n") }

func trimSpace(s string) string { return strings.TrimSpace(s) }

func hasCommentPrefix(s string) bool {
	return strings.HasPrefix(s, "//") || strings.HasPrefix(s, "#") || strings.HasPrefix(s, "*") ||
		strings.HasPrefix(s, "/*") || strings.HasPrefix(s, "<!--")
}
