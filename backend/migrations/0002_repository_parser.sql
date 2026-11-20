-- 0002: record which parser produced the stored symbols so the UI can state
-- analysis fidelity honestly (tree-sitter vs deterministic fallback).
ALTER TABLE repositories ADD COLUMN parser_mode TEXT NOT NULL DEFAULT '';
