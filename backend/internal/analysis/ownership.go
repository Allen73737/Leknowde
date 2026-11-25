package analysis

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

// OwnershipReport answers who touches which code, how concentrated that
// knowledge is, and which files carry the most change risk.
type OwnershipReport struct {
	Repository       models.Repository `json:"repository"`
	Branch           string            `json:"branch"`
	Authors          []AuthorOwnership `json:"authors"`
	Files            []FileOwnership   `json:"files"`
	Modules          []ModuleOwnership `json:"modules"`
	Hotspots         []Hotspot         `json:"hotspots"`
	UnownedHotspots  []string          `json:"unowned_hotspots"`
	Codeowners       []CodeownerRule   `json:"codeowners"`
	RepoBusFactor    int               `json:"repo_bus_factor"`
	TopAuthorShare   float64           `json:"top_author_share"`
	TotalTouches     int               `json:"total_touches"`
	CommitsWithFiles int               `json:"commits_with_file_evidence"`
	TotalCommits     int               `json:"total_stored_commits"`
	Limitations      []string          `json:"limitations"`
}

type AuthorOwnership struct {
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Commits    int     `json:"commits"`
	Files      int     `json:"files"`
	Touches    int     `json:"touches"`
	Additions  int     `json:"additions"`
	Deletions  int     `json:"deletions"`
	Share      float64 `json:"share"`
	LastActive string  `json:"last_active"`
}

type AuthorShare struct {
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	Touches   int     `json:"touches"`
	Additions int     `json:"additions"`
	Deletions int     `json:"deletions"`
	Share     float64 `json:"share"`
}

type FileOwnership struct {
	Path           string        `json:"path"`
	Touches        int           `json:"touches"`
	Additions      int           `json:"additions"`
	Deletions      int           `json:"deletions"`
	Lines          int           `json:"lines"`
	FanIn          int           `json:"fan_in"`
	Findings       int           `json:"findings"`
	Authors        []AuthorShare `json:"authors"`
	TopAuthor      string        `json:"top_author"`
	TopAuthorEmail string        `json:"top_author_email"`
	TopShare       float64       `json:"top_share"`
	BusFactor      int           `json:"bus_factor"`
	LastTouched    string        `json:"last_touched"`
}

type ModuleOwnership struct {
	Module      string  `json:"module"`
	Files       int     `json:"files"`
	Touches     int     `json:"touches"`
	TopAuthor   string  `json:"top_author"`
	TopEmail    string  `json:"top_email"`
	TopShare    float64 `json:"top_share"`
	BusFactor   int     `json:"bus_factor"`
	HotspotSum  int     `json:"hotspot_sum"`
}

type Hotspot struct {
	Path       string         `json:"path"`
	Score      int            `json:"score"`
	Breakdown  map[string]int `json:"breakdown"`
	Reason     string         `json:"reason"`
	TopAuthor  string         `json:"top_author"`
	BusFactor  int            `json:"bus_factor"`
}

type CodeownerRule struct {
	Pattern string  `json:"pattern"`
	Handle  string  `json:"handle"`
	Owner   string  `json:"owner"`
	Share   float64 `json:"share"`
	Touches int     `json:"touches"`
	Line    string  `json:"line"`
}

// BuildOwnership derives ownership and hotspot signals from commit-file
// evidence, current file sizes, graph fan-in and stored findings.
func BuildOwnership(ctx context.Context, st *store.Store, repo models.Repository, branch string) (OwnershipReport, error) {
	report := OwnershipReport{
		Repository: repo, Branch: branch,
		Authors: []AuthorOwnership{}, Files: []FileOwnership{}, Modules: []ModuleOwnership{},
		Hotspots: []Hotspot{}, UnownedHotspots: []string{}, Codeowners: []CodeownerRule{},
		Limitations: []string{},
	}
	touches, err := st.ListCommitTouches(ctx, repo.ID, 5000)
	if err != nil {
		return report, err
	}
	report.TotalCommits, _ = st.CountCommits(ctx, repo.ID)
	report.CommitsWithFiles, _ = st.CommitsWithFiles(ctx, repo.ID)
	report.TotalTouches = len(touches)

	type fileInfo struct {
		lines int
		fanIn int
		findings int
	}
	current := map[string]fileInfo{}
	rows, err := st.DB.QueryContext(ctx, `SELECT path, line_count FROM repository_files
		WHERE repository_id = ? AND branch = ? AND is_binary = 0`, repo.ID, branch)
	if err == nil {
		for rows.Next() {
			var p string
			var lines int
			if rows.Scan(&p, &lines) == nil {
				info := current[p]
				info.lines = lines
				current[p] = info
			}
		}
		rows.Close()
	}
	fanRows, err := st.DB.QueryContext(ctx, `SELECT to_key, COUNT(1) FROM graph_edges
		WHERE repository_id = ? AND relation = 'IMPORTS' GROUP BY to_key`, repo.ID)
	if err == nil {
		for fanRows.Next() {
			var key string
			var count int
			if fanRows.Scan(&key, &count) == nil {
				p := strings.TrimPrefix(key, "file:")
				info := current[p]
				info.fanIn = count
				current[p] = info
			}
		}
		fanRows.Close()
	}
	findRows, err := st.DB.QueryContext(ctx, `SELECT file_path, COUNT(1) FROM analysis_findings
		WHERE repository_id = ? AND file_path <> '' GROUP BY file_path`, repo.ID)
	if err == nil {
		for findRows.Next() {
			var p string
			var count int
			if findRows.Scan(&p, &count) == nil {
				info := current[p]
				info.findings = count
				current[p] = info
			}
		}
		findRows.Close()
	}

	type authorAgg struct {
		name, email, last string
		commits          map[string]bool
		files            map[string]bool
		touches          int
		additions        int
		deletions        int
	}
	authors := map[string]*authorAgg{}
	type fileAgg struct {
		touches, additions, deletions int
		last                          string
		byAuthor                      map[string]*AuthorShare
	}
	files := map[string]*fileAgg{}
	authorKey := func(name, email string) string {
		e := strings.ToLower(strings.TrimSpace(email))
		if e != "" {
			return e
		}
		return strings.ToLower(strings.TrimSpace(name))
	}
	for _, t := range touches {
		key := authorKey(t.AuthorName, t.AuthorEmail)
		if key == "" {
			continue
		}
		a := authors[key]
		if a == nil {
			a = &authorAgg{name: t.AuthorName, email: t.AuthorEmail, commits: map[string]bool{}, files: map[string]bool{}}
			authors[key] = a
		}
		a.commits[t.CommitSHA] = true
		a.files[t.Path] = true
		a.touches++
		a.additions += t.Additions
		a.deletions += t.Deletions
		if t.CommittedAt > a.last {
			a.last = t.CommittedAt
		}
		if _, ok := current[t.Path]; !ok {
			continue
		}
		f := files[t.Path]
		if f == nil {
			f = &fileAgg{byAuthor: map[string]*AuthorShare{}}
			files[t.Path] = f
		}
		f.touches++
		f.additions += t.Additions
		f.deletions += t.Deletions
		if t.CommittedAt > f.last {
			f.last = t.CommittedAt
		}
		share := f.byAuthor[key]
		if share == nil {
			share = &AuthorShare{Name: t.AuthorName, Email: t.AuthorEmail}
			f.byAuthor[key] = share
		}
		share.Touches++
		share.Additions += t.Additions
		share.Deletions += t.Deletions
	}

	authorList := make([]AuthorOwnership, 0, len(authors))
	for _, a := range authors {
		authorList = append(authorList, AuthorOwnership{
			Name: a.name, Email: a.email, Commits: len(a.commits), Files: len(a.files), Touches: a.touches,
			Additions: a.additions, Deletions: a.deletions, LastActive: a.last,
			Share: ratio(a.touches, len(touches)),
		})
	}
	sort.Slice(authorList, func(i, j int) bool {
		if authorList[i].Touches != authorList[j].Touches {
			return authorList[i].Touches > authorList[j].Touches
		}
		return authorList[i].Email < authorList[j].Email
	})
	report.Authors = authorList
	if len(authorList) > 0 {
		report.TopAuthorShare = authorList[0].Share
	}
	report.RepoBusFactor = busFactorFromAuthorList(authorList)

	for p, f := range files {
		shares := make([]AuthorShare, 0, len(f.byAuthor))
		for _, s := range f.byAuthor {
			s.Share = ratio(s.Touches, f.touches)
			shares = append(shares, *s)
		}
		sort.Slice(shares, func(i, j int) bool {
			if shares[i].Touches != shares[j].Touches {
				return shares[i].Touches > shares[j].Touches
			}
			return shares[i].Email < shares[j].Email
		})
		info := current[p]
		entry := FileOwnership{
			Path: p, Touches: f.touches, Additions: f.additions, Deletions: f.deletions,
			Lines: info.lines, FanIn: info.fanIn, Findings: info.findings, Authors: shares,
			LastTouched: f.last, TopShare: ratio(shares[0].Touches, f.touches),
			BusFactor: busFactorFromShares(shares, f.touches),
		}
		if len(shares) > 0 {
			entry.TopAuthor = shares[0].Name
			entry.TopAuthorEmail = shares[0].Email
		}
		report.Files = append(report.Files, entry)
	}
	sort.Slice(report.Files, func(i, j int) bool {
		if report.Files[i].Touches != report.Files[j].Touches {
			return report.Files[i].Touches > report.Files[j].Touches
		}
		return report.Files[i].Path < report.Files[j].Path
	})

	// File-level hotspots use an explicit additive formula so the score can be
	// explained line by line rather than presented as a model probability.
	for _, f := range report.Files {
		churn := f.Additions + f.Deletions
		breakdown := map[string]int{
			"change_frequency": f.Touches * 10,
			"churn":            churn / 25,
			"fan_in":           f.FanIn * 6,
			"findings":         f.Findings * 5,
			"file_size":        f.Lines / 50,
		}
		score := 0
		for _, v := range breakdown {
			score += v
		}
		if score > 100 {
			score = 100
		}
		report.Hotspots = append(report.Hotspots, Hotspot{
			Path: f.Path, Score: score, Breakdown: breakdown, TopAuthor: f.TopAuthor, BusFactor: f.BusFactor,
			Reason: fmt.Sprintf("%d recent changes, %d churn lines, %d importers, %d findings", f.Touches, churn, f.FanIn, f.Findings),
		})
	}
	sort.Slice(report.Hotspots, func(i, j int) bool {
		if report.Hotspots[i].Score != report.Hotspots[j].Score {
			return report.Hotspots[i].Score > report.Hotspots[j].Score
		}
		return report.Hotspots[i].Path < report.Hotspots[j].Path
	})
	if len(report.Hotspots) > 25 {
		report.Hotspots = report.Hotspots[:25]
	}

	// Modules aggregate ownership across their current files.
	type moduleAgg struct {
		files    int
		touches  int
		byAuthor map[string]*AuthorShare
		hotspot  int
	}
	fileTouches := map[string]FileOwnership{}
	for _, f := range report.Files {
		fileTouches[f.Path] = f
	}
	modules := map[string]*moduleAgg{}
	for p, info := range current {
		mod := moduleForOwnership(p)
		m := modules[mod]
		if m == nil {
			m = &moduleAgg{byAuthor: map[string]*AuthorShare{}}
			modules[mod] = m
		}
		m.files++
		_ = info
	}
	for _, h := range report.Hotspots {
		p := h.Path
		m := modules[moduleForOwnership(p)]
		if m == nil {
			continue
		}
		m.hotspot += h.Score
	}
	for p, f := range fileTouches {
		m := modules[moduleForOwnership(p)]
		if m == nil {
			continue
		}
		m.touches += f.Touches
		for _, a := range f.Authors {
			s := m.byAuthor[a.Email]
			if s == nil {
				s = &AuthorShare{Name: a.Name, Email: a.Email}
				m.byAuthor[a.Email] = s
			}
			s.Touches += a.Touches
			s.Additions += a.Additions
			s.Deletions += a.Deletions
		}
	}
	for mod, m := range modules {
		shares := make([]AuthorShare, 0, len(m.byAuthor))
		for _, s := range m.byAuthor {
			s.Share = ratio(s.Touches, m.touches)
			shares = append(shares, *s)
		}
		sort.Slice(shares, func(i, j int) bool {
			if shares[i].Touches != shares[j].Touches {
				return shares[i].Touches > shares[j].Touches
			}
			return shares[i].Email < shares[j].Email
		})
		entry := ModuleOwnership{Module: mod, Files: m.files, Touches: m.touches, HotspotSum: m.hotspot}
		if len(shares) > 0 {
			entry.TopAuthor = shares[0].Name
			entry.TopEmail = shares[0].Email
			entry.TopShare = ratio(shares[0].Touches, m.touches)
			entry.BusFactor = busFactorFromShares(shares, m.touches)
		}
		report.Modules = append(report.Modules, entry)
	}
	sort.Slice(report.Modules, func(i, j int) bool {
		if report.Modules[i].Touches != report.Modules[j].Touches {
			return report.Modules[i].Touches > report.Modules[j].Touches
		}
		return report.Modules[i].Module < report.Modules[j].Module
	})
	for _, m := range report.Modules {
		if m.Touches < 2 || m.TopShare < 0.6 || m.TopEmail == "" {
			continue
		}
		handle := handleFromEmail(m.TopEmail, m.TopAuthor)
		if handle == "" {
			continue
		}
		pattern := "/" + strings.Trim(m.Module, "/") + "/"
		if m.Module == "root" || m.Module == "" {
			pattern = "/"
		}
		rule := CodeownerRule{
			Pattern: pattern, Handle: "@" + handle, Owner: m.TopAuthor,
			Share: m.TopShare, Touches: m.Touches, Line: pattern + " @" + handle,
		}
		report.Codeowners = append(report.Codeowners, rule)
	}
	sort.Slice(report.Codeowners, func(i, j int) bool { return report.Codeowners[i].Pattern < report.Codeowners[j].Pattern })

	// Files with high structural importance but no commit-file evidence are
	// called out rather than assigned an invented owner.
	for p, info := range current {
		if info.fanIn >= 3 {
			if _, ok := fileTouches[p]; !ok {
				report.UnownedHotspots = append(report.UnownedHotspots, p)
			}
		}
	}
	sort.Strings(report.UnownedHotspots)
	if len(report.UnownedHotspots) > 20 {
		report.UnownedHotspots = report.UnownedHotspots[:20]
	}

	report.Limitations = []string{
		fmt.Sprintf("Ownership uses changed-file lists from %d indexed commits out of %d stored commits. Older history and commits fetched without file data are not represented.", report.CommitsWithFiles, report.TotalCommits),
		"Author identity is grouped by email. Multiple emails for one person, shared bot accounts and squashed commits are not normalised.",
		"File renames are not tracked across commits, so a renamed file starts with fresh ownership evidence.",
		"Suggested CODEOWNERS handles are derived from the commit email local-part. Verify each handle against your host before committing the file.",
		"The hotspot score is an explicit additive formula over change frequency, churn, import fan-in, findings and file size. It is not a prediction.",
	}
	if repo.Provider == "demo" {
		report.Limitations = append(report.Limitations, "This repository is the bundled demo dataset. Commit authors and changed-file lists are illustrative fixtures, not live provider history.")
	}
	return report, nil
}

func ratio(part, total int) float64 {
	if total <= 0 {
		return 0
	}
	return math.Round(float64(part)/float64(total)*1000) / 1000
}

func busFactorFromShares(shares []AuthorShare, total int) int {
	if total <= 0 || len(shares) == 0 {
		return 0
	}
	accumulated := 0
	for i, s := range shares {
		accumulated += s.Touches
		if float64(accumulated)/float64(total) >= 0.5 {
			return i + 1
		}
	}
	return len(shares)
}

func busFactorFromAuthorList(authors []AuthorOwnership) int {
	total := 0
	for _, a := range authors {
		total += a.Touches
	}
	if total == 0 {
		return 0
	}
	accumulated := 0
	for i, a := range authors {
		accumulated += a.Touches
		if float64(accumulated)/float64(total) >= 0.5 {
			return i + 1
		}
	}
	return len(authors)
}

func moduleForOwnership(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	parts := strings.Split(p, "/")
	if len(parts) <= 1 {
		return "root"
	}
	if (parts[0] == "src" || parts[0] == "app" || parts[0] == "server" || parts[0] == "web" || parts[0] == "packages" || parts[0] == "internal") && len(parts) >= 3 {
		return parts[0] + "/" + parts[1]
	}
	return parts[0]
}

func handleFromEmail(email, name string) string {
	local := email
	if idx := strings.Index(local, "@"); idx >= 0 {
		local = local[:idx]
	}
	if local == "" {
		local = name
	}
	var b strings.Builder
	for _, r := range strings.ToLower(local) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '.' || r == '_' || r == ' ' || r == '-':
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "-") {
				b.WriteByte('-')
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
