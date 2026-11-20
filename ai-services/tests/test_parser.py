"""Parser regression tests.

Run with:  .venv\\Scripts\\python.exe -m pytest -q
"""

from __future__ import annotations

from app.analysis.parser import TREE_SITTER_AVAILABLE, parse_file, parse_files
from app.models.schemas import ParseFileInput

SAMPLE_TS = """\
import { Router } from "express";
import { findUserById } from "./repo";

export interface User { id: string; email: string; }

export async function rotateRefreshToken(raw: string): Promise<User> {
  const row = await lookup(raw);
  if (!row) {
    throw new Error("missing");
  }
  return findUserById(row.userId);
}

const router = Router();
router.get("/auth/session", async (_req, res) => {
  res.json({ ok: true });
});
router.post("/auth/refresh", async (_req, res) => {
  res.json({ ok: true });
});
"""

SAMPLE_SQL = """\
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
);
"""


def _file(path: str, content: str, language: str = "TypeScript") -> ParseFileInput:
    return ParseFileInput(path=path, language=language, content=content)


def test_typescript_symbols_and_calls() -> None:
    parsed = parse_file(_file("auth/refresh.ts", SAMPLE_TS))
    names = {s.name for s in parsed.symbols}
    assert "rotateRefreshToken" in names
    assert "User" in names
    assert parsed.parse_error == ""
    kinds = {s.name: s.kind for s in parsed.symbols}
    assert kinds["rotateRefreshToken"] == "function"
    assert kinds["User"] in {"interface", "type"}
    assert any(c.callee.endswith("findUserById") for c in parsed.calls)
    assert any(i.specifier == "express" for i in parsed.imports)
    # Line ranges must be real 1-based ranges contained in the file.
    fn = next(s for s in parsed.symbols if s.name == "rotateRefreshToken")
    assert 1 <= fn.start_line <= fn.end_line <= len(SAMPLE_TS.splitlines())


def test_routes_extracted() -> None:
    parsed = parse_file(_file("server/index.ts", SAMPLE_TS))
    routes = {(r.method, r.path) for r in parsed.routes}
    assert ("GET", "/auth/session") in routes
    assert ("POST", "/auth/refresh") in routes


def test_sql_entity_extraction() -> None:
    parsed = parse_file(_file("db/schema.sql", SAMPLE_SQL, language="SQL"))
    entities = [s for s in parsed.symbols if s.kind == "entity"]
    assert any(s.name == "refresh_tokens" for s in entities)


def test_parse_files_reports_engine() -> None:
    response = parse_files([_file("a.ts", SAMPLE_TS), _file("b.ts", SAMPLE_TS)])
    assert response.parser == ("tree-sitter" if TREE_SITTER_AVAILABLE else "regex-fallback")
    assert len(response.files) == 2
    assert response.duration_ms >= 0
    assert response.warnings == []


def test_metrics_and_duplication_hash() -> None:
    first = parse_file(_file("x.ts", SAMPLE_TS))
    second = parse_file(_file("y.ts", SAMPLE_TS))
    assert first.metrics.loc > 0
    assert first.metrics.functions >= 1
    assert first.duplication_hash == second.duplication_hash
    # Comment-only edits must not change the duplication hash (normalised), but
    # a real code edit must.
    commented = parse_file(_file("z.ts", SAMPLE_TS + "\n// changed\n"))
    assert commented.duplication_hash == first.duplication_hash
    other = parse_file(_file("w.ts", SAMPLE_TS + "\nexport const extra = 1;\n"))
    assert other.duplication_hash != first.duplication_hash


def test_unknown_language_falls_back_without_crashing() -> None:
    parsed = parse_file(_file("notes.unknown", "hello world", language="Brainfuck"))
    assert parsed.parse_error
    assert parsed.metrics.loc == 1
