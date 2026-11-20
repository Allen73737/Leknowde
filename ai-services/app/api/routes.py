from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status

from app.agents import prompts
from app.analysis.parser import TREE_SITTER_AVAILABLE, parse_files
from app.core.config import get_settings
from app.core.security import require_internal_token
from app.llm.gateway import LLMUnavailable, chat, gateway_status
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    DocRequest,
    DocResponse,
    EmbedRequest,
    EmbedResponse,
    ImpactNarrative,
    ImpactRequest,
    ParseRequest,
    ParseResponse,
)
from app.retrieval.embeddings import embed_texts

logger = logging.getLogger("leknowde.routes")
router = APIRouter()


@router.get("/health", tags=["system"])
@router.get("/v1/health", tags=["system"])
async def service_health() -> dict[str, object]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.service_name,
        "version": "1.0.0",
        "parser": "tree-sitter" if TREE_SITTER_AVAILABLE else "regex-fallback",
        "parsers": ["tree-sitter", "regex-fallback"],
        "llm": gateway_status(),
        "embeddings": {
            "mode": settings.embedding_provider,
            "model": settings.embedding_model,
        },
    }


@router.post("/v1/parse", response_model=ParseResponse, tags=["analysis"],
             dependencies=[Depends(require_internal_token)])
async def parse_repository_files(payload: ParseRequest) -> ParseResponse:
    if not payload.files:
        return ParseResponse(parser="tree-sitter" if TREE_SITTER_AVAILABLE else "regex-fallback")
    if len(payload.files) > 400:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="Parse batches are limited to 400 files per request.")
    return parse_files(payload.files)


@router.post("/v1/embed", response_model=EmbedResponse, tags=["analysis"],
             dependencies=[Depends(require_internal_token)])
async def create_embeddings(payload: EmbedRequest) -> EmbedResponse:
    if not payload.texts:
        raise HTTPException(status_code=400, detail="At least one text is required.")
    if len(payload.texts) > 256:
        raise HTTPException(status_code=413, detail="Batch size is limited to 256 texts.")
    vectors, mode, model, degraded = await embed_texts(payload.texts)
    return EmbedResponse(mode=mode, model=model, dim=len(vectors[0]) if vectors else 0,
                         vectors=vectors, degraded=degraded)


@router.post("/v1/chat", response_model=ChatResponse, tags=["intelligence"],
             dependencies=[Depends(require_internal_token)])
async def repository_chat(payload: ChatRequest) -> ChatResponse:
    if not payload.evidence:
        return ChatResponse(
            answer="No source evidence matched this question, so I cannot answer it from the repository. "
                   "Try naming a file, symbol or endpoint, or re-index the branch if it changed recently.",
            evidence=[],
            confidence="insufficient",
            uncertainty="Retrieval returned no evidence. The question may refer to code that is not indexed.",
            grounded=False,
        )

    system, messages, included = prompts.chat_messages(
        payload.question, payload.repository, payload.evidence, payload.history
    )
    try:
        result = await chat(system, messages, json_mode=True)
    except LLMUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    parsed = _extract_json(result.text)
    answer = str(parsed.get("answer") or result.text or "").strip()
    confidence = str(parsed.get("confidence") or "medium").lower()
    if confidence not in {"high", "medium", "low", "insufficient"}:
        confidence = "medium"
    cited = parsed.get("cited_paths")
    if isinstance(cited, list):
        known = {item.file_path for item in included}
        # Only keep citations that map onto evidence we actually supplied.
        included = [item for item in included if item.file_path in {str(c) for c in cited}] or included
        _ = known
    return ChatResponse(
        answer=answer,
        evidence=included,
        confidence=confidence,
        uncertainty=str(parsed.get("uncertainty") or ""),
        model=result.model,
        provider=result.provider,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
        grounded=bool(included),
    )


@router.post("/v1/impact", response_model=ImpactNarrative, tags=["intelligence"],
             dependencies=[Depends(require_internal_token)])
async def impact_narrative(payload: ImpactRequest) -> ImpactNarrative:
    seed_dicts = [s.model_dump() for s in payload.seeds]
    impact_dicts = [s.model_dump() for s in payload.impacts]
    system, messages = prompts.impact_messages(
        payload.request, payload.repository, seed_dicts, impact_dicts,
        payload.evidence, payload.tests, payload.history,
    )
    try:
        result = await chat(system, messages, json_mode=True)
    except LLMUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    parsed = _extract_json(result.text)
    return ImpactNarrative(
        summary=str(parsed.get("summary") or ""),
        risk_level=str(parsed.get("risk_level") or ""),
        risk_rationale=str(parsed.get("risk_rationale") or ""),
        implementation_plan=_string_list(parsed.get("implementation_plan")),
        test_recommendations=_string_list(parsed.get("test_recommendations")),
        rollback_considerations=_string_list(parsed.get("rollback_considerations")),
        documentation_updates=_string_list(parsed.get("documentation_updates")),
        uncertainty=str(parsed.get("uncertainty") or ""),
        model=result.model,
        provider=result.provider,
        confidence="medium",
    )


@router.post("/v1/docs/generate", response_model=DocResponse, tags=["intelligence"],
             dependencies=[Depends(require_internal_token)])
async def generate_document(payload: DocRequest) -> DocResponse:
    facts = {
        "entry_points": payload.facts.entry_points,
        "modules": payload.facts.modules,
        "endpoints": payload.facts.endpoints,
        "entities": payload.facts.entities,
        "languages": payload.facts.languages,
        "stats": payload.facts.stats,
        "tests": payload.facts.tests,
    }
    system, messages = prompts.doc_messages(
        payload.kind, payload.repository, facts, payload.evidence, payload.existing
    )
    try:
        result = await chat(system, messages, max_tokens=2600)
    except LLMUnavailable as exc:
        # The API layer falls back to its deterministic generator.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    markdown = _strip_code_fence(result.text)
    title = _first_heading(markdown) or payload.kind.replace("-", " ").title()
    return DocResponse(
        title=title,
        markdown=markdown,
        model=result.model,
        provider=result.provider,
        generated=bool(markdown.strip()),
        note="Generated by the model from verified structural facts. Review before publishing.",
    )


def _extract_json(text: str) -> dict[str, object]:
    cleaned = _strip_code_fence(text or "").strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            logger.warning("model returned unparseable JSON")
    return {}


def _string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [line.strip("-• ").strip() for line in value.splitlines() if line.strip()]
    return []


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines)
    return stripped


def _first_heading(markdown: str) -> str:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""
