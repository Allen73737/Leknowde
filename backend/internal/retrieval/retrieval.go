// Package retrieval implements LeKnowde's hybrid code retrieval: lexical BM25
// scoring over chunked source, vector similarity over stored embeddings, symbol
// name matching and file-path matching. It runs without any external AI
// provider, which keeps evidence retrieval available even when the LLM is not
// configured.
package retrieval

import (
	"context"
	"math"
	"sort"
	"strings"
	"unicode"

	"github.com/leknowde/platform/backend/internal/models"
	"github.com/leknowde/platform/backend/internal/store"
)

const VectorDim = 256

var stopwords = map[string]bool{
	"the": true, "a": true, "an": true, "and": true, "or": true, "of": true, "to": true, "in": true,
	"is": true, "are": true, "was": true, "were": true, "for": true, "on": true, "with": true, "this": true,
	"that": true, "it": true, "as": true, "be": true, "by": true, "at": true, "from": true, "we": true,
	"how": true, "what": true, "where": true, "which": true, "when": true, "does": true, "do": true,
	"i": true, "my": true, "can": true, "you": true, "me": true, "if": true, "will": true, "would": true,
	"code": true, "file": true, "files": true, "function": true,
}

// Tokenize lowercases, splits camelCase/snake_case and drops stopwords.
func Tokenize(s string) []string {
	var raw []string
	var cur strings.Builder
	flush := func() {
		if cur.Len() > 0 {
			raw = append(raw, cur.String())
			cur.Reset()
		}
	}
	runes := []rune(s)
	for i, r := range runes {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if unicode.IsUpper(r) && i > 0 && unicode.IsLower(runes[i-1]) {
				flush()
			}
			cur.WriteRune(unicode.ToLower(r))
		case r == '_' || r == '-' || r == '.' || r == '/' || r == ':' || r == '(' || r == ')' || r == '?' || r == '=' || r == '"' || r == '\'' || unicode.IsSpace(r):
			flush()
		default:
			flush()
		}
	}
	flush()
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		if len(t) < 2 && !(len(t) == 1 && (t == "x" || t == "y")) {
			continue
		}
		if stopwords[t] {
			continue
		}
		out = append(out, t)
	}
	return out
}

func hashToken(t string) (int, float64) {
	var h uint64 = 1469598103934665603
	for i := 0; i < len(t); i++ {
		h ^= uint64(t[i])
		h *= 1099511628211
	}
	sign := 1.0
	if h&1 == 1 {
		sign = -1.0
	}
	return int(h % VectorDim), sign
}

// Embed builds a deterministic hashed term-frequency vector. This is a lexical
// embedding, not a neural one: it is always available, has zero cost, and is
// labelled as such in the API so users are never misled about its nature.
func Embed(text string) []float64 {
	vec := make([]float64, VectorDim)
	tokens := Tokenize(text)
	if len(tokens) == 0 {
		return vec
	}
	tf := map[string]int{}
	for _, t := range tokens {
		tf[t]++
	}
	for t, count := range tf {
		idx, sign := hashToken(t)
		weight := 1 + math.Log(float64(count))
		vec[idx] += sign * weight
		// Sub-token n-gram signal helps with partial identifiers.
		if len(t) > 5 {
			for i := 0; i+4 <= len(t); i++ {
				idx2, sign2 := hashToken(t[i : i+4])
				vec[idx2] += sign2 * 0.15
			}
		}
	}
	var norm float64
	for _, v := range vec {
		norm += v * v
	}
	norm = math.Sqrt(norm)
	if norm > 0 {
		for i := range vec {
			vec[i] /= norm
		}
	}
	return vec
}

func Cosine(a, b []float64) float64 {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	var dot, na, nb float64
	for i := 0; i < n; i++ {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

type Result struct {
	Query       string           `json:"query"`
	Terms       []string         `json:"terms"`
	Evidence    []models.Evidence `json:"evidence"`
	Files       []string         `json:"files"`
	Symbols     []models.Symbol  `json:"symbols"`
	Candidates  int              `json:"candidates"`
	VectorModel string           `json:"vector_model"`
	Strategy    string           `json:"strategy"`
}

// Search runs hybrid retrieval and returns ranked, source-backed evidence.
func Search(ctx context.Context, st *store.Store, repoID, branch, query string, limit int) (Result, error) {
	res := Result{Query: query, Evidence: []models.Evidence{}, Files: []string{}, Symbols: []models.Symbol{}, VectorModel: "lexical-hash-v1"}
	terms := Tokenize(query)
	if len(terms) > 8 {
		terms = terms[:8]
	}
	res.Terms = terms

	// Symbol and file-path matches are high-precision signals.
	symbols, err := st.SearchSymbols(ctx, repoID, terms, 12)
	if err != nil {
		return res, err
	}
	res.Symbols = symbols

	chunks, err := st.CandidateChunks(ctx, repoID, terms, 900)
	if err != nil {
		return res, err
	}
	res.Candidates = len(chunks)

	qvec := Embed(query)
	type scored struct {
		chunk   models.Embedding
		lexical float64
		vector  float64
		total   float64
	}
	scoredChunks := make([]scored, 0, len(chunks))
	// Document frequency over the candidate pool.
	df := map[string]int{}
	docTokens := make([][]string, len(chunks))
	for i, c := range chunks {
		toks := Tokenize(c.Content)
		docTokens[i] = toks
		seen := map[string]bool{}
		for _, t := range toks {
			if !seen[t] {
				seen[t] = true
				df[t]++
			}
		}
	}
	N := float64(len(chunks)) + 1
	for i, c := range chunks {
		lexical := 0.0
		lower := strings.ToLower(c.Content)
		for _, term := range terms {
			tf := 0
			for _, t := range docTokens[i] {
				if t == term {
					tf++
				}
			}
			if tf == 0 {
				if strings.Contains(lower, term) {
					tf = 1
				} else {
					continue
				}
			}
			idf := math.Log(1 + (N-float64(df[term])+0.5)/(float64(df[term])+0.5))
			lexical += idf * (float64(tf) * 2.2) / (float64(tf) + 1.2)
		}
		if lexical > 0 && strings.Contains(strings.ToLower(c.FilePath), terms[0]) {
			lexical += 0.8
		}
		vector := 0.0
		if len(c.Vector) == VectorDim {
			vector = Cosine(qvec, c.Vector)
		}
		scoredChunks = append(scoredChunks, scored{chunk: c, lexical: lexical, vector: vector, total: lexical*0.72 + vector*0.28})
	}

	sort.SliceStable(scoredChunks, func(i, j int) bool { return scoredChunks[i].total > scoredChunks[j].total })

	seenFiles := map[string]bool{}
	maxPerFile := 2
	for _, sc := range scoredChunks {
		if len(res.Evidence) >= limit {
			break
		}
		if sc.total <= 0 {
			continue
		}
		if seenFiles[sc.chunk.FilePath] && maxPerFile <= 1 {
			continue
		}
		perFile := 0
		for _, e := range res.Evidence {
			if e.FilePath == sc.chunk.FilePath {
				perFile++
			}
		}
		if perFile >= maxPerFile {
			continue
		}
		snippet, startLine := windowSnippet(sc.chunk.Content, terms)
		res.Evidence = append(res.Evidence, models.Evidence{
			FilePath:  sc.chunk.FilePath,
			StartLine: startLine,
			EndLine:   startLine + strings.Count(snippet, "\n"),
			Snippet:   snippet,
			Kind:      "vector+lexical",
			Reason:    reasonFor(terms, sc.lexical, sc.vector),
		})
		seenFiles[sc.chunk.FilePath] = true
	}

	// Add file-level lexical hits that chunking may have missed.
	if len(res.Evidence) < limit && len(terms) > 0 {
		hits, err := st.SearchFiles(ctx, repoID, branch, query, 6)
		if err == nil {
			for _, h := range hits {
				if len(res.Evidence) >= limit {
					break
				}
				exists := false
				for _, e := range res.Evidence {
					if e.FilePath == h.Path {
						exists = true
						break
					}
				}
				if exists {
					continue
				}
				res.Evidence = append(res.Evidence, models.Evidence{
					FilePath:  h.Path,
					StartLine: h.Line,
					EndLine:   h.Line,
					Snippet:   h.Preview,
					Kind:      "keyword",
					Reason:    "contains an exact textual match for the query",
				})
			}
		}
	}

	// Attach symbols so the UI can deep-link to declarations.
	for i := range res.Evidence {
		for _, sy := range symbols {
			if sy.FilePath == res.Evidence[i].FilePath {
				res.Evidence[i].Symbol = sy.QualifiedName
				break
			}
		}
	}
	for _, e := range res.Evidence {
		if !containsString(res.Files, e.FilePath) {
			res.Files = append(res.Files, e.FilePath)
		}
	}
	if len(res.Evidence) > 0 {
		res.Strategy = "hybrid:lexical+vector+symbols"
	} else {
		res.Strategy = "no-match"
	}
	return res, nil
}

func reasonFor(terms []string, lexical, vector float64) string {
	var b strings.Builder
	b.WriteString("matched ")
	if lexical > 0 {
		b.WriteString("term frequency for query tokens")
		if vector > 0.2 {
			b.WriteString(" and vector similarity")
		}
	} else {
		b.WriteString("vector similarity only")
	}
	if len(terms) > 0 {
		b.WriteString(" (")
		for i, t := range terms {
			if i > 0 {
				b.WriteString(", ")
			}
			if i >= 3 {
				b.WriteString("…")
				break
			}
			b.WriteString(t)
		}
		b.WriteString(")")
	}
	return b.String()
}

// windowSnippet centers the excerpt on the first matching line.
func windowSnippet(content string, terms []string) (string, int) {
	lines := strings.Split(content, "\n")
	if len(lines) == 0 {
		return "", 1
	}
	match := -1
	best := 0
	for i, line := range lines {
		lower := strings.ToLower(line)
		hits := 0
		for _, t := range terms {
			if strings.Contains(lower, t) {
				hits++
			}
		}
		if hits > best {
			best = hits
			match = i
		}
	}
	if match == -1 {
		match = 0
	}
	start := match - 3
	if start < 0 {
		start = 0
	}
	end := match + 8
	if end > len(lines) {
		end = len(lines)
	}
	snippet := strings.Join(lines[start:end], "\n")
	if len(snippet) > 2400 {
		snippet = snippet[:2400]
	}
	return snippet, start + 1
}

func containsString(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
