"""Embedding providers.

The default is a deterministic lexical hashing vector, which requires no
credentials and is explicitly labelled as lexical rather than semantic. When
Gemini embeddings are configured, real neural embeddings are produced instead.
"""

from __future__ import annotations

import hashlib
import math
import re

import httpx

from app.core.config import get_settings

TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")
STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was", "were", "for",
    "on", "with", "this", "that", "it", "as", "be", "by", "at", "from", "we", "how",
    "what", "where", "which", "when", "does", "do", "i", "my", "can", "you", "me",
}


def tokenize(text: str) -> list[str]:
    out: list[str] = []
    for match in TOKEN_RE.finditer(text):
        token = match.group(0)
        # split camelCase and snake_case
        parts = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", token).replace("_", " ").lower().split()
        for part in parts:
            if len(part) < 2 or part in STOPWORDS:
                continue
            out.append(part)
    return out


def lexical_embed(text: str, dim: int) -> list[float]:
    vector = [0.0] * dim
    tokens = tokenize(text)
    if not tokens:
        return vector
    counts: dict[str, int] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0) + 1
    for token, count in counts.items():
        digest = hashlib.sha1(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = -1.0 if digest[4] % 2 else 1.0
        vector[index] += sign * (1 + math.log(count))
        if len(token) > 5:
            for i in range(len(token) - 3):
                gram = token[i : i + 4]
                gram_digest = hashlib.sha1(gram.encode("utf-8")).digest()
                gram_index = int.from_bytes(gram_digest[:4], "big") % dim
                vector[gram_index] += 0.15 * (-1.0 if gram_digest[4] % 2 else 1.0)
    norm = math.sqrt(sum(v * v for v in vector))
    if norm > 0:
        vector = [v / norm for v in vector]
    return vector


async def embed_texts(texts: list[str]) -> tuple[list[list[float]], str, str, bool]:
    """Returns (vectors, mode, model, degraded)."""
    settings = get_settings()
    if settings.embedding_provider == "gemini" and settings.gemini_api_key:
        try:
            vectors = await _gemini_embed(texts, settings.gemini_api_key, settings.gemini_model, settings.embedding_model)
            return vectors, "neural", settings.embedding_model, False
        except Exception:
            pass  # fall through to the lexical provider
    vectors = [lexical_embed(text, settings.embedding_dim) for text in texts]
    return vectors, "lexical", "lexical-hash-v1", settings.embedding_provider != "lexical"


async def _gemini_embed(texts: list[str], api_key: str, model: str, embedding_model: str) -> list[list[float]]:
    model_name = embedding_model if embedding_model and embedding_model != "lexical-hash-v1" else "text-embedding-004"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:batchEmbedContents"
    payload = {
        "requests": [
            {"model": f"models/{model_name}", "content": {"parts": [{"text": text[:8000]}]}}
            for text in texts
        ]
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload, headers={"x-goog-api-key": api_key})
        response.raise_for_status()
        data = response.json()
    embeddings = data.get("embeddings") or []
    return [item.get("values", []) for item in embeddings]
