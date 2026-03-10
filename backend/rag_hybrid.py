"""Hybrid two-stage retrieval: ChromaDB (Stage 1) + PageIndex tree search (Stage 2)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Awaitable

from config import FINAL_CONTEXT_CHUNKS
from rag_chroma import ChromaChunk, chroma_retrieve
from rag_pageindex import TreeNode, load_tree, tree_search

logger = logging.getLogger(__name__)


@dataclass
class RetrievedPassage:
    """A unified context passage from either retrieval stage."""

    text: str
    source_file: str
    page: int | str | None
    origin: str  # "chroma" or "pageindex"
    score: float = 0.0  # lower = better for chroma distance; for pageindex we use 0


def _unique_source_files(chunks: list[ChromaChunk], max_files: int = 3) -> list[str]:
    """Extract the top unique source filenames from ChromaDB results."""
    seen: set[str] = set()
    result: list[str] = []
    for c in chunks:
        name = Path(c.source_file).name
        if name not in seen:
            seen.add(name)
            result.append(c.source_file)
            if len(result) >= max_files:
                break
    return result


def _deduplicate(passages: list[RetrievedPassage]) -> list[RetrievedPassage]:
    """Remove near-duplicate passages (same text prefix up to 200 chars)."""
    seen: set[str] = set()
    unique: list[RetrievedPassage] = []
    for p in passages:
        key = p.text[:200].strip().lower()
        if key not in seen:
            seen.add(key)
            unique.append(p)
    return unique


async def hybrid_retrieve(
    category: int,
    query: str,
    call_llm: Callable[[str], Awaitable[str]],
    n_chroma: int | None = None,
    n_final: int = FINAL_CONTEXT_CHUNKS,
) -> list[RetrievedPassage]:
    """Run a two-stage hybrid retrieval.

    1. **ChromaDB** vector search → top-N chunks (fast).
    2. **PageIndex** tree search → for each unique source PDF found in Step 1,
       load its pre-built tree and use an LLM to find the most relevant sections.
    3. **Merge** results from both stages, deduplicate, return top-*n_final*.
    """

    # ── Stage 1: ChromaDB ────────────────────────────────
    chroma_chunks = chroma_retrieve(category, query, n_results=n_chroma or 15)
    logger.info("Stage 1: ChromaDB returned %d chunks for cat%d", len(chroma_chunks), category)

    chroma_passages = [
        RetrievedPassage(
            text=c.text,
            source_file=c.source_file,
            page=c.page,
            origin="chroma",
            score=c.distance,
        )
        for c in chroma_chunks
    ]

    # ── Stage 2: PageIndex tree search ───────────────────
    pageindex_passages: list[RetrievedPassage] = []
    source_files = _unique_source_files(chroma_chunks)
    logger.info("Stage 2: searching trees for %d source files", len(source_files))

    for src in source_files:
        tree = load_tree(category, src)
        if tree is None:
            logger.debug("No tree found for %s in cat%d", src, category)
            continue

        nodes: list[TreeNode] = await tree_search(tree, query, call_llm)
        for node in nodes:
            if not node.text:
                continue
            page_ref = (
                f"{node.start_page}-{node.end_page}"
                if node.start_page and node.end_page
                else node.start_page
            )
            pageindex_passages.append(
                RetrievedPassage(
                    text=node.text,
                    source_file=src,
                    page=page_ref,
                    origin="pageindex",
                    score=0.0,  # tree-search results are reasoning-ranked, not distance-scored
                )
            )

    logger.info("Stage 2: PageIndex returned %d passages", len(pageindex_passages))

    # ── Merge ────────────────────────────────────────────
    # PageIndex passages first (reasoning-based, higher precision),
    # then ChromaDB passages (vector similarity, broader recall).
    combined = pageindex_passages + chroma_passages
    deduped = _deduplicate(combined)

    return deduped[:n_final]
