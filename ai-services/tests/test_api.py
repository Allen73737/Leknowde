"""HTTP contract tests for the intelligence service."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

client = TestClient(app)
TOKEN = get_settings().internal_token
HEADERS = {"X-Internal-Token": TOKEN}


def test_health() -> None:
    response = client.get("/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["parser"] in {"tree-sitter", "regex-fallback"}
    assert "embeddings" in body


def test_parse_requires_internal_token() -> None:
    response = client.post("/v1/parse", json={"files": []})
    assert response.status_code == 401


def test_parse_accepts_batch() -> None:
    response = client.post(
        "/v1/parse",
        headers=HEADERS,
        json={
            "files": [
                {
                    "path": "server/auth/refresh.ts",
                    "language": "TypeScript",
                    "content": "export function rotate(raw: string) { return raw; }\n",
                }
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["parser"] in {"tree-sitter", "regex-fallback"}
    assert body["files"][0]["path"] == "server/auth/refresh.ts"
    assert any(s["name"] == "rotate" for s in body["files"][0]["symbols"])


def test_chat_without_evidence_is_explicitly_ungrounded() -> None:
    response = client.post(
        "/v1/chat",
        headers=HEADERS,
        json={"question": "How does refresh rotation work?", "evidence": []},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is False
    assert body["confidence"] == "insufficient"
    assert body["evidence"] == []


def test_embed_is_deterministic() -> None:
    payload = {"texts": ["refresh token rotation", "database migration"]}
    first = client.post("/v1/embed", headers=HEADERS, json=payload)
    second = client.post("/v1/embed", headers=HEADERS, json=payload)
    assert first.status_code == 200
    assert first.json()["vectors"] == second.json()["vectors"]
    assert first.json()["dim"] == len(first.json()["vectors"][0])
