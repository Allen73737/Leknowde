package analysis

import (
	"fmt"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/store"
)

// TemporalDiff compares two architecture snapshots captured at index time.
type TemporalDiff struct {
	Base     SnapshotRef       `json:"base"`
	Head     SnapshotRef       `json:"head"`
	AddedFiles   []string      `json:"added_files"`
	RemovedFiles []string      `json:"removed_files"`
	AddedModuleEdges   []ModuleEdgeChange `json:"added_module_edges"`
	RemovedModuleEdges []ModuleEdgeChange `json:"removed_module_edges"`
	ChangedModuleEdges []ModuleEdgeChange `json:"changed_module_edges"`
	NewCycles      [][]string  `json:"new_cycles"`
	ResolvedCycles [][]string  `json:"resolved_cycles"`
	AddedAPIs      []string    `json:"added_apis"`
	RemovedAPIs    []string    `json:"removed_apis"`
	CouplingDelta  int         `json:"coupling_delta"`
	CrossModuleDelta int       `json:"cross_module_delta"`
	EdgeDelta      int         `json:"edge_delta"`
	FileDelta      int         `json:"file_delta"`
	DriftScore     int         `json:"drift_score"`
	DriftLevel     string      `json:"drift_level"`
	DriftFactors   []DriftFactor `json:"drift_factors"`
	Summary        []string    `json:"summary"`
	Limitations    []string    `json:"limitations"`
}

type SnapshotRef struct {
	ID        string `json:"id"`
	CommitSHA string `json:"commit_sha"`
	Branch    string `json:"branch"`
	Label     string `json:"label"`
	CreatedAt string `json:"created_at"`
	Nodes     int    `json:"nodes"`
	Edges     int    `json:"edges"`
	Files     int    `json:"files"`
	Modules   int    `json:"modules"`
	Producers int    `json:"api_producers"`
	Consumers int    `json:"api_consumers"`
	Cycles    int    `json:"cycles"`
}

type ModuleEdgeChange struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Before int    `json:"before"`
	After  int    `json:"after"`
	Delta  int    `json:"delta"`
}

type DriftFactor struct {
	Label  string `json:"label"`
	Points int    `json:"points"`
	Detail string `json:"detail"`
}

// CompareSnapshots produces a deterministic, explainable diff. Snapshots are
// captured by the indexer; nothing is reconstructed from a mutable working
// graph at read time.
func CompareSnapshots(base, head store.ArchitectureSnapshot) TemporalDiff {
	d := TemporalDiff{
		Base: snapshotRef(base), Head: snapshotRef(head),
		AddedFiles: []string{}, RemovedFiles: []string{},
		AddedModuleEdges: []ModuleEdgeChange{}, RemovedModuleEdges: []ModuleEdgeChange{}, ChangedModuleEdges: []ModuleEdgeChange{},
		NewCycles: [][]string{}, ResolvedCycles: [][]string{},
		AddedAPIs: []string{}, RemovedAPIs: []string{}, DriftFactors: []DriftFactor{}, Summary: []string{},
	}
	baseFiles := toSet(base.Payload.Files)
	headFiles := toSet(head.Payload.Files)
	for f := range headFiles {
		if !baseFiles[f] {
			d.AddedFiles = append(d.AddedFiles, f)
		}
	}
	for f := range baseFiles {
		if !headFiles[f] {
			d.RemovedFiles = append(d.RemovedFiles, f)
		}
	}
	sort.Strings(d.AddedFiles)
	sort.Strings(d.RemovedFiles)

	baseEdges := moduleEdgeMap(base.Payload.ModuleEdges)
	headEdges := moduleEdgeMap(head.Payload.ModuleEdges)
	for key, before := range baseEdges {
		after, ok := headEdges[key]
		parts := strings.SplitN(key, "\x00", 2)
		change := ModuleEdgeChange{From: parts[0], To: parts[1], Before: before.Count, After: after.Count, Delta: after.Count - before.Count}
		if !ok {
			change.After = 0
			change.Delta = -before.Count
			d.RemovedModuleEdges = append(d.RemovedModuleEdges, change)
			continue
		}
		if after.Count != before.Count {
			d.ChangedModuleEdges = append(d.ChangedModuleEdges, change)
		}
	}
	for key, after := range headEdges {
		if _, ok := baseEdges[key]; ok {
			continue
		}
		parts := strings.SplitN(key, "\x00", 2)
		d.AddedModuleEdges = append(d.AddedModuleEdges, ModuleEdgeChange{From: parts[0], To: parts[1], After: after.Count, Delta: after.Count})
	}
	sortModuleChanges(d.AddedModuleEdges)
	sortModuleChanges(d.RemovedModuleEdges)
	sortModuleChanges(d.ChangedModuleEdges)

	baseCycles := cycleSet(base.Payload.Cycles)
	headCycles := cycleSet(head.Payload.Cycles)
	for key, cycle := range headCycles {
		if _, ok := baseCycles[key]; !ok {
			d.NewCycles = append(d.NewCycles, cycle)
		}
	}
	for key, cycle := range baseCycles {
		if _, ok := headCycles[key]; !ok {
			d.ResolvedCycles = append(d.ResolvedCycles, cycle)
		}
	}
	sortCycles(d.NewCycles)
	sortCycles(d.ResolvedCycles)

	baseAPIs := toSet(base.Payload.Producers)
	headAPIs := toSet(head.Payload.Producers)
	for api := range headAPIs {
		if !baseAPIs[api] {
			d.AddedAPIs = append(d.AddedAPIs, api)
		}
	}
	for api := range baseAPIs {
		if !headAPIs[api] {
			d.RemovedAPIs = append(d.RemovedAPIs, api)
		}
	}
	sort.Strings(d.AddedAPIs)
	sort.Strings(d.RemovedAPIs)

	baseCoupling := totalModuleEdges(base.Payload.ModuleEdges)
	headCoupling := totalModuleEdges(head.Payload.ModuleEdges)
	d.CouplingDelta = headCoupling - baseCoupling
	d.CrossModuleDelta = head.Payload.CrossModuleEdges - base.Payload.CrossModuleEdges
	d.EdgeDelta = head.Edges - base.Edges
	d.FileDelta = head.Files - base.Files

	addFactor := func(label string, points int, detail string) {
		if points == 0 {
			return
		}
		d.DriftFactors = append(d.DriftFactors, DriftFactor{Label: label, Points: points, Detail: detail})
		d.DriftScore += points
	}
	addFactor("file_changes", (len(d.AddedFiles)+len(d.RemovedFiles))*2,
		fmt.Sprintf("%d files added, %d removed", len(d.AddedFiles), len(d.RemovedFiles)))
	addFactor("dependency_changes", (len(d.AddedModuleEdges)+len(d.RemovedModuleEdges))*4,
		fmt.Sprintf("%d module dependencies added, %d removed", len(d.AddedModuleEdges), len(d.RemovedModuleEdges)))
	addFactor("new_cycles", len(d.NewCycles)*10,
		fmt.Sprintf("%d new import cycles", len(d.NewCycles)))
	addFactor("api_changes", (len(d.AddedAPIs)+len(d.RemovedAPIs))*5,
		fmt.Sprintf("%d endpoints added, %d removed", len(d.AddedAPIs), len(d.RemovedAPIs)))
	if d.CouplingDelta > 0 {
		addFactor("coupling_growth", minInt(d.CouplingDelta, 20),
			fmt.Sprintf("%d additional file-import links between modules", d.CouplingDelta))
	}
	if d.DriftScore > 100 {
		d.DriftScore = 100
	}
	switch {
	case d.DriftScore >= 60:
		d.DriftLevel = "high"
	case d.DriftScore >= 25:
		d.DriftLevel = "medium"
	case d.DriftScore > 0:
		d.DriftLevel = "low"
	default:
		d.DriftLevel = "none"
	}

	d.Summary = append(d.Summary, fmt.Sprintf("%d files added and %d removed between %s and %s.", len(d.AddedFiles), len(d.RemovedFiles), refLabel(base), refLabel(head)))
	d.Summary = append(d.Summary, fmt.Sprintf("%d module dependencies added, %d removed; total import coupling changed by %+d.", len(d.AddedModuleEdges), len(d.RemovedModuleEdges), d.CouplingDelta))
	if len(d.NewCycles) > 0 {
		d.Summary = append(d.Summary, fmt.Sprintf("%d new circular import group(s) appeared.", len(d.NewCycles)))
	}
	if len(d.RemovedAPIs) > 0 {
		d.Summary = append(d.Summary, fmt.Sprintf("%d endpoint operation(s) disappeared. Check consumers before deploying.", len(d.RemovedAPIs)))
	}
	if len(d.AddedAPIs) > 0 {
		d.Summary = append(d.Summary, fmt.Sprintf("%d endpoint operation(s) appeared.", len(d.AddedAPIs)))
	}
	d.Limitations = []string{
		"Snapshots are captured at the end of a successful index. Changes made between indexes are not represented.",
		"Module dependencies aggregate file imports. Calls, runtime discovery and dynamic imports may add coupling that this diff cannot see.",
		"Cycle detection is limited to file-level IMPORTS edges.",
		"Branch graphs share one working graph in the current storage model. Snapshots and contracts are branch-stamped, but re-indexing another branch changes the live graph until the original branch is re-indexed.",
	}
	return d
}

func snapshotRef(s store.ArchitectureSnapshot) SnapshotRef {
	return SnapshotRef{
		ID: s.ID, CommitSHA: s.CommitSHA, Branch: s.Branch, Label: s.Label, CreatedAt: s.CreatedAt,
		Nodes: s.Nodes, Edges: s.Edges, Files: s.Files, Modules: s.Modules,
		Producers: s.Producers, Consumers: s.Consumers, Cycles: s.Cycles,
	}
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

func toSet(list []string) map[string]bool {
	out := make(map[string]bool, len(list))
	for _, v := range list {
		out[v] = true
	}
	return out
}

type countedEdge struct {
	Count int
}

func moduleEdgeMap(list []store.ModuleEdge) map[string]countedEdge {
	out := map[string]countedEdge{}
	for _, e := range list {
		out[e.From+"\x00"+e.To] = countedEdge{Count: e.Count}
	}
	return out
}

func totalModuleEdges(list []store.ModuleEdge) int {
	total := 0
	for _, e := range list {
		total += e.Count
	}
	return total
}

func cycleSet(cycles [][]string) map[string][]string {
	out := map[string][]string{}
	for _, c := range cycles {
		key := canonicalCycle(c)
		out[key] = c
	}
	return out
}

func canonicalCycle(cycle []string) string {
	if len(cycle) == 0 {
		return ""
	}
	smallest := 0
	for i := range cycle {
		if cycle[i] < cycle[smallest] {
			smallest = i
		}
	}
	rotated := append(append([]string{}, cycle[smallest:]...), cycle[:smallest]...)
	return strings.Join(rotated, ">")
}

func sortModuleChanges(list []ModuleEdgeChange) {
	sort.Slice(list, func(i, j int) bool {
		if list[i].From != list[j].From {
			return list[i].From < list[j].From
		}
		return list[i].To < list[j].To
	})
}

func sortCycles(cycles [][]string) {
	sort.Slice(cycles, func(i, j int) bool { return canonicalCycle(cycles[i]) < canonicalCycle(cycles[j]) })
}

