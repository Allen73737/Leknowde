package analysis

import (
	"context"
	"sort"

	"github.com/leknowde/platform/backend/internal/contracts"
	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

// ContractRepository is one repository's stored surface on a branch.
type ContractRepository struct {
	Repository models.Repository      `json:"repository"`
	Branch     string                 `json:"branch"`
	Indexed    bool                   `json:"indexed"`
	Producers  []contracts.Contract   `json:"producers"`
	Consumers  []contracts.Contract   `json:"consumers"`
}

// ContractWorkspace is the cross-repository contract view for a workspace.
type ContractWorkspace struct {
	WorkspaceID  string               `json:"workspace_id"`
	Repositories []ContractRepository `json:"repositories"`
	Surface      contracts.Surface    `json:"surface"`
	Summary      ContractSummary      `json:"summary"`
	Limitations  []string             `json:"limitations"`
}

type ContractSummary struct {
	Repositories   int `json:"repositories"`
	Indexed        int `json:"indexed_repositories"`
	Producers      int `json:"producers"`
	Consumers      int `json:"consumers"`
	Links          int `json:"links"`
	CrossRepoLinks int `json:"cross_repo_links"`
	Unmatched      int `json:"unmatched_consumers"`
	Orphans        int `json:"orphan_producers"`
}

// BuildWorkspaceContracts loads every repository in a workspace and matches
// declared routes to client call sites across repository boundaries.
func BuildWorkspaceContracts(ctx context.Context, st *store.Store, workspaceID, branchOverride string) (ContractWorkspace, error) {
	repos, err := st.ListRepositories(ctx, workspaceID)
	if err != nil {
		return ContractWorkspace{}, err
	}
	out := ContractWorkspace{
		WorkspaceID: workspaceID, Repositories: []ContractRepository{},
		Surface: contracts.Surface{Producers: []contracts.Contract{}, Consumers: []contracts.Contract{}, Links: []contracts.Link{}, Unmatched: []contracts.Contract{}, OrphanProducers: []contracts.Contract{}},
	}
	allProducers := []contracts.Contract{}
	allConsumers := []contracts.Contract{}
	limitations := map[string]bool{}
	for _, repo := range repos {
		branch := branchOverride
		if branch == "" {
			branch = repo.DefaultBranch
		}
		repoContracts, err := st.ListAPIContracts(ctx, repo.ID, branch)
		if err != nil {
			return out, err
		}
		entry := ContractRepository{Repository: repo, Branch: branch, Indexed: len(repoContracts) > 0, Producers: []contracts.Contract{}, Consumers: []contracts.Contract{}}
		for _, c := range repoContracts {
			c.RepositoryName = repo.FullName
			if c.Direction == contracts.DirectionProducer {
				entry.Producers = append(entry.Producers, c)
				allProducers = append(allProducers, c)
			} else {
				entry.Consumers = append(entry.Consumers, c)
				allConsumers = append(allConsumers, c)
			}
		}
		if !entry.Indexed {
			limitations[repo.FullName+" has no stored contracts on branch "+branch+". Index it (or select an indexed branch) before relying on this view."] = true
		}
		if repo.Provider == "demo" {
			limitations["The demo repository contains bundled source fixtures. Its contract links are computed from those files, not from a live service."] = true
		}
		out.Repositories = append(out.Repositories, entry)
	}
	out.Surface = contracts.Match(allProducers, allConsumers)
	out.Summary = ContractSummary{
		Repositories: len(repos), Producers: len(allProducers), Consumers: len(allConsumers),
		Links: len(out.Surface.Links), CrossRepoLinks: out.Surface.CrossRepoLinks,
		Unmatched: len(out.Surface.Unmatched), Orphans: len(out.Surface.OrphanProducers),
	}
	for _, r := range out.Repositories {
		if r.Indexed {
			out.Summary.Indexed++
		}
	}
	for _, l := range out.Surface.Limitations {
		limitations[l] = true
	}
	limitations["Contract discovery depends on the parser recognising route declarations and client calls. Dynamic URL construction, generated clients and framework mounts are common sources of missing links."] = true
	out.Limitations = sortedKeys(limitations)
	return out, nil
}

// ContractDiff is the response for comparing two indexed refs.
type ContractDiff struct {
	Repository   models.Repository  `json:"repository"`
	BaseBranch   string             `json:"base_branch"`
	HeadBranch   string             `json:"head_branch"`
	BaseCommit   string             `json:"base_commit"`
	HeadCommit   string             `json:"head_commit"`
	Diff         contracts.Diff     `json:"diff"`
	AffectedRepos []string          `json:"affected_repositories"`
	Missing      []string           `json:"missing_branches"`
	Limitations  []string           `json:"limitations"`
}

// BuildContractDiff compares producer routes between two indexed branches and
// attaches workspace consumers to each removed endpoint.
func BuildContractDiff(ctx context.Context, st *store.Store, repo models.Repository, baseBranch, headBranch string) (ContractDiff, error) {
	out := ContractDiff{Repository: repo, BaseBranch: baseBranch, HeadBranch: headBranch, Missing: []string{}, AffectedRepos: []string{}}
	base, err := st.ListAPIContracts(ctx, repo.ID, baseBranch)
	if err != nil {
		return out, err
	}
	head, err := st.ListAPIContracts(ctx, repo.ID, headBranch)
	if err != nil {
		return out, err
	}
	if len(base) == 0 {
		out.Missing = append(out.Missing, baseBranch)
	}
	if len(head) == 0 {
		out.Missing = append(out.Missing, headBranch)
	}
	baseProducers := producersOnly(base)
	headProducers := producersOnly(head)
	out.BaseCommit = firstContractCommit(base)
	out.HeadCommit = firstContractCommit(head)
	workspace, werr := BuildWorkspaceContracts(ctx, st, repo.WorkspaceID, "")
	links := []contracts.Link{}
	if werr == nil {
		links = workspace.Surface.Links
	}
	out.Diff = contracts.DiffProducers(baseProducers, headProducers, links)
	affected := map[string]bool{}
	for _, b := range out.Diff.Breaking {
		for _, c := range b.Consumers {
			affected[c.ConsumerRepositoryName] = true
		}
	}
	for name := range affected {
		out.AffectedRepos = append(out.AffectedRepos, name)
	}
	sort.Strings(out.AffectedRepos)
	out.Limitations = out.Diff.Limitations
	out.Limitations = append(out.Limitations,
		"Only branches that have been indexed have a stored surface. Index both refs before running this comparison.",
	)
	return out, nil
}

func producersOnly(list []contracts.Contract) []contracts.Contract {
	out := []contracts.Contract{}
	for _, c := range list {
		if c.Direction == contracts.DirectionProducer {
			out = append(out, c)
		}
	}
	return out
}

func firstContractCommit(list []contracts.Contract) string {
	for _, c := range list {
		if c.CommitSHA != "" {
			return c.CommitSHA
		}
	}
	return ""
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
