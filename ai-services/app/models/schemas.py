from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class ParseFileInput(BaseModel):
    path: str
    language: str
    content: str


class ParseRequest(BaseModel):
    files: list[ParseFileInput] = Field(default_factory=list)
    include_metrics: bool = True


class SymbolOut(BaseModel):
    kind: str
    name: str
    qualified_name: str
    signature: str = ""
    start_line: int = 0
    end_line: int = 0
    parent_index: int = -1
    exported: bool = False
    doc_comment: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImportOut(BaseModel):
    specifier: str
    line: int = 0
    symbols: list[str] = Field(default_factory=list)


class CallOut(BaseModel):
    callee: str
    line: int = 0
    symbol: str = ""


class RouteOut(BaseModel):
    method: str
    path: str
    line: int = 0
    handler: str = ""


class APICallOut(BaseModel):
    path: str
    method: str = "UNKNOWN"
    line: int = 0


class FileMetrics(BaseModel):
    loc: int = 0
    sloc: int = 0
    cyclomatic: int = 1
    functions: int = 0
    max_function_length: int = 0
    comment_lines: int = 0


class ParsedFile(BaseModel):
    path: str
    language: str
    symbols: list[SymbolOut] = Field(default_factory=list)
    imports: list[ImportOut] = Field(default_factory=list)
    calls: list[CallOut] = Field(default_factory=list)
    routes: list[RouteOut] = Field(default_factory=list)
    api_calls: list[APICallOut] = Field(default_factory=list)
    metrics: FileMetrics = Field(default_factory=FileMetrics)
    duplication_hash: str = ""
    parse_error: str = ""


class ParseResponse(BaseModel):
    parser: str
    files: list[ParsedFile] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    duration_ms: int = 0


class EvidenceRef(BaseModel):
    file_path: str
    start_line: int = 0
    end_line: int = 0
    symbol: str = ""
    snippet: str = ""
    reason: str = ""
    kind: str = ""


class RepoContext(BaseModel):
    id: str = ""
    full_name: str = ""
    branch: str = ""
    language: str = ""
    file_count: int = 0
    symbol_count: int = 0
    languages: dict[str, int] = Field(default_factory=dict)

    @field_validator("languages", mode="before")
    @classmethod
    def _coerce_null_languages(cls, v: Any) -> Any:
        # Go marshals a nil map as null; treat it as empty rather than a 422.
        return {} if v is None else v


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    question: str
    repository: RepoContext = Field(default_factory=RepoContext)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    history: list[ChatMessage] = Field(default_factory=list)
    task: str = "question"
    instructions: str = ""


class ChatResponse(BaseModel):
    answer: str
    evidence: list[EvidenceRef] = Field(default_factory=list)
    confidence: str = "medium"
    uncertainty: str = ""
    model: str = ""
    provider: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    grounded: bool = True


class ImpactSeed(BaseModel):
    key: str = ""
    label: str = ""
    kind: str = ""
    file_path: str = ""
    depth: int = 0
    via: str = ""


class ImpactRequest(BaseModel):
    request: str
    repository: RepoContext = Field(default_factory=RepoContext)
    seeds: list[ImpactSeed] = Field(default_factory=list)
    impacts: list[ImpactSeed] = Field(default_factory=list)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    tests: list[str] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list)


class ImpactNarrative(BaseModel):
    summary: str = ""
    risk_level: str = ""
    risk_rationale: str = ""
    implementation_plan: list[str] = Field(default_factory=list)
    test_recommendations: list[str] = Field(default_factory=list)
    rollback_considerations: list[str] = Field(default_factory=list)
    documentation_updates: list[str] = Field(default_factory=list)
    uncertainty: str = ""
    model: str = ""
    confidence: str = "medium"
    provider: str = ""


class DocFacts(BaseModel):
    entry_points: list[str] = Field(default_factory=list)
    modules: list[str] = Field(default_factory=list)
    endpoints: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    languages: dict[str, int] = Field(default_factory=dict)
    stats: dict[str, int] = Field(default_factory=dict)
    symbols: list[str] = Field(default_factory=list)
    tests: list[str] = Field(default_factory=list)
    packages: list[str] = Field(default_factory=list)


class DocRequest(BaseModel):
    kind: str
    repository: RepoContext = Field(default_factory=RepoContext)
    facts: DocFacts = Field(default_factory=DocFacts)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    existing: str = ""


class DocResponse(BaseModel):
    title: str
    markdown: str
    model: str = ""
    provider: str = ""
    generated: bool = False
    note: str = ""


class EmbedRequest(BaseModel):
    texts: list[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    mode: str
    model: str
    dim: int
    vectors: list[list[float]] = Field(default_factory=list)
    degraded: bool = False
