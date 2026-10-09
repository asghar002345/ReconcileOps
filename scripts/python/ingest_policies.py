"""
Week 9 learning script: heading-based chunking + demo-hash embeddings.

Supported production ingest for the app is the TypeScript seed:

  cd backend && npm run db:setup

This script shows the same split/embed ideas in Python (uv):

  cd scripts/python && uv run python ingest_policies.py
"""

from __future__ import annotations

import hashlib
import math
import re
import sys
from pathlib import Path

DIMS = 64
ROOT = Path(__file__).resolve().parents[2]
POLICIES = ROOT / "docs" / "knowledge" / "demo-policies"


def embed(text: str) -> list[float]:
    normalized = re.sub(r"\s+", " ", text.strip().lower())
    vector: list[float] = []
    for i in range(DIMS):
        digest = hashlib.sha256(f"{normalized}::{i}".encode()).digest()
        raw = (digest[0] << 8) | digest[1]
        vector.append(raw / 32767.5 - 1.0)
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


def split_markdown(markdown: str) -> list[tuple[str, str]]:
    section = "Introduction"
    buffer: list[str] = []
    chunks: list[tuple[str, str]] = []

    def flush() -> None:
        nonlocal buffer
        content = "\n".join(buffer).strip()
        if content:
            chunks.append((section, content))
        buffer = []

    for line in markdown.replace("\r\n", "\n").split("\n"):
        match = re.match(r"^(#{1,3})\s+(.+)$", line)
        if match:
            flush()
            section = match.group(2).strip()
            continue
        buffer.append(line)
    flush()
    return chunks


def main() -> int:
    files = sorted(POLICIES.glob("*.md"))
    if not files:
        print(f"No policies in {POLICIES}", file=sys.stderr)
        return 1

    for path in files:
        parts = split_markdown(path.read_text(encoding="utf-8"))
        print(f"{path.name}: {len(parts)} heading chunks")
        for section, content in parts:
            vector = embed(f"{section}\n{content}")
            norm = math.sqrt(sum(v * v for v in vector))
            print(f"  - {section!r} chars={len(content)} ||v||={norm:.4f}")

    print("\nDB ingest: cd backend && npm run db:setup")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
