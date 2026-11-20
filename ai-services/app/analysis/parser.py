"""Tree-sitter based multi-language parsing.

The parser extracts structural facts only: declarations, imports, call
expressions, HTTP route declarations and client-side API calls. It never
executes repository code.
"""

from __future__ import annotations

import hashlib
import re
import time
from typing import Any

from app.models.schemas import (
    APICallOut,
    CallOut,
    FileMetrics,
    ImportOut,
    ParsedFile,
    ParseFileInput,
    ParseResponse,
    RouteOut,
    SymbolOut,
)

try:  # pragma: no cover - import guard for minimal environments
    from tree_sitter_language_pack import get_parser

    TREE_SITTER_AVAILABLE = True
except Exception:  # pragma: no cover
    get_parser = None  # type: ignore[assignment]
    TREE_SITTER_AVAILABLE = False

LANGUAGE_MAP = {
    "TypeScript": "typescript",
    "JavaScript": "javascript",
    "Python": "python",
    "Go": "go",
    "Rust": "rust",
    "Java": "java",
    "Kotlin": "kotlin",
    "Ruby": "ruby",
    "PHP": "php",
    "C#": "c_sharp",
    "C": "c",
    "C++": "cpp",
    "Swift": "swift",
}

TSX_EXTENSIONS = (".tsx", ".jsx")
DECISION_TYPES = {
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "case_clause",
    "switch_case",
    "catch_clause",
    "conditional_expression",
    "boolean_operator",
    "elif_clause",
    "except_clause",
    "match_case",
    "select_statement",
    "ternary_expression",
}
FUNCTION_TYPES = {
    "function_declaration",
    "function_definition",
    "method_definition",
    "method_declaration",
    "arrow_function",
    "function_expression",
    "generator_function_declaration",
}
CLASS_TYPES = {"class_declaration", "class_definition", "struct_declaration", "type_declaration"}
INTERFACE_TYPES = {"interface_declaration", "type_alias_declaration", "trait_declaration"}
ROUTE_VERBS = {"get", "post", "put", "patch", "delete", "options", "head", "route", "use"}
ROUTE_RECEIVERS = {"router", "app", "server", "api", "fastify", "routes"}
CREATE_TABLE_RE = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"']?([A-Za-z0-9_.]+)", re.IGNORECASE)
HTTP_CLIENT_HINTS = ("fetch", "axios", "request", "http", "got", "ky", "superagent")


def _text(node: Any) -> str:
    return node.text.decode("utf-8", errors="replace") if node is not None else ""


def _first_line(text: str, limit: int = 180) -> str:
    line = text.strip().splitlines()[0] if text.strip() else ""
    return line[:limit]


def parse_files(files: list[ParseFileInput]) -> ParseResponse:
    started = time.perf_counter()
    parsed: list[ParsedFile] = []
    warnings: list[str] = []
    used_tree_sitter = False

    for file in files:
        try:
            result = parse_file(file)
            used_tree_sitter = used_tree_sitter or result.parse_error == ""
            parsed.append(result)
        except Exception as exc:  # pragma: no cover - defensive
            warnings.append(f"{file.path}: {exc}")
            parsed.append(
                ParsedFile(
                    path=file.path,
                    language=file.language,
                    metrics=_line_metrics(file.content),
                    parse_error=str(exc),
                )
            )

    duration = int((time.perf_counter() - started) * 1000)
    parser = "tree-sitter" if TREE_SITTER_AVAILABLE and used_tree_sitter else "regex-fallback"
    return ParseResponse(parser=parser, files=parsed, warnings=warnings, duration_ms=duration)


def parse_file(file: ParseFileInput) -> ParsedFile:
    metrics = _line_metrics(file.content)
    out = ParsedFile(path=file.path, language=file.language, metrics=metrics,
                     duplication_hash=_duplication_hash(file.content))

    language_key = LANGUAGE_MAP.get(file.language, "")
    if file.path.endswith(TSX_EXTENSIONS):
        language_key = "tsx"

    if TREE_SITTER_AVAILABLE and language_key:
        try:
            parser = get_parser(language_key)  # type: ignore[misc]
            tree = parser.parse(file.content.encode("utf-8"))
            _walk(tree.root_node, out, file, metrics)
            _extract_routes(file, out)
            _extract_api_calls(file, out)
            _extract_sql_entities(file, out)
            out.metrics = metrics
            return out
        except Exception as exc:
            out.parse_error = f"tree-sitter failed: {exc}"
    else:
        out.parse_error = f"no grammar for language {file.language!r}"

    _regex_fallback(file, out, metrics)
    _extract_routes(file, out)
    _extract_api_calls(file, out)
    _extract_sql_entities(file, out)
    out.metrics = metrics
    return out


def _line_metrics(content: str) -> FileMetrics:
    lines = content.splitlines()
    sloc = 0
    comments = 0
    cyclomatic = 1
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        sloc += 1
        if stripped.startswith(("//", "#", "*", "/*", "<!--", "--")):
            comments += 1
        cyclomatic += len(re.findall(r"\b(if|for|while|case|catch|elif|except|when)\b|&&|\|\|", stripped))
    return FileMetrics(
        loc=len(lines),
        sloc=sloc,
        cyclomatic=cyclomatic,
        functions=0,
        max_function_length=0,
        comment_lines=comments,
    )


def _duplication_hash(content: str) -> str:
    normalised = [
        re.sub(r"\s+", "", line)
        for line in content.splitlines()
        if line.strip() and not line.strip().startswith(("//", "#", "*"))
    ]
    joined = "\n".join(normalised)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()[:16]


def _walk(root: Any, out: ParsedFile, file: ParseFileInput, metrics: FileMetrics) -> None:
    stack: list[tuple[Any, int]] = [(root, -1)]
    while stack:
        node, parent_index = stack.pop()
        new_parent = parent_index
        if node.type in FUNCTION_TYPES or node.type in CLASS_TYPES or node.type in INTERFACE_TYPES:
            symbol = _symbol_from_node(node, file, parent_index)
            if symbol is not None:
                out.symbols.append(symbol)
                new_parent = len(out.symbols) - 1
                if symbol.kind in {"function", "method"}:
                    metrics.functions += 1
                    length = max(0, symbol.end_line - symbol.start_line)
                    metrics.max_function_length = max(metrics.max_function_length, length)
                if symbol.kind == "component":
                    metrics.functions += 1
        elif node.type in {"lexical_declaration", "variable_declaration"}:
            symbol = _arrow_function_symbol(node, file, parent_index)
            if symbol is not None:
                out.symbols.append(symbol)
                new_parent = len(out.symbols) - 1
                metrics.functions += 1
                metrics.max_function_length = max(metrics.max_function_length, symbol.end_line - symbol.start_line)
        elif node.type in {"import_statement", "import_declaration", "import_from_statement", "use_declaration"}:
            spec = _import_specifier(node)
            if spec:
                out.imports.append(ImportOut(specifier=spec, line=node.start_point[0] + 1))
        elif node.type == "call_expression":
            callee = _callee_name(node)
            if callee:
                out.calls.append(CallOut(callee=callee, line=node.start_point[0] + 1))
            if node.type in DECISION_TYPES:
                metrics.cyclomatic += 1
        elif node.type in DECISION_TYPES:
            metrics.cyclomatic += 1

        for child in reversed(node.children):
            stack.append((child, new_parent))


def _symbol_from_node(node: Any, file: ParseFileInput, parent_index: int) -> SymbolOut | None:
    if node.type == "arrow_function":
        return None
    name_node = node.child_by_field_name("name")
    name = _text(name_node)
    if not name:
        return None

    kind = "function"
    if node.type in {"method_definition", "method_declaration"}:
        kind = "method"
    elif node.type in CLASS_TYPES:
        kind = "class"
        if _is_go_struct(node):
            kind = "class"
    elif node.type in INTERFACE_TYPES:
        kind = "interface"

    if file.path.endswith(TSX_EXTENSIONS) and kind in {"function", "class"} and name[:1].isupper():
        kind = "component"

    qualified = name
    parent = node.parent
    while parent is not None:
        parent_name_node = parent.child_by_field_name("name")
        parent_name = _text(parent_name_node)
        if parent_name and parent.type in CLASS_TYPES | INTERFACE_TYPES:
            qualified = f"{parent_name}.{qualified}"
            break
        parent = parent.parent

    doc = ""
    prev = node.prev_sibling
    if prev is not None and prev.type in {"comment", "block_comment", "line_comment"}:
        doc = _text(prev)[:400]

    return SymbolOut(
        kind=kind,
        name=name,
        qualified_name=qualified,
        signature=_first_line(_text(node), 200),
        start_line=node.start_point[0] + 1,
        end_line=node.end_point[0] + 1,
        parent_index=parent_index,
        exported=_is_exported(node),
        doc_comment=doc,
        metadata={"node_type": node.type},
    )


def _is_go_struct(node: Any) -> bool:
    return "struct" in _text(node)[:80]


def _is_exported(node: Any) -> bool:
    text = _text(node.parent) if node.parent is not None else _text(node)
    return "export " in text[:40] or text.lstrip().startswith("export")


def _arrow_function_symbol(node: Any, file: ParseFileInput, parent_index: int) -> SymbolOut | None:
    text = _text(node)
    if "=>" not in text and "function" not in text:
        return None
    declarator = next((c for c in node.children if c.type == "variable_declarator"), None)
    if declarator is None:
        return None
    name_node = declarator.child_by_field_name("name")
    name = _text(name_node)
    if not name or len(name) > 80:
        return None
    kind = "component" if file.path.endswith(TSX_EXTENSIONS) and name[:1].isupper() else "function"
    return SymbolOut(
        kind=kind,
        name=name,
        qualified_name=name,
        signature=_first_line(text, 200),
        start_line=node.start_point[0] + 1,
        end_line=node.end_point[0] + 1,
        parent_index=parent_index,
        exported="export" in text[:40],
        metadata={"node_type": "arrow_function"},
    )


def _import_specifier(node: Any) -> str:
    source = node.child_by_field_name("source")
    if source is not None:
        return _text(source).strip("'\"")
    for child in node.children:
        if child.type in {"string", "raw_string_literal", "interpreted_string_literal"}:
            return _text(child).strip("'\"")
    text = _text(node)
    match = re.search(r"[\"']([^\"']+)[\"']", text)
    if match:
        return match.group(1)
    match = re.search(r"^\s*from\s+([A-Za-z0-9_.]+)", text)
    if match:
        return match.group(1)
    match = re.search(r"^\s*import\s+([A-Za-z0-9_.]+)", text)
    return match.group(1) if match else ""


def _callee_name(node: Any) -> str:
    fn = node.child_by_field_name("function")
    if fn is None:
        return ""
    if fn.type == "identifier":
        return _text(fn)
    if fn.type in {"member_expression", "attribute", "selector_expression"}:
        prop = fn.child_by_field_name("property") or fn.child_by_field_name("field") or fn.child_by_field_name("attribute")
        obj = fn.child_by_field_name("object") or fn.child_by_field_name("value")
        if prop is not None:
            prop_text = _text(prop)
            obj_text = _text(obj)
            return f"{obj_text}.{prop_text}" if obj_text else prop_text
    return _text(fn)[:80]


def _extract_routes(file: ParseFileInput, out: ParsedFile) -> None:
    pattern = re.compile(
        r"\b(router|app|server|api|fastify|routes)\s*\.\s*(get|post|put|patch|delete|options|head|route|use)\s*\(\s*[\"'`]([^\"'`]+)[\"'`]",
        re.IGNORECASE,
    )
    for match in pattern.finditer(file.content):
        receiver, verb, path = match.group(1), match.group(2), match.group(3)
        if receiver.lower() not in ROUTE_RECEIVERS:
            continue
        line = file.content[: match.start()].count("\n") + 1
        method = "USE" if verb.lower() == "use" else verb.upper()
        out.routes.append(RouteOut(method=method, path=path, line=line, handler=file.path))


def _extract_api_calls(file: ParseFileInput, out: ParsedFile) -> None:
    pattern = re.compile(r"(fetch|axios\.[a-z]+|request|http\.[a-z]+|client\.[a-z]+)\s*[<(]?[^)\n]{0,80}?[\"'`](/[^\"'`\s]{2,120})[\"'`]")
    seen: set[tuple[str, int]] = set()
    for match in pattern.finditer(file.content):
        hint, path = match.group(1), match.group(2)
        if not any(h in hint.lower() for h in HTTP_CLIENT_HINTS):
            continue
        line = file.content[: match.start()].count("\n") + 1
        if (path, line) in seen:
            continue
        seen.add((path, line))
        method = "UNKNOWN"
        context = file.content[max(0, match.start() - 120): match.start()]
        method_match = re.search(r"method\s*:\s*[\"'](GET|POST|PUT|PATCH|DELETE)[\"']", context, re.IGNORECASE)
        if method_match:
            method = method_match.group(1).upper()
        out.api_calls.append(APICallOut(path=path, method=method, line=line))


def _extract_sql_entities(file: ParseFileInput, out: ParsedFile) -> None:
    for match in CREATE_TABLE_RE.finditer(file.content):
        table = match.group(1)
        line = file.content[: match.start()].count("\n") + 1
        out.symbols.append(
            SymbolOut(
                kind="entity",
                name=table,
                qualified_name=table,
                signature=_first_line(file.content[match.start(): match.start() + 160]),
                start_line=line,
                end_line=line,
                exported=True,
                metadata={"source": "sql"},
            )
        )


def _regex_fallback(file: ParseFileInput, out: ParsedFile, metrics: FileMetrics) -> None:
    """Deterministic fallback used when a grammar is unavailable."""
    patterns = {
        "function": [r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", r"^\s*def\s+([A-Za-z_]\w*)"],
        "class": [r"^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)"],
        "interface": [r"^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)"],
    }
    for kind, regexes in patterns.items():
        for regex in regexes:
            for match in re.finditer(regex, file.content, re.MULTILINE):
                line = file.content[: match.start()].count("\n") + 1
                name = match.group(1)
                out.symbols.append(
                    SymbolOut(
                        kind=kind,
                        name=name,
                        qualified_name=name,
                        signature=_first_line(file.content[match.start(): match.start() + 200]),
                        start_line=line,
                        end_line=len(file.content.splitlines()),
                        exported=True,
                    )
                )
                metrics.functions += 1
    for match in re.finditer(r"^\s*(?:import|from)\s+.*?[\"']([^\"']+)[\"']", file.content, re.MULTILINE):
        out.imports.append(ImportOut(specifier=match.group(1), line=file.content[: match.start()].count("\n") + 1))
    out.parse_error = out.parse_error or "grammar unavailable"
