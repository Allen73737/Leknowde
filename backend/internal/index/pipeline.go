package index

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/leknowde/platform/backend/internal/aiclient"
	"github.com/leknowde/platform/backend/internal/analysis"
	"github.com/leknowde/platform/backend/internal/config"
	"github.com/leknowde/platform/backend/internal/gitprov"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/retrieval"
	"github.com/leknowde/platform/backend/internal/store"
)

// Pipeline executes repository ingestion: provider fetch → file store → parse →
// symbol/graph persistence → embeddings → health findings.
type Pipeline struct {
	store *store.Store
	ai    *aiclient.Client
	cfg   config.Config
	log   *slog.Logger
}

func NewPipeline(st *store.Store, ai *aiclient.Client, cfg config.Config, log *slog.Logger) *Pipeline {
	return &Pipeline{store: st, ai: ai, cfg: cfg, log: log}
}

// StartWorkers launches the background job consumers.
func (p *Pipeline) StartWorkers(ctx context.Context) {
	for i := 0; i < p.cfg.WorkerCount; i++ {
		workerID := fmt.Sprintf("worker-%d", i+1)
		go p.workerLoop(ctx, workerID)
	}
}

func (p *Pipeline) workerLoop(ctx context.Context, workerID string) {
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			job, err := p.store.ClaimJob(ctx, workerID)
			if err != nil {
				p.log.Error("claim job", "error", err)
				continue
			}
			if job == nil {
				continue
			}
			func() {
				defer func() {
					if r := recover(); r != nil {
						p.log.Error("job panic", "job", job.ID, "panic", r)
						p.store.FinishJob(context.Background(), job.ID, "failed", fmt.Sprintf("internal error: %v", r))
						p.store.SetRepositoryStatus(context.Background(), job.RepositoryID, "failed", "")
					}
				}()
				if err := p.Run(ctx, *job); err != nil {
					p.log.Error("job failed", "job", job.ID, "error", err)
					p.store.FinishJob(ctx, job.ID, "failed", err.Error())
					p.store.SetRepositoryStatus(ctx, job.RepositoryID, "failed", "")
					p.store.AppendJobLog(ctx, job.ID, "FAILED: "+err.Error())
				} else {
					p.store.FinishJob(ctx, job.ID, "completed", "")
				}
			}()
		}
	}
}

func (p *Pipeline) step(ctx context.Context, job *models.Job, label string, progress int) {
	p.store.UpdateJobProgress(ctx, job.ID, label, progress, job.FilesProcessed, job.FilesTotal, job.SymbolsFound)
	p.store.AppendJobLog(ctx, job.ID, label)
}

// Run performs a complete ingestion for one job.
func (p *Pipeline) Run(ctx context.Context, job models.Job) error {
	repo, err := p.store.GetRepository(ctx, job.RepositoryID)
	if err != nil {
		return fmt.Errorf("load repository: %w", err)
	}
	if err := p.store.SetRepositoryStatus(ctx, repo.ID, "indexing", ""); err != nil {
		return err
	}
	provider, err := gitprov.New(repo.Provider)
	if err != nil {
		return err
	}
	token := ""
	if repo.Provider != "demo" {
		orgID, err := p.store.WorkspaceOrgID(ctx, repo.WorkspaceID)
		if err != nil {
			return err
		}
		token, _, err = p.store.IntegrationToken(ctx, orgID, repo.Provider)
		if err != nil {
			return fmt.Errorf("no %s integration token is stored for this organization; reconnect the provider", repo.Provider)
		}
	}

	p.step(ctx, &job, "Fetching repository metadata", 3)
	meta, err := provider.GetRepository(ctx, token, repo.Owner, repo.Name)
	if err == nil {
		branch := repo.DefaultBranch
		if meta.DefaultBranch != "" {
			branch = meta.DefaultBranch
		}
		_ = p.store.UpdateRepositoryMeta(ctx, repo.ID, meta.Description, meta.Language, repo.Visibility, meta.HTMLURL, branch)
	} else {
		p.store.AppendJobLog(ctx, job.ID, "Metadata refresh skipped: "+err.Error())
	}

	p.step(ctx, &job, "Discovering branches", 6)
	branches, err := provider.ListBranches(ctx, token, repo.Owner, repo.Name)
	if err != nil {
		return fmt.Errorf("list branches: %w", err)
	}
	for _, b := range branches {
		_ = p.store.UpsertBranch(ctx, repo.ID, b.Name, b.HeadSHA, b.Name == job.Branch || (b.IsDefault && job.Branch == repo.DefaultBranch))
	}
	headSHA := ""
	for _, b := range branches {
		if b.Name == job.Branch {
			headSHA = b.HeadSHA
			break
		}
	}

	p.step(ctx, &job, "Reading commit history", 9)
	commits, err := provider.ListCommits(ctx, token, repo.Owner, repo.Name, job.Branch, 30)
	if err == nil {
		for _, c := range commits {
			_ = p.store.UpsertCommit(ctx, repo.ID, c, job.Branch)
		}
	} else {
		p.store.AppendJobLog(ctx, job.ID, "Commit history unavailable: "+err.Error())
	}

	p.step(ctx, &job, "Listing repository tree", 12)
	entries, err := provider.ListTree(ctx, token, repo.Owner, repo.Name, job.Branch, p.cfg.MaxFilesPerRepo)
	if err != nil {
		return fmt.Errorf("list tree: %w", err)
	}
	job.FilesTotal = len(entries)
	p.store.UpdateJobProgress(ctx, job.ID, "Filtering files", 15, 0, len(entries), 0)
	p.store.AppendJobLog(ctx, job.ID, fmt.Sprintf("%d candidate files after filtering", len(entries)))

	type fetchedFile struct {
		path     string
		sha      string
		language string
		content  string
		lines    int
		fileID   string
		changed  bool
	}
	fetched := make([]fetchedFile, 0, len(entries))
	seenPaths := map[string]bool{}

	for i, entry := range entries {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		lang := gitprov.DetectLanguage(entry.Path)
		fileID, changed := p.store.FileChanged(ctx, repo.ID, job.Branch, entry.Path, entry.SHA)
		_ = fileID
		if !changed {
			seenPaths[entry.Path] = true
			continue
		}
		if entry.Size > int(p.cfg.MaxFileBytes) && entry.Size > 0 {
			p.store.AppendJobLog(ctx, job.ID, "Skipped (too large): "+entry.Path)
			continue
		}
		content, err := provider.GetFile(ctx, token, repo.Owner, repo.Name, entry.Path, job.Branch, p.cfg.MaxFileBytes)
		if err != nil {
			p.store.AppendJobLog(ctx, job.ID, "Skipped (fetch error): "+entry.Path+" — "+err.Error())
			continue
		}
		if isBinaryContent(content) {
			continue
		}
		lineCount := strings.Count(content, "\n") + 1
		id, err := p.store.UpsertFile(ctx, repo.ID, job.Branch, store.FileInput{
			Path: entry.Path, BlobSHA: entry.SHA, Size: len(content), Language: lang,
			IsBinary: false, Content: content, LineCount: lineCount,
		})
		if err != nil {
			return fmt.Errorf("store file %s: %w", entry.Path, err)
		}
		fetched = append(fetched, fetchedFile{path: entry.Path, sha: entry.SHA, language: lang, content: content, lines: lineCount, fileID: id, changed: true})
		seenPaths[entry.Path] = true
		if i%25 == 0 {
			progress := 15 + int(float64(i)/float64(max(len(entries), 1))*25)
			p.store.UpdateJobProgress(ctx, job.ID, "Downloading source", progress, i, len(entries), 0)
		}
	}
	// Remove files that disappeared from the branch.
	existing, _ := p.store.ListFilePaths(ctx, repo.ID, job.Branch)
	for _, f := range existing {
		if !seenPaths[f.Path] {
			_ = p.store.DeleteFile(ctx, repo.ID, job.Branch, f.Path)
		}
	}

	p.step(ctx, &job, fmt.Sprintf("Parsing %d changed files", len(fetched)), 45)
	parsed := make([]analysis.ParsedFile, 0, len(fetched))
	parserName := "regex-fallback"
	batchSize := 20
	for start := 0; start < len(fetched); start += batchSize {
		end := start + batchSize
		if end > len(fetched) {
			end = len(fetched)
		}
		batch := fetched[start:end]
		inputs := make([]aiclient.ParseFileInput, 0, len(batch))
		fallbacks := map[string]analysis.ParsedFile{}
		for _, f := range batch {
			if !gitprov.IsIndexable(f.language) {
				continue
			}
			inputs = append(inputs, aiclient.ParseFileInput{Path: f.path, Language: f.language, Content: f.content})
			fallbacks[f.path] = analysis.FallbackParse(f.path, f.language, f.content)
		}
		results := map[string]analysis.ParsedFile{}
		if len(inputs) > 0 {
			parseCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
			resp, err := p.ai.Parse(parseCtx, inputs)
			cancel()
			if err != nil {
				p.store.AppendJobLog(ctx, job.ID, "Parser service unavailable, using deterministic fallback: "+err.Error())
			} else {
				parserName = resp.Parser
				for _, pf := range resp.Files {
					results[pf.Path] = pf
				}
			}
		}
		for _, f := range batch {
			pf, ok := results[f.path]
			if !ok {
				pf = fallbacks[f.path]
				if pf.Path == "" {
					pf = analysis.ParsedFile{Path: f.path, Language: f.language, Symbols: []analysis.ParsedSymbol{}, Imports: []analysis.ParsedImport{}, Calls: []analysis.ParsedCall{}, Routes: []analysis.ParsedRoute{}, APICalls: []analysis.ParsedAPICall{}}
				}
			}
			parsed = append(parsed, pf)
		}
		progress := 45 + int(float64(end)/float64(max(len(fetched), 1))*25)
		p.store.UpdateJobProgress(ctx, job.ID, "Parsing source", progress, end, len(fetched), job.SymbolsFound)
	}

	// Persist symbols.
	p.step(ctx, &job, "Extracting symbols", 72)
	fileIDByPath := map[string]string{}
	languageByPath := map[string]string{}
	for _, f := range fetched {
		fileIDByPath[f.path] = f.fileID
		languageByPath[f.path] = f.language
	}
	symbolCount := 0
	for _, pf := range parsed {
		fileID, ok := fileIDByPath[pf.Path]
		if !ok {
			continue
		}
		inputs := make([]store.SymbolInput, 0, len(pf.Symbols))
		for _, s := range pf.Symbols {
			inputs = append(inputs, store.SymbolInput{
				Kind: s.Kind, Name: s.Name, QualifiedName: s.QualifiedName, Signature: s.Signature,
				StartLine: s.StartLine, EndLine: s.EndLine, ParentIndex: s.ParentIndex,
				Exported: s.Exported, DocComment: s.DocComment, Metadata: s.Metadata,
			})
		}
		n, err := p.store.ReplaceFileSymbols(ctx, repo.ID, fileID, pf.Path, inputs)
		if err != nil {
			return fmt.Errorf("store symbols for %s: %w", pf.Path, err)
		}
		symbolCount += n
	}
	job.SymbolsFound = symbolCount

	// Build graph.
	p.step(ctx, &job, "Building dependency graph", 80)
	if err := p.buildGraph(ctx, repo, job.Branch, parsed, fileIDByPath); err != nil {
		return fmt.Errorf("build graph: %w", err)
	}

	// Embeddings.
	p.step(ctx, &job, "Embedding source chunks", 88)
	for _, f := range fetched {
		chunks := chunkContent(f.content, 60, 12)
		_ = p.store.DeleteEmbeddingsForSource(ctx, repo.ID, "file", f.fileID)
		for idx, chunk := range chunks {
			vec := retrieval.Embed(chunk)
			if err := p.store.UpsertEmbedding(ctx, repo.ID, "file", f.fileID, f.path, idx, chunk, vec, "lexical-hash-v1"); err != nil {
				return fmt.Errorf("store embedding: %w", err)
			}
		}
	}

	// Health findings.
	p.step(ctx, &job, "Analysing software health", 94)
	findings, err := analysis.BuildFindings(ctx, p.store, repo.ID, job.Branch)
	if err != nil {
		p.store.AppendJobLog(ctx, job.ID, "Health analysis warning: "+err.Error())
	} else if err := p.store.ReplaceFindings(ctx, repo.ID, findings); err != nil {
		return err
	}

	if err := p.store.SetRepositoryStatus(ctx, repo.ID, "ready", headSHA); err != nil {
		return err
	}
	p.store.UpdateJobProgress(ctx, job.ID, "Completed", 100, len(fetched), len(entries), symbolCount)
	p.store.AppendJobLog(ctx, job.ID, fmt.Sprintf("Indexed %d files, %d symbols, parser=%s", len(fetched), symbolCount, parserName))
	_ = p.store.SetRepositoryParser(ctx, repo.ID, parserName)

	// Notify the repository owner.
	if owner, err := p.store.WorkspaceOwner(ctx, repo.WorkspaceID); err == nil {
		p.store.Notify(ctx, owner, repo.WorkspaceID, "success", "Indexing complete",
			fmt.Sprintf("%s is ready: %d files, %d symbols.", repo.FullName, len(fetched), symbolCount),
			"/app/repositories/"+repo.ID)
	}
	return nil
}

func (p *Pipeline) buildGraph(ctx context.Context, repo models.Repository, branch string, parsed []analysis.ParsedFile, fileIDByPath map[string]string) error {
	fileIndex := map[string]bool{}
	for p := range fileIDByPath {
		fileIndex[p] = true
	}
	// Clear previous graph for this branch so deletions and moves do not leave
	// stale relationships behind.
	if err := p.store.ClearGraph(ctx, repo.ID); err != nil {
		return err
	}

	// Index symbols by name for call resolution.
	symbolByName := map[string][]struct{ key, file string }{}
	for _, pf := range parsed {
		for _, s := range pf.Symbols {
			key := "symbol:" + pf.Path + "#" + s.QualifiedName
			symbolByName[s.Name] = append(symbolByName[s.Name], struct{ key, file string }{key, pf.Path})
		}
	}

	moduleSet := map[string]bool{}
	for _, pf := range parsed {
		fileKey := "file:" + pf.Path
		_, _ = p.store.UpsertNode(ctx, repo.ID, "file", fileKey, path.Base(pf.Path), pf.Path, map[string]any{
			"language": pf.Language, "lines": pf.Metrics.LOC,
		})
		module := moduleOf(pf.Path)
		if module != "" {
			moduleSet[module] = true
			_ = p.store.UpsertEdge(ctx, repo.ID, fileKey, "module:"+module, "CONTAINS", pf.Path, 0, 1, nil)
		}
		isTest := strings.Contains(strings.ToLower(pf.Path), "test") || strings.Contains(strings.ToLower(pf.Path), "spec")
		if isTest {
			_, _ = p.store.UpsertNode(ctx, repo.ID, "test", "test:"+pf.Path, path.Base(pf.Path), pf.Path, nil)
		}

		for _, s := range pf.Symbols {
			key := "symbol:" + pf.Path + "#" + s.QualifiedName
			kind := s.Kind
			if kind == "entity" {
				_, _ = p.store.UpsertNode(ctx, repo.ID, "entity", "entity:"+s.Name, s.Name, pf.Path, nil)
				continue
			}
			_, _ = p.store.UpsertNode(ctx, repo.ID, kind, key, s.Name, pf.Path, map[string]any{
				"start_line": s.StartLine, "end_line": s.EndLine, "signature": s.Signature,
			})
			_ = p.store.UpsertEdge(ctx, repo.ID, fileKey, key, "CONTAINS", pf.Path, s.StartLine, 1, nil)
		}

		for _, imp := range pf.Imports {
			target := resolveImport(pf.Path, imp.Specifier, fileIndex)
			if target == "" || target == pf.Path {
				continue
			}
			_ = p.store.UpsertEdge(ctx, repo.ID, fileKey, "file:"+target, "IMPORTS", pf.Path, imp.Line, 0.95, map[string]any{"specifier": imp.Specifier})
			if isTest {
				_ = p.store.UpsertEdge(ctx, repo.ID, "test:"+pf.Path, "file:"+target, "TESTS", pf.Path, imp.Line, 0.8, nil)
			}
		}

		for _, call := range pf.Calls {
			candidates := symbolByName[call.Callee]
			target := ""
			for _, c := range candidates {
				if c.file == pf.Path {
					target = c.key
					break
				}
			}
			if target == "" && len(candidates) == 1 {
				target = candidates[0].key
			}
			if target == "" {
				continue
			}
			// Attribute the call to the enclosing symbol when possible.
			from := fileKey
			best := -1
			for _, s := range pf.Symbols {
				if s.StartLine <= call.Line && s.EndLine >= call.Line && s.StartLine > best {
					best = s.StartLine
					from = "symbol:" + pf.Path + "#" + s.QualifiedName
				}
			}
			_ = p.store.UpsertEdge(ctx, repo.ID, from, target, "CALLS", pf.Path, call.Line, 0.85, nil)
		}

		for _, route := range pf.Routes {
			apiKey := "api:" + strings.ToUpper(route.Method) + ":" + route.Path
			_, _ = p.store.UpsertNode(ctx, repo.ID, "api", apiKey, strings.ToUpper(route.Method)+" "+route.Path, pf.Path, map[string]any{"method": route.Method, "path": route.Path})
			_ = p.store.UpsertEdge(ctx, repo.ID, fileKey, apiKey, "EXPOSES", pf.Path, route.Line, 0.95, map[string]any{"handler": route.Handler})
		}
		for _, call := range pf.APICalls {
			// Match a consumed API to a declared route when the path suffix matches.
			for _, other := range parsed {
				for _, route := range other.Routes {
					if route.Path == call.Path || strings.HasSuffix(call.Path, route.Path) || strings.HasSuffix(route.Path, call.Path) {
						apiKey := "api:" + strings.ToUpper(route.Method) + ":" + route.Path
						_ = p.store.UpsertEdge(ctx, repo.ID, fileKey, apiKey, "CONSUMES", pf.Path, call.Line, 0.7, nil)
					}
				}
			}
		}
		if strings.Contains(strings.ToLower(pf.Path), "client") || strings.Contains(strings.ToLower(pf.Path), "api") {
			_, _ = p.store.UpsertNode(ctx, repo.ID, "service", "service:"+module, module, pf.Path, nil)
		}
		_ = pf.DuplicationHash
	}

	for module := range moduleSet {
		_, _ = p.store.UpsertNode(ctx, repo.ID, "module", "module:"+module, module, "", nil)
	}
	// Aggregate module dependencies from file-level imports.
	moduleEdges, err := p.store.ModuleDependencyEdges(ctx, repo.ID)
	if err != nil {
		return err
	}
	for _, me := range moduleEdges {
		if me.From == me.To {
			continue
		}
		_ = p.store.UpsertEdge(ctx, repo.ID, "module:"+me.From, "module:"+me.To, "DEPENDS_ON", "", 0, 1, map[string]any{"files": me.Count})
	}
	return nil
}

// ClearGraph and SetRepositoryParser are small helpers kept on the store.
func (p *Pipeline) clearAll(ctx context.Context, repoID string) error {
	return p.store.ClearGraph(ctx, repoID)
}

func moduleOf(p string) string {
	parts := strings.Split(strings.ReplaceAll(p, "\\", "/"), "/")
	if len(parts) <= 1 {
		return "root"
	}
	// Use the first two path segments as the module boundary when they exist.
	if parts[0] == "src" || parts[0] == "app" || parts[0] == "server" || parts[0] == "web" || parts[0] == "packages" {
		if len(parts) >= 3 {
			return parts[0] + "/" + parts[1]
		}
		return parts[0]
	}
	return parts[0]
}

var resolutionExtensions = []string{"", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".sql", ".json", ".vue", ".svelte"}

// resolveImport maps an import specifier to a repository file path.
func resolveImport(fromPath, specifier string, files map[string]bool) string {
	if specifier == "" || strings.HasPrefix(specifier, "@") && !strings.Contains(specifier, "/") {
		return ""
	}
	spec := strings.TrimSpace(specifier)
	if strings.HasPrefix(spec, ".") {
		base := path.Clean(path.Join(path.Dir(fromPath), spec))
		for _, ext := range resolutionExtensions {
			if files[base+ext] {
				return base + ext
			}
			for _, idx := range []string{"/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/__init__.py", "/mod.go"} {
				if files[base+ext+idx] {
					return base + ext + idx
				}
			}
		}
		return ""
	}
	// Go module imports and Python dotted modules.
	candidate := strings.ReplaceAll(spec, ".", "/")
	for _, prefix := range []string{"", "src/", "server/src/", "web/src/", "app/", "internal/", "lib/"} {
		base := prefix + candidate
		for _, ext := range resolutionExtensions {
			if files[base+ext] {
				return base + ext
			}
			if files[base+ext+"/index.ts"] {
				return base + ext + "/index.ts"
			}
		}
	}
	return ""
}

func chunkContent(content string, size, overlap int) []string {
	lines := strings.Split(content, "\n")
	if len(lines) == 0 {
		return nil
	}
	if size <= 0 {
		size = 60
	}
	if overlap >= size {
		overlap = size / 4
	}
	chunks := []string{}
	for start := 0; start < len(lines); start += size - overlap {
		end := start + size
		if end > len(lines) {
			end = len(lines)
		}
		chunk := strings.Join(lines[start:end], "\n")
		if strings.TrimSpace(chunk) == "" {
			if end >= len(lines) {
				break
			}
			continue
		}
		chunks = append(chunks, chunk)
		if end >= len(lines) {
			break
		}
		if len(chunks) > 400 {
			break
		}
	}
	return chunks
}

func isBinaryContent(content string) bool {
	if strings.IndexByte(content, 0) >= 0 {
		return true
	}
	sample := content
	if len(sample) > 2048 {
		sample = sample[:2048]
	}
	nonPrintable := 0
	for _, r := range sample {
		if r < 9 || (r > 13 && r < 32) {
			nonPrintable++
		}
	}
	return float64(nonPrintable)/float64(max(len(sample), 1)) > 0.05
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// Ensure JSON is imported for future metadata extensions.
var _ = json.Marshal
var _ = sort.Strings
