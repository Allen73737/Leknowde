// Package contracts implements provider-neutral API surface normalisation,
// producer/consumer matching and structural diffing.
//
// The analysis is intentionally structural. It links route declarations to
// client call sites by HTTP method and path shape; it does not inspect request
// or response schemas, so a "breaking change" here means a removed or renamed
// route, not a field-level incompatibility.
package contracts

import (
	"sort"
	"strings"
)

const (
	DirectionProducer = "producer"
	DirectionConsumer = "consumer"
)

// Contract is one declared route (producer) or one client call site (consumer).
type Contract struct {
	ID              string `json:"id"`
	RepositoryID    string `json:"repository_id"`
	RepositoryName  string `json:"repository_name,omitempty"`
	Branch          string `json:"branch"`
	CommitSHA       string `json:"commit_sha,omitempty"`
	Direction       string `json:"direction"`
	Method          string `json:"method"`
	Path            string `json:"path"`
	NormalizedPath  string `json:"normalized_path"`
	Operation       string `json:"operation"`
	FilePath        string `json:"file_path"`
	Line            int    `json:"line"`
	Handler         string `json:"handler,omitempty"`
	Source          string `json:"source,omitempty"`
}

// Link is a matched producer → consumer relationship. Links can cross
// repository boundaries, which is the point of the workspace view.
type Link struct {
	ProducerRepositoryID   string  `json:"producer_repository_id"`
	ProducerRepositoryName string  `json:"producer_repository_name"`
	ProducerFile           string  `json:"producer_file"`
	ProducerLine           int     `json:"producer_line"`
	ConsumerRepositoryID   string  `json:"consumer_repository_id"`
	ConsumerRepositoryName string  `json:"consumer_repository_name"`
	ConsumerFile           string  `json:"consumer_file"`
	ConsumerLine           int     `json:"consumer_line"`
	Method                 string  `json:"method"`
	Path                   string  `json:"path"`
	Operation              string  `json:"operation"`
	Match                  string  `json:"match"`
	Confidence             float64 `json:"confidence"`
	CrossRepository        bool    `json:"cross_repository"`
}

// Surface is the complete matched state for a set of repositories.
type Surface struct {
	Producers       []Contract `json:"producers"`
	Consumers       []Contract `json:"consumers"`
	Links           []Link     `json:"links"`
	Unmatched       []Contract `json:"unmatched_consumers"`
	OrphanProducers []Contract `json:"orphan_producers"`
	CrossRepoLinks  int        `json:"cross_repo_links"`
	Limitations     []string   `json:"limitations"`
}

// Operation builds the canonical comparison key for a route.
func Operation(method, normalizedPath string) string {
	return strings.ToUpper(strings.TrimSpace(method)) + " " + normalizedPath
}

// NormalizePath removes query strings, fragments and trailing slashes and
// replaces framework-specific dynamic segments with a single stable token.
func NormalizePath(raw string) string {
	p := strings.TrimSpace(raw)
	if p == "" {
		return ""
	}
	if idx := strings.IndexAny(p, "?#"); idx >= 0 {
		p = p[:idx]
	}
	// Absolute URLs are reduced to their path component.
	if strings.Contains(p, "://") {
		if idx := strings.Index(p, "://"); idx >= 0 {
			rest := p[idx+3:]
			if slash := strings.Index(rest, "/"); slash >= 0 {
				p = rest[slash:]
			} else {
				p = "/"
			}
		}
	}
	p = strings.ReplaceAll(p, "\\", "/")
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	parts := strings.Split(p, "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		switch {
		case trimmed == "":
			continue
		case strings.HasPrefix(trimmed, ":") && len(trimmed) > 1:
			out = append(out, "{}")
		case strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}") && len(trimmed) >= 2:
			out = append(out, "{}")
		case strings.HasPrefix(trimmed, "<") && strings.HasSuffix(trimmed, ">") && len(trimmed) >= 2:
			out = append(out, "{}")
		case strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") && len(trimmed) >= 2:
			out = append(out, "{}")
		case trimmed == "*" || strings.HasPrefix(trimmed, "*"):
			out = append(out, "{}")
		default:
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return "/"
	}
	return "/" + strings.Join(out, "/")
}

// Match connects producers to consumers. Exact method/path matches are
// preferred; a suffix match is accepted when the consumer prepends a base path
// such as /api/v1 but the producer is declared relative to a router mount.
func Match(producers, consumers []Contract) Surface {
	surface := Surface{Producers: producers, Consumers: consumers, Links: []Link{}, Unmatched: []Contract{}, OrphanProducers: []Contract{}}
	byOperation := map[string][]Contract{}
	byMethod := map[string][]Contract{}
	for _, p := range producers {
		byOperation[p.Operation] = append(byOperation[p.Operation], p)
		byMethod[strings.ToUpper(p.Method)] = append(byMethod[strings.ToUpper(p.Method)], p)
	}
	linkedProducers := map[string]bool{}
	seen := map[string]bool{}
	for _, c := range consumers {
		method := strings.ToUpper(strings.TrimSpace(c.Method))
		candidates := byMethod[method]
		if method == "" {
			candidates = producers
		}
		best, match, confidence := findProducer(c, candidates)
		if best == nil {
			surface.Unmatched = append(surface.Unmatched, c)
			continue
		}
		key := best.RepositoryID + "\x00" + best.Operation + "\x00" + c.RepositoryID + "\x00" + c.FilePath + "\x00" + c.Operation
		if seen[key] {
			continue
		}
		seen[key] = true
		linkedProducers[best.RepositoryID+"\x00"+best.Operation] = true
		link := Link{
			ProducerRepositoryID: best.RepositoryID, ProducerRepositoryName: best.RepositoryName,
			ProducerFile: best.FilePath, ProducerLine: best.Line,
			ConsumerRepositoryID: c.RepositoryID, ConsumerRepositoryName: c.RepositoryName,
			ConsumerFile: c.FilePath, ConsumerLine: c.Line,
			Method: strings.ToUpper(best.Method), Path: best.Path, Operation: best.Operation,
			Match: match, Confidence: confidence,
			CrossRepository: best.RepositoryID != c.RepositoryID,
		}
		if link.CrossRepository {
			surface.CrossRepoLinks++
		}
		surface.Links = append(surface.Links, link)
	}
	for _, p := range producers {
		if !linkedProducers[p.RepositoryID+"\x00"+p.Operation] {
			surface.OrphanProducers = append(surface.OrphanProducers, p)
		}
	}
	sort.Slice(surface.Links, func(i, j int) bool {
		a, b := surface.Links[i], surface.Links[j]
		if a.Operation != b.Operation {
			return a.Operation < b.Operation
		}
		if a.ProducerRepositoryName != b.ProducerRepositoryName {
			return a.ProducerRepositoryName < b.ProducerRepositoryName
		}
		return a.ConsumerFile < b.ConsumerFile
	})
	sort.Slice(surface.Unmatched, func(i, j int) bool {
		if surface.Unmatched[i].RepositoryName != surface.Unmatched[j].RepositoryName {
			return surface.Unmatched[i].RepositoryName < surface.Unmatched[j].RepositoryName
		}
		return surface.Unmatched[i].FilePath < surface.Unmatched[j].FilePath
	})
	sort.Slice(surface.OrphanProducers, func(i, j int) bool {
		if surface.OrphanProducers[i].RepositoryName != surface.OrphanProducers[j].RepositoryName {
			return surface.OrphanProducers[i].RepositoryName < surface.OrphanProducers[j].RepositoryName
		}
		return surface.OrphanProducers[i].Operation < surface.OrphanProducers[j].Operation
	})
	surface.Limitations = []string{
		"Links are matched by HTTP method and normalised path shape. Request bodies, response schemas, headers and authentication requirements are not compared.",
		"Suffix matching is used when a client prepends a base path that the route declaration does not include. It can produce false positives for short paths.",
		"Only indexed branches are represented. A repository that has never been indexed on this branch contributes no contracts.",
	}
	return surface
}

func findProducer(c Contract, candidates []Contract) (*Contract, string, float64) {
	if len(candidates) == 0 {
		return nil, "", 0
	}
	consumerPath := c.NormalizedPath
	if consumerPath == "" {
		consumerPath = NormalizePath(c.Path)
	}
	bestIndex := -1
	bestScore := 0.0
	bestMatch := ""
	for i := range candidates {
		p := &candidates[i]
		match := ""
		score := 0.0
		if p.NormalizedPath == consumerPath {
			match = "exact"
			score = 0.98
		} else if suffixMatch(consumerPath, p.NormalizedPath) {
			match = "suffix"
			score = 0.72
		}
		if match == "" {
			continue
		}
		if strings.EqualFold(p.Method, c.Method) && c.Method != "" {
			score += 0.02
		}
		if c.Method == "" {
			score -= 0.12
		}
		if score > bestScore {
			bestScore = score
			bestIndex = i
			bestMatch = match
		}
	}
	if bestIndex < 0 {
		return nil, "", 0
	}
	if bestScore > 1 {
		bestScore = 1
	}
	return &candidates[bestIndex], bestMatch, bestScore
}

// suffixMatch requires a segment boundary so "/users" matches "/api/v1/users"
// but not "/superusers". Root paths are excluded because they would match
// almost every consumer.
func suffixMatch(consumerPath, producerPath string) bool {
	if producerPath == "" || producerPath == "/" || consumerPath == producerPath {
		return false
	}
	if !strings.HasSuffix(consumerPath, producerPath) {
		return false
	}
	if len(consumerPath) == len(producerPath) {
		return true
	}
	prefix := consumerPath[:len(consumerPath)-len(producerPath)]
	return strings.HasSuffix(prefix, "/")
}

// Endpoint is a compact representation used by diffs.
type Endpoint struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	File   string `json:"file"`
	Line   int    `json:"line"`
}

// BreakingChange describes one structural incompatibility.
type BreakingChange struct {
	Kind      string     `json:"kind"`
	Severity  string     `json:"severity"`
	Method    string     `json:"method"`
	Path      string     `json:"path"`
	Detail    string     `json:"detail"`
	BaseFile  string     `json:"base_file,omitempty"`
	HeadFile  string     `json:"head_file,omitempty"`
	Consumers []Link     `json:"consumers,omitempty"`
}

// Diff is the deterministic result of comparing two producer surfaces.
type Diff struct {
	BaseCommit    string           `json:"base_commit,omitempty"`
	HeadCommit    string           `json:"head_commit,omitempty"`
	Added         []Endpoint       `json:"added"`
	Removed       []Endpoint       `json:"removed"`
	RenamedParams []BreakingChange `json:"renamed_parameters"`
	Breaking      []BreakingChange `json:"breaking"`
	Unchanged     int              `json:"unchanged"`
	BaseTotal     int              `json:"base_total"`
	HeadTotal     int              `json:"head_total"`
	Limitations   []string         `json:"limitations"`
}

// DiffProducers compares producer contracts only. Links from the workspace are
// attached to removed endpoints so a reviewer can see which consumers are now
// pointing at a deleted route.
func DiffProducers(base, head []Contract, links []Link) Diff {
	d := Diff{Added: []Endpoint{}, Removed: []Endpoint{}, RenamedParams: []BreakingChange{}, Breaking: []BreakingChange{}}
	baseMap := producerMap(base)
	headMap := producerMap(head)
	for op, b := range baseMap {
		h, ok := headMap[op]
		if !ok {
			removed := Endpoint{Method: strings.ToUpper(b.Method), Path: b.Path, File: b.FilePath, Line: b.Line}
			d.Removed = append(d.Removed, removed)
			d.Breaking = append(d.Breaking, BreakingChange{
				Kind: "endpoint_removed", Severity: "high",
				Method: removed.Method, Path: b.Path,
				Detail:   "The endpoint operation existed on the base branch and is absent on the head branch.",
				BaseFile: b.FilePath, Consumers: consumersFor(b.Operation, links),
			})
			continue
		}
		if b.Path != h.Path {
			baseParams := paramNames(b.Path)
			headParams := paramNames(h.Path)
			if len(baseParams) == len(headParams) && !equalStrings(baseParams, headParams) {
				d.RenamedParams = append(d.RenamedParams, BreakingChange{
					Kind: "parameter_renamed", Severity: "low",
					Method: strings.ToUpper(h.Method), Path: h.Path,
					Detail:   "The route parameter names changed. Normalised path matching still succeeds, but generated clients and documentation that reference the old names may need regeneration.",
					BaseFile: b.FilePath, HeadFile: h.FilePath,
				})
			}
		}
		d.Unchanged++
	}
	for op, h := range headMap {
		if _, ok := baseMap[op]; !ok {
			d.Added = append(d.Added, Endpoint{Method: strings.ToUpper(h.Method), Path: h.Path, File: h.FilePath, Line: h.Line})
		}
	}
	sort.Slice(d.Added, func(i, j int) bool {
		if d.Added[i].Path != d.Added[j].Path {
			return d.Added[i].Path < d.Added[j].Path
		}
		return d.Added[i].Method < d.Added[j].Method
	})
	sort.Slice(d.Removed, func(i, j int) bool {
		if d.Removed[i].Path != d.Removed[j].Path {
			return d.Removed[i].Path < d.Removed[j].Path
		}
		return d.Removed[i].Method < d.Removed[j].Method
	})
	sort.Slice(d.Breaking, func(i, j int) bool {
		if d.Breaking[i].Path != d.Breaking[j].Path {
			return d.Breaking[i].Path < d.Breaking[j].Path
		}
		return d.Breaking[i].Method < d.Breaking[j].Method
	})
	d.BaseTotal = len(baseMap)
	d.HeadTotal = len(headMap)
	d.Limitations = []string{
		"Diffing is structural: additions and removals of method/path operations. Request and response fields are not parsed, so field-level breaking changes are not detected.",
		"Both refs must have been indexed. A branch with no stored contracts cannot be compared.",
		"Route prefixes added by a framework mount are not always part of the parsed path; parameter renames are reported separately from removals.",
	}
	return d
}

func producerMap(list []Contract) map[string]Contract {
	out := map[string]Contract{}
	for _, c := range list {
		if c.Direction != "" && c.Direction != DirectionProducer {
			continue
		}
		op := c.Operation
		if op == "" {
			op = Operation(c.Method, c.NormalizedPath)
		}
		if _, ok := out[op]; !ok {
			out[op] = c
		}
	}
	return out
}

func consumersFor(operation string, links []Link) []Link {
	out := []Link{}
	seen := map[string]bool{}
	for _, l := range links {
		if l.Operation != operation {
			continue
		}
		key := l.ConsumerRepositoryID + "\x00" + l.ConsumerFile + "\x00" + l.Method
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, l)
	}
	return out
}

func paramNames(rawPath string) []string {
	parts := strings.Split(strings.Trim(rawPath, "/"), "/")
	out := []string{}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		switch {
		case strings.HasPrefix(part, ":") && len(part) > 1:
			out = append(out, part[1:])
		case strings.HasPrefix(part, "{") && strings.HasSuffix(part, "}"):
			out = append(out, strings.Trim(part, "{}"))
		case strings.HasPrefix(part, "<") && strings.HasSuffix(part, ">"):
			out = append(out, strings.Trim(part, "<>"))
		}
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
