package analysis

import (
	"regexp"
	"strings"
)

// ParsedSymbol mirrors the Python parser contract.
type ParsedSymbol struct {
	Kind          string         `json:"kind"`
	Name          string         `json:"name"`
	QualifiedName string         `json:"qualified_name"`
	Signature     string         `json:"signature"`
	StartLine     int            `json:"start_line"`
	EndLine       int            `json:"end_line"`
	ParentIndex   int            `json:"parent_index"`
	Exported      bool           `json:"exported"`
	DocComment    string         `json:"doc_comment"`
	Metadata      map[string]any `json:"metadata"`
}

type ParsedImport struct {
	Specifier string   `json:"specifier"`
	Line      int      `json:"line"`
	Symbols   []string `json:"symbols"`
}

type ParsedCall struct {
	Callee string `json:"callee"`
	Line   int    `json:"line"`
	Symbol string `json:"symbol"`
}

type ParsedRoute struct {
	Method  string `json:"method"`
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Handler string `json:"handler"`
}

type ParsedAPICall struct {
	Path   string `json:"path"`
	Method string `json:"method"`
	Line   int    `json:"line"`
}

type FileMetrics struct {
	LOC               int `json:"loc"`
	SLOC              int `json:"sloc"`
	Cyclomatic        int `json:"cyclomatic"`
	Functions         int `json:"functions"`
	MaxFunctionLength int `json:"max_function_length"`
	CommentLines      int `json:"comment_lines"`
}

type ParsedFile struct {
	Path          string          `json:"path"`
	Language      string          `json:"language"`
	Symbols       []ParsedSymbol  `json:"symbols"`
	Imports       []ParsedImport  `json:"imports"`
	Calls         []ParsedCall    `json:"calls"`
	Routes        []ParsedRoute   `json:"routes"`
	APICalls      []ParsedAPICall `json:"api_calls"`
	Metrics       FileMetrics     `json:"metrics"`
	DuplicationHash string        `json:"duplication_hash"`
}

var (
	reGoFunc     = regexp.MustCompile(`(?m)^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)`)
	reGoType     = regexp.MustCompile(`(?m)^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)`)
	reJSFunc     = regexp.MustCompile(`(?m)^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)`)
	reJSConstFn  = regexp.MustCompile(`(?m)^(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(`)
	reJSClass    = regexp.MustCompile(`(?m)^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)`)
	reJSInterface = regexp.MustCompile(`(?m)^(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)`)
	reJSImport   = regexp.MustCompile(`(?m)^\s*import\s+(?:type\s+)?(?:([\s\S]*?)\s+from\s+)?["']([^"']+)["']`)
	rePyDef      = regexp.MustCompile(`(?m)^(\s*)(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)`)
	rePyClass    = regexp.MustCompile(`(?m)^(\s*)class\s+([A-Za-z_][A-Za-z0-9_]*)`)
	rePyImport   = regexp.MustCompile(`(?m)^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))`)
	reRoute      = regexp.MustCompile(`(?m)(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']`)
	reSQLTable   = regexp.MustCompile(`(?mi)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([A-Za-z0-9_.]+)["']?`)
	reAPIPath    = regexp.MustCompile(`["'](/[a-zA-Z0-9_\-/{}.]+)["']`)
	reCallee     = regexp.MustCompile(`([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?)\s*\(`)
	branchWords  = []string{"if ", "else if", "for ", "while ", "case ", "catch ", "&&", "||", "?", "elif ", "except "}
)

// FallbackParse extracts structure without tree-sitter. It is a genuine,
// deterministic analysis at lower fidelity, used only when the Python parsing
// service is unreachable. Results are labelled parser=regex-fallback upstream.
func FallbackParse(path, language, content string) ParsedFile {
	pf := ParsedFile{Path: path, Language: language, Symbols: []ParsedSymbol{}, Imports: []ParsedImport{}, Calls: []ParsedCall{}, Routes: []ParsedRoute{}, APICalls: []ParsedAPICall{}}
	lines := strings.Split(content, "\n")
	pf.Metrics.LOC = len(lines)
	for _, l := range lines {
		t := strings.TrimSpace(l)
		if t == "" {
			continue
		}
		pf.Metrics.SLOC++
		if strings.HasPrefix(t, "//") || strings.HasPrefix(t, "#") || strings.HasPrefix(t, "*") || strings.HasPrefix(t, "/*") {
			pf.Metrics.CommentLines++
		}
		for _, bw := range branchWords {
			if strings.Contains(t, bw) {
				pf.Metrics.Cyclomatic++
			}
		}
	}
	pf.Metrics.Cyclomatic += 1

	lineOf := func(offset int) int {
		return strings.Count(content[:offset], "\n") + 1
	}
	endLineFor := func(start int) int {
		if start-1 >= len(lines) {
			return len(lines)
		}
		return len(lines)
	}

	add := func(kind, name string, offset int, signature string) {
		if name == "" {
			return
		}
		start := lineOf(offset)
		end := endLineFor(start)
		if end > start+80 {
			end = start + 80
		}
		exported := strings.HasPrefix(strings.TrimSpace(lines[start-1]), "export ") || (name != "" && name[0] >= 'A' && name[0] <= 'Z')
		pf.Symbols = append(pf.Symbols, ParsedSymbol{
			Kind: kind, Name: name, QualifiedName: name, Signature: signature,
			StartLine: start, EndLine: end, ParentIndex: -1, Exported: exported,
			Metadata: map[string]any{"parser": "regex-fallback"},
		})
		pf.Metrics.Functions++
		if end-start > pf.Metrics.MaxFunctionLength {
			pf.Metrics.MaxFunctionLength = end - start
		}
	}

	switch language {
	case "Go":
		for _, m := range reGoFunc.FindAllStringSubmatchIndex(content, -1) {
			add("function", content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for _, m := range reGoType.FindAllStringSubmatchIndex(content, -1) {
			kind := "class"
			if content[m[4]:m[5]] == "interface" {
				kind = "interface"
			}
			add(kind, content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for i, l := range lines {
			if strings.HasPrefix(strings.TrimSpace(l), "import") {
				for _, sm := range reAPIPath.FindAllStringSubmatch(l, -1) {
					pf.Imports = append(pf.Imports, ParsedImport{Specifier: sm[1], Line: i + 1})
				}
			}
		}
	case "Python":
		for _, m := range rePyDef.FindAllStringSubmatchIndex(content, -1) {
			indent := len(content[m[2]:m[3]])
			kind := "function"
			if indent > 0 {
				kind = "method"
			}
			add(kind, content[m[4]:m[5]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for _, m := range rePyClass.FindAllStringSubmatchIndex(content, -1) {
			add("class", content[m[4]:m[5]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for i, l := range lines {
			if m := rePyImport.FindStringSubmatch(l); m != nil {
				spec := m[1]
				if spec == "" {
					spec = m[2]
				}
				pf.Imports = append(pf.Imports, ParsedImport{Specifier: spec, Line: i + 1})
			}
		}
	case "SQL":
		for _, m := range reSQLTable.FindAllStringSubmatchIndex(content, -1) {
			add("entity", content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
	default:
		for _, m := range reJSFunc.FindAllStringSubmatchIndex(content, -1) {
			add("function", content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for _, m := range reJSConstFn.FindAllStringSubmatchIndex(content, -1) {
			add("function", content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for _, m := range reJSClass.FindAllStringSubmatchIndex(content, -1) {
			kind := "class"
			if strings.HasSuffix(path, ".tsx") || strings.HasSuffix(path, ".jsx") {
				kind = "component"
			}
			add(kind, content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for _, m := range reJSInterface.FindAllStringSubmatchIndex(content, -1) {
			add("interface", content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
		for _, m := range reJSImport.FindAllStringSubmatchIndex(content, -1) {
			pf.Imports = append(pf.Imports, ParsedImport{Specifier: content[m[4]:m[5]], Line: lineOf(m[0])})
		}
		// React components are also commonly declared as exported arrow functions.
		for _, m := range regexp.MustCompile(`(?m)^export\s+(?:const|function)\s+([A-Z][A-Za-z0-9_]*)`).FindAllStringSubmatchIndex(content, -1) {
			add("component", content[m[2]:m[3]], m[0], firstLine(lines, lineOf(m[0])))
		}
	}

	for _, m := range reRoute.FindAllStringSubmatchIndex(content, -1) {
		pf.Routes = append(pf.Routes, ParsedRoute{
			Method: strings.ToUpper(content[m[2]:m[3]]), Path: content[m[4]:m[5]], Line: lineOf(m[0]), Handler: path,
		})
	}
	for i, l := range lines {
		if strings.Contains(l, "fetch(") || strings.Contains(l, "request<") || strings.Contains(l, "request(") || strings.Contains(l, "axios.") {
			for _, m := range reAPIPath.FindAllStringSubmatch(l, -1) {
				if strings.Contains(m[1], "/api/") || strings.Count(m[1], "/") >= 1 {
					pf.APICalls = append(pf.APICalls, ParsedAPICall{Path: m[1], Line: i + 1})
				}
			}
		}
	}
	for _, m := range reCallee.FindAllStringSubmatchIndex(content, -1) {
		name := content[m[2]:m[3]]
		if strings.HasPrefix(name, "if") || strings.HasPrefix(name, "for") || strings.HasPrefix(name, "while") {
			continue
		}
		pf.Calls = append(pf.Calls, ParsedCall{Callee: name, Line: lineOf(m[0])})
	}
	return pf
}

func firstLine(lines []string, n int) string {
	if n-1 >= 0 && n-1 < len(lines) {
		s := strings.TrimSpace(lines[n-1])
		if len(s) > 160 {
			s = s[:160]
		}
		return s
	}
	return ""
}
