// Package aiclient is the typed client for the LeKnowde Python intelligence
// service (parsing, metrics, retrieval reasoning, documentation, impact).
package aiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/leknowde/platform/backend/internal/analysis"
)

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), token: token, http: &http.Client{Timeout: timeout}}
}

func (c *Client) post(ctx context.Context, path string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("ai service unreachable: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		var apiErr struct {
			Detail any `json:"detail"`
		}
		_ = json.Unmarshal(raw, &apiErr)
		return &ServiceError{Status: resp.StatusCode, Message: fmt.Sprint(apiErr.Detail), Raw: string(raw)}
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(raw, out)
}

type ServiceError struct {
	Status  int
	Message string
	Raw     string
}

func (e *ServiceError) Error() string {
	return fmt.Sprintf("ai service error %d: %s", e.Status, e.Message)
}

func IsUnavailable(err error) bool {
	if err == nil {
		return false
	}
	if se, ok := err.(*ServiceError); ok {
		return se.Status == 503 || se.Status == 502 || se.Status == 504
	}
	return strings.Contains(err.Error(), "unreachable")
}

// ---------------------------------------------------------------------------
// Health & capability discovery
// ---------------------------------------------------------------------------

type ServiceStatus struct {
	Status       string `json:"status"`
	Parser       string `json:"parser"`
	Parsers      []string `json:"parsers"`
	LLM          struct {
		Configured bool   `json:"configured"`
		Provider   string `json:"provider"`
		Model      string `json:"model"`
		Gateway    string `json:"gateway"`
		Reason     string `json:"reason"`
	} `json:"llm"`
	Embeddings struct {
		Mode  string `json:"mode"`
		Model string `json:"model"`
	} `json:"embeddings"`
	Version string `json:"version"`
}

func (c *Client) Status(ctx context.Context) (ServiceStatus, error) {
	var out ServiceStatus
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return out, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return out, fmt.Errorf("ai service unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return out, fmt.Errorf("ai service returned %d", resp.StatusCode)
	}
	err = json.NewDecoder(resp.Body).Decode(&out)
	return out, err
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type ParseFileInput struct {
	Path     string `json:"path"`
	Language string `json:"language"`
	Content  string `json:"content"`
}

type ParseRequest struct {
	Files          []ParseFileInput `json:"files"`
	IncludeMetrics bool             `json:"include_metrics"`
}

type ParseResponse struct {
	Parser     string               `json:"parser"`
	Files      []analysis.ParsedFile `json:"files"`
	Warnings   []string             `json:"warnings"`
	DurationMs int                  `json:"duration_ms"`
}

func (c *Client) Parse(ctx context.Context, files []ParseFileInput) (ParseResponse, error) {
	var out ParseResponse
	err := c.post(ctx, "/v1/parse", ParseRequest{Files: files, IncludeMetrics: true}, &out)
	return out, err
}

// ---------------------------------------------------------------------------
// Chat with retrieval evidence
// ---------------------------------------------------------------------------

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Question     string         `json:"question"`
	Repository   RepoContext    `json:"repository"`
	Evidence     []EvidenceRef  `json:"evidence"`
	History      []ChatMessage  `json:"history"`
	Task         string         `json:"task"`
	Instructions string         `json:"instructions"`
}

type RepoContext struct {
	ID         string         `json:"id"`
	FullName   string         `json:"full_name"`
	Branch     string         `json:"branch"`
	Language   string         `json:"language"`
	FileCount  int            `json:"file_count"`
	SymbolCount int           `json:"symbol_count"`
	Languages  map[string]int `json:"languages"`
}

type EvidenceRef struct {
	FilePath  string `json:"file_path"`
	StartLine int    `json:"start_line"`
	EndLine   int    `json:"end_line"`
	Symbol    string `json:"symbol"`
	Snippet   string `json:"snippet"`
	Reason    string `json:"reason"`
	Kind      string `json:"kind"`
}

type ChatResponse struct {
	Answer      string        `json:"answer"`
	Evidence    []EvidenceRef `json:"evidence"`
	Confidence  string        `json:"confidence"`
	Uncertainty string        `json:"uncertainty"`
	Model       string        `json:"model"`
	Provider    string        `json:"provider"`
	TokensIn    int           `json:"tokens_in"`
	TokensOut   int           `json:"tokens_out"`
	Grounded    bool          `json:"grounded"`
}

func (c *Client) Chat(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	var out ChatResponse
	err := c.post(ctx, "/v1/chat", req, &out)
	return out, err
}

// ---------------------------------------------------------------------------
// Impact analysis
// ---------------------------------------------------------------------------

type ImpactRequest struct {
	Request    string        `json:"request"`
	Repository RepoContext   `json:"repository"`
	Seeds      []ImpactSeed  `json:"seeds"`
	Impacts    []ImpactSeed  `json:"impacts"`
	Evidence   []EvidenceRef `json:"evidence"`
	Tests      []string      `json:"tests"`
	History    []string      `json:"history"`
}

type ImpactSeed struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Kind     string `json:"kind"`
	FilePath string `json:"file_path"`
	Depth    int    `json:"depth"`
	Via      string `json:"via"`
}

type ImpactNarrative struct {
	Summary            string   `json:"summary"`
	RiskLevel          string   `json:"risk_level"`
	RiskRationale      string   `json:"risk_rationale"`
	ImplementationPlan []string `json:"implementation_plan"`
	TestRecommendations []string `json:"test_recommendations"`
	Rollback           []string `json:"rollback_considerations"`
	Documentation      []string `json:"documentation_updates"`
	Uncertainty        string   `json:"uncertainty"`
	Model              string   `json:"model"`
	Confidence         string   `json:"confidence"`
	Provider           string   `json:"provider"`
}

func (c *Client) ImpactNarrative(ctx context.Context, req ImpactRequest) (ImpactNarrative, error) {
	var out ImpactNarrative
	err := c.post(ctx, "/v1/impact", req, &out)
	return out, err
}

// ---------------------------------------------------------------------------
// Documentation
// ---------------------------------------------------------------------------

type DocRequest struct {
	Kind       string        `json:"kind"`
	Repository RepoContext   `json:"repository"`
	Facts      DocFacts      `json:"facts"`
	Evidence   []EvidenceRef `json:"evidence"`
	Existing   string        `json:"existing"`
}

type DocFacts struct {
	EntryPoints []string          `json:"entry_points"`
	Modules     []string          `json:"modules"`
	Endpoints   []string          `json:"endpoints"`
	Entities    []string          `json:"entities"`
	Languages   map[string]int    `json:"languages"`
	Stats       map[string]int    `json:"stats"`
	Symbols     []string          `json:"symbols"`
	Tests       []string          `json:"tests"`
	PackageJSON []string          `json:"packages"`
}

type DocResponse struct {
	Title    string `json:"title"`
	Markdown string `json:"markdown"`
	Model    string `json:"model"`
	Provider string `json:"provider"`
	Generated bool  `json:"generated"`
	Note     string `json:"note"`
}

func (c *Client) GenerateDoc(ctx context.Context, req DocRequest) (DocResponse, error) {
	var out DocResponse
	err := c.post(ctx, "/v1/docs/generate", req, &out)
	return out, err
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

type EmbedRequest struct {
	Texts []string `json:"texts"`
}

type EmbedResponse struct {
	Mode     string      `json:"mode"`
	Model    string      `json:"model"`
	Dim      int         `json:"dim"`
	Vectors  [][]float64 `json:"vectors"`
	Degraded bool        `json:"degraded"`
}

func (c *Client) Embed(ctx context.Context, texts []string) (EmbedResponse, error) {
	var out EmbedResponse
	err := c.post(ctx, "/v1/embed", EmbedRequest{Texts: texts}, &out)
	return out, err
}
