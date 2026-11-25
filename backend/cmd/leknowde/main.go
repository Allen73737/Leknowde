// Package main is the leknowde command line interface. It exposes the same
// deterministic analysis surfaces as the API so CI jobs and local reviews can
// gate on them with non-zero exit codes and structured output.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/leknowde/platform/backend/internal/analysis"
	"github.com/leknowde/platform/backend/internal/aiclient"
	"github.com/leknowde/platform/backend/internal/auth"
	"github.com/leknowde/platform/backend/internal/check"
	"github.com/leknowde/platform/backend/internal/config"
	"github.com/leknowde/platform/backend/internal/contracts"
	"github.com/leknowde/platform/backend/internal/httpapi"
	"github.com/leknowde/platform/backend/internal/index"
	"github.com/leknowde/platform/backend/internal/platform"
	"github.com/leknowde/platform/backend/internal/secure"
	"github.com/leknowde/platform/backend/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: leknowde <command> [flags]")
		fmt.Fprintln(os.Stderr, "commands: check, contracts, snapshot, diff, ownership, test-select, serve")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "check":
		runCheck(os.Args[2:])
	case "contracts":
		runContracts(os.Args[2:])
	case "snapshot":
		runSnapshot(os.Args[2:])
	case "diff":
		runDiff(os.Args[2:])
	case "ownership":
		runOwnership(os.Args[2:])
	case "test-select":
		runTestSelect(os.Args[2:])
	case "serve":
		runServer()
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
		os.Exit(2)
	}
}

func loadDeps() (*config.Config, *store.Store, *auth.Manager, *aiclient.Client, *index.Pipeline, *slog.Logger, func()) {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: httpapi.LogLevelFor(cfg.LogLevel)}))
	slog.SetDefault(logger)
	db, err := platform.Open(cfg)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	if err := platform.Migrate(context.Background(), db); err != nil {
		logger.Error("migration failed", "error", err)
		os.Exit(1)
	}
	cipher, err := secure.NewCipher(cfg.EncryptionKey, cfg.JWTSecret)
	if err != nil {
		logger.Error("encryption initialisation failed", "error", err)
		os.Exit(1)
	}
	st := store.New(db, cipher)
	mgr := auth.NewManager(cfg.JWTSecret)
	ai := aiclient.New(cfg.AIServiceURL, cfg.AIInternalToken, time.Duration(cfg.AITimeoutSec)*time.Second)
	pipeline := index.NewPipeline(st, ai, cfg, logger)
	pipeline.StartWorkers(context.Background())
	return &cfg, st, mgr, ai, pipeline, logger, func() { _ = db.Close() }
}

func runCheck(args []string) {
	var (
		repo        string
		branch      string
		policy      string
		format      string
		minHealth   int
		maxCycles   int
		failOn      string
		minBusFactor int
	)
	fs := flag.NewFlagSet("check", flag.ExitOnError)
	fs.StringVar(&repo, "repo", "", "repository id or owner/name")
	fs.StringVar(&branch, "branch", "", "indexed branch (defaults to the repository default branch)")
	fs.StringVar(&policy, "policy", "", "path to a JSON fitness policy file")
	fs.StringVar(&format, "format", "text", "text|json|annotations (GitHub/GitLab)")
	fs.IntVar(&minHealth, "min-health", -1, "minimum health score")
	fs.IntVar(&maxCycles, "max-cycles", -1, "maximum circular import groups")
	fs.StringVar(&failOn, "fail-on", "", "minimum finding severity that fails (none|info|low|medium|high|critical)")
	fs.IntVar(&minBusFactor, "min-bus-factor", -1, "minimum repository bus factor")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	_, st, _, _, _, _, close := loadDeps()
	defer close()
	policyCfg, err := check.LoadConfig(policy)
	if err != nil {
		fmt.Fprintln(os.Stderr, "policy load failed:", err)
		os.Exit(1)
	}
	if minHealth >= 0 {
		policyCfg.MinHealth = minHealth
	}
	if maxCycles >= 0 {
		policyCfg.MaxCycles = maxCycles
	}
	if failOn != "" {
		policyCfg.FailOn = failOn
	}
	if minBusFactor >= 0 {
		policyCfg.MinBusFactor = minBusFactor
	}
	target, err := st.ResolveRepository(context.Background(), repo)
	if err != nil {
		fmt.Fprintln(os.Stderr, "repository not found:", err)
		os.Exit(1)
	}
	if branch == "" {
		branch = target.DefaultBranch
	}
	result, err := check.Evaluate(context.Background(), st, target, branch, policyCfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "check failed:", err)
		os.Exit(1)
	}
	switch format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(result)
	case "annotations":
		printAnnotations(result)
	default:
		printText(result)
	}
	if !result.Passed {
		os.Exit(1)
	}
}

func runContracts(args []string) {
	var (
		repo    string
		branch  string
		format  string
	)
	fs := flag.NewFlagSet("contracts", flag.ExitOnError)
	fs.StringVar(&repo, "repo", "", "repository id or owner/name")
	fs.StringVar(&branch, "branch", "", "indexed branch (defaults to the repository default branch)")
	fs.StringVar(&format, "format", "text", "text|json")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	_, st, _, _, _, _, close := loadDeps()
	defer close()
	target, err := st.ResolveRepository(context.Background(), repo)
	if err != nil {
		fmt.Fprintln(os.Stderr, "repository not found:", err)
		os.Exit(1)
	}
	if branch == "" {
		branch = target.DefaultBranch
	}
	contractsList, err := st.ListAPIContracts(context.Background(), target.ID, branch)
	if err != nil {
		fmt.Fprintln(os.Stderr, "contracts load failed:", err)
		os.Exit(1)
	}
	producers := []contracts.Contract{}
	consumers := []contracts.Contract{}
	for _, c := range contractsList {
		c.RepositoryName = target.FullName
		if c.Direction == contracts.DirectionProducer {
			producers = append(producers, c)
		} else {
			consumers = append(consumers, c)
		}
	}
	surface := contracts.Match(producers, consumers)
	if format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(surface)
		return
	}
	fmt.Printf("Repository %s · branch %s\n", target.FullName, branch)
	fmt.Printf("Producers: %d  Consumers: %d  Links: %d  Cross-repo links: %d\n",
		len(producers), len(consumers), len(surface.Links), surface.CrossRepoLinks)
	if len(surface.Unmatched) > 0 {
		fmt.Println("\nUnmatched consumers:")
		for _, c := range surface.Unmatched {
			fmt.Printf("  %-35s %s %s (%s)\n", c.FilePath, c.Method, c.Path, c.RepositoryName)
		}
	}
	if len(surface.OrphanProducers) > 0 {
		fmt.Println("\nOrphan producers (no consumer):")
		for _, c := range surface.OrphanProducers {
			fmt.Printf("  %-35s %s %s\n", c.FilePath, c.Method, c.Path)
		}
	}
	fmt.Println("\nLimitations:")
	for _, l := range surface.Limitations {
		fmt.Println("  -", l)
	}
}

func runSnapshot(args []string) {
	var (
		repo   string
		branch string
		label  string
	)
	fs := flag.NewFlagSet("snapshot", flag.ExitOnError)
	fs.StringVar(&repo, "repo", "", "repository id or owner/name")
	fs.StringVar(&branch, "branch", "", "indexed branch")
	fs.StringVar(&label, "label", "", "human readable label")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	_, st, _, _, _, _, close := loadDeps()
	defer close()
	target, err := st.ResolveRepository(context.Background(), repo)
	if err != nil {
		fmt.Fprintln(os.Stderr, "repository not found:", err)
		os.Exit(1)
	}
	if branch == "" {
		branch = target.DefaultBranch
	}
	contractCount, err := st.RefreshAPIContracts(context.Background(), target.ID, branch, target.LastIndexedCommit)
	if err != nil {
		fmt.Fprintln(os.Stderr, "contract refresh failed:", err)
		os.Exit(1)
	}
	snap, err := st.CreateArchitectureSnapshot(context.Background(), target.ID, branch, target.LastIndexedCommit, label)
	if err != nil {
		fmt.Fprintln(os.Stderr, "snapshot failed:", err)
		os.Exit(1)
	}
	fmt.Printf("Refreshed %d contracts. Snapshot %s · %s@%s · %d nodes, %d edges, %d files, %d producers, %d consumers, %d cycles\n",
		contractCount, snap.ID, snap.Branch, snap.CommitSHA[:8], snap.Nodes, snap.Edges, snap.Files, snap.Producers, snap.Consumers, snap.Cycles)
}

func runDiff(args []string) {
	var (
		repo   string
		base   string
		head   string
		format string
	)
	fs := flag.NewFlagSet("diff", flag.ExitOnError)
	fs.StringVar(&repo, "repo", "", "repository id or owner/name")
	fs.StringVar(&base, "base", "", "base branch/commit (required)")
	fs.StringVar(&head, "head", "", "head branch/commit (required)")
	fs.StringVar(&format, "format", "text", "text|json")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if base == "" || head == "" {
		fmt.Fprintln(os.Stderr, "--base and --head are required")
		os.Exit(2)
	}
	_, st, _, _, _, _, close := loadDeps()
	defer close()
	target, err := st.ResolveRepository(context.Background(), repo)
	if err != nil {
		fmt.Fprintln(os.Stderr, "repository not found:", err)
		os.Exit(1)
	}
	baseSnap, err := st.ResolveSnapshot(context.Background(), target.ID, base, "")
	if err != nil {
		fmt.Fprintln(os.Stderr, "base snapshot not found:", err)
		os.Exit(1)
	}
	headSnap, err := st.ResolveSnapshot(context.Background(), target.ID, head, "")
	if err != nil {
		fmt.Fprintln(os.Stderr, "head snapshot not found:", err)
		os.Exit(1)
	}
	diff := analysis.CompareSnapshots(baseSnap, headSnap)
	if format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(diff)
		return
	}
	fmt.Printf("Architecture diff %s → %s\n", refLabel(baseSnap), refLabel(headSnap))
	fmt.Printf("Drift score %d (%s) — %d files added, %d removed, %d coupling delta\n",
		diff.DriftScore, diff.DriftLevel, len(diff.AddedFiles), len(diff.RemovedFiles), diff.CouplingDelta)
	fmt.Println("Summary:")
	for _, s := range diff.Summary {
		fmt.Println("  -", s)
	}
	fmt.Println("Limitations:")
	for _, l := range diff.Limitations {
		fmt.Println("  -", l)
	}
}

func runOwnership(args []string) {
	var (
		repo   string
		branch string
	)
	fs := flag.NewFlagSet("ownership", flag.ExitOnError)
	fs.StringVar(&repo, "repo", "", "repository id or owner/name")
	fs.StringVar(&branch, "branch", "", "indexed branch")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	_, st, _, _, _, _, close := loadDeps()
	defer close()
	target, err := st.ResolveRepository(context.Background(), repo)
	if err != nil {
		fmt.Fprintln(os.Stderr, "repository not found:", err)
		os.Exit(1)
	}
	if branch == "" {
		branch = target.DefaultBranch
	}
	report, err := analysis.BuildOwnership(context.Background(), st, target, branch)
	if err != nil {
		fmt.Fprintln(os.Stderr, "ownership failed:", err)
		os.Exit(1)
	}
	fmt.Printf("Ownership %s · branch %s · bus factor %d · top share %.0f%% · %d touched files\n",
		target.FullName, branch, report.RepoBusFactor, report.TopAuthorShare*100, len(report.Files))
	fmt.Println("Top authors:")
	for i := 0; i < len(report.Authors) && i < 5; i++ {
		a := report.Authors[i]
		fmt.Printf("  %-20s %d commits · %d files · %d touches\n", a.Name, a.Commits, a.Files, a.Touches)
	}
	fmt.Println("Top hotspots:")
	for i := 0; i < len(report.Hotspots) && i < 5; i++ {
		h := report.Hotspots[i]
		fmt.Printf("  %-40s score %d · bus %d · %s\n", h.Path, h.Score, h.BusFactor, h.Reason)
	}
	fmt.Println("Suggested CODEOWNERS:")
	if len(report.Codeowners) == 0 {
		fmt.Println("  (no confident module ownership detected)")
	}
	for _, r := range report.Codeowners {
		fmt.Printf("  %s%s  %s  %.0f%%\n", r.Pattern, r.Handle, r.Owner, r.Share*100)
	}
	fmt.Println("Limitations:")
	for _, l := range report.Limitations {
		fmt.Println("  -", l)
	}
}

func runTestSelect(args []string) {
	var (
		repo    string
		branch  string
		format  string
		changed string
	)
	fs := flag.NewFlagSet("test-select", flag.ExitOnError)
	fs.StringVar(&repo, "repo", "", "repository id or owner/name")
	fs.StringVar(&branch, "branch", "", "indexed branch")
	fs.StringVar(&format, "format", "text", "text|json")
	fs.StringVar(&changed, "changed", "", "comma separated changed paths")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	_, st, _, _, _, _, close := loadDeps()
	defer close()
	target, err := st.ResolveRepository(context.Background(), repo)
	if err != nil {
		fmt.Fprintln(os.Stderr, "repository not found:", err)
		os.Exit(1)
	}
	if branch == "" {
		branch = target.DefaultBranch
	}
	paths := []string{}
	if changed != "" {
		for _, p := range strings.Split(changed, ",") {
			if strings.TrimSpace(p) != "" {
				paths = append(paths, strings.TrimSpace(p))
			}
		}
	}
	selection, err := analysis.SelectTests(context.Background(), st, target, branch, paths)
	if err != nil {
		fmt.Fprintln(os.Stderr, "test selection failed:", err)
		os.Exit(1)
	}
	if format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(selection)
		return
	}
	fmt.Printf("Test selection %s · branch %s · %d changed files\n", target.FullName, branch, len(selection.ChangedFiles))
	fmt.Printf("Runner: %s\nCommand: %s\nConfidence: %s (%d/100)\n",
		selection.Runner, selection.Command, selection.Confidence, selection.ConfidenceScore)
	fmt.Println("Selected tests:")
	for _, t := range selection.SelectedTests {
		fmt.Println("  -", t)
	}
	fmt.Println("Unmapped source files:")
	for _, p := range selection.UnmappedFiles {
		fmt.Println("  -", p)
	}
	fmt.Println("Caveats:")
	for _, c := range selection.Caveats {
		fmt.Println("  -", c)
	}
}

func runServer() {
	httpapi.Main()
}

func printText(result check.Result) {
	fmt.Printf("leknowde check — %s · branch %s\n", result.Repository.FullName, result.Branch)
	fmt.Printf("Verdict: %s · health %d/100 (%s) · %d findings · %d violations\n",
		result.Verdict, result.Health.Score, result.Health.Grade, result.Health.Findings, len(result.Violations))
	fmt.Println("Limitations:")
	for _, l := range result.Limitations {
		fmt.Println("  -", l)
	}
	for _, v := range result.Violations {
		loc := ""
		if v.File != "" {
			loc = v.File
			if v.Line > 0 {
				loc += fmt.Sprintf(":%d", v.Line)
			}
		}
		fmt.Printf("  [%s] %s %s %s\n", v.Severity, v.Code, loc, v.Message)
	}
}

func printAnnotations(result check.Result) {
	for _, v := range result.Violations {
		level := "notice"
		switch v.Severity {
		case "critical", "high":
			level = "error"
		case "medium":
			level = "warning"
		default:
			level = "notice"
		}
		file := v.File
		line := v.Line
		if line == 0 {
			line = 1
		}
		fmt.Printf("::%s file=%s,line=%d,col=1,endColumn=1::%s: %s\n", level, shellEscape(file), line, v.Code, shellEscape(v.Message))
	}
}

func shellEscape(s string) string {
	return strings.NewReplacer("%", "%25", "\r", "%0D", "\n", "%0A").Replace(s)
}

func refLabel(s store.ArchitectureSnapshot) string {
	label := s.Branch
	if label == "" {
		label = "unknown branch"
	}
	if s.CommitSHA != "" {
		sha := s.CommitSHA
		if len(sha) > 8 {
			sha = sha[:8]
		}
		label += "@" + sha
	}
	return label
}
