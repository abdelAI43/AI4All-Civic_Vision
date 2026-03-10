"""Stage 2 — PageIndex reasoning-based tree search over pre-built document trees."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Awaitable

from config import TREES_DIR, PAGEINDEX_TOP_NODES

logger = logging.getLogger(__name__)


@dataclass
class TreeNode:
    """A document section retrieved via tree search."""

    node_id: str
    title: str
    text: str
    start_page: int | None = None
    end_page: int | None = None
    summary: str = ""
    source_file: str = ""


# ── Tree file I/O ────────────────────────────────────────

def _tree_dir(category: int) -> Path:
    return TREES_DIR / f"cat{category}"


def list_tree_files(category: int) -> list[Path]:
    """Return all ``*_structure.json`` files for *category*."""
    d = _tree_dir(category)
    if not d.exists():
        return []
    return sorted(d.glob("*_structure.json"))


def load_tree(category: int, source_file: str) -> dict | None:
    """Load the pre-built PageIndex tree JSON for a given source PDF.

    *source_file* can be a full path or just the PDF filename; we try to
    match by stem (e.g. ``NUMet`` matches ``NUMet_structure.json``).
    """
    d = _tree_dir(category)
    if not d.exists():
        return None

    stem = Path(source_file).stem

    # Exact match first
    exact = d / f"{stem}_structure.json"
    if exact.exists():
        return json.loads(exact.read_text(encoding="utf-8"))

    # Fuzzy: filename contains the stem
    for p in d.glob("*_structure.json"):
        if stem.lower() in p.stem.lower():
            return json.loads(p.read_text(encoding="utf-8"))

    return None


# ── Tree manipulation helpers ────────────────────────────

def _remove_text_fields(node: dict) -> dict:
    """Return a deep copy of *node* with ``text`` fields stripped out
    (keep titles, summaries, node_ids for the LLM to reason over)."""
    out: dict[str, Any] = {}
    for k, v in node.items():
        if k == "text":
            continue
        if k == "nodes" and isinstance(v, list):
            out[k] = [_remove_text_fields(child) for child in v]
        else:
            out[k] = v
    return out


def _create_node_mapping(node: dict, mapping: dict[str, dict] | None = None) -> dict[str, dict]:
    """Build a flat ``{node_id: node_dict}`` lookup from the tree."""
    if mapping is None:
        mapping = {}
    nid = node.get("node_id")
    if nid is not None:
        mapping[nid] = node
    for child in node.get("nodes", []):
        _create_node_mapping(child, mapping)
    return mapping


# ── LLM-powered tree search ─────────────────────────────

_TREE_SEARCH_PROMPT = """\
You are given a question and a tree structure of a document.
Each node contains a node id, node title, and a corresponding summary.
Your task is to find all nodes that are likely to contain the answer to the question.

Question: {query}

Document tree structure:
{tree_json}

Reply in JSON:
{{
    "thinking": "<your reasoning about which nodes are relevant>",
    "node_list": ["node_id_1", "node_id_2"]
}}
Return ONLY the JSON. No other text."""


async def tree_search(
    tree: dict,
    query: str,
    call_llm: Callable[[str], Awaitable[str]],
    max_nodes: int = PAGEINDEX_TOP_NODES,
) -> list[TreeNode]:
    """Use an LLM to reason over the *tree* and find nodes relevant to *query*.

    *call_llm* is an async function ``(prompt: str) -> str`` that returns raw text.
    """
    tree_no_text = _remove_text_fields(tree)
    prompt = _TREE_SEARCH_PROMPT.format(
        query=query,
        tree_json=json.dumps(tree_no_text, indent=2, ensure_ascii=False),
    )

    raw = await call_llm(prompt)

    # Parse the LLM JSON response
    try:
        # Strip markdown fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Tree search LLM returned invalid JSON: %s", raw[:300])
        return []

    node_ids: list[str] = parsed.get("node_list", [])[:max_nodes]
    node_map = _create_node_mapping(tree)

    results: list[TreeNode] = []
    for nid in node_ids:
        node = node_map.get(nid)
        if node is None:
            continue
        results.append(
            TreeNode(
                node_id=nid,
                title=node.get("title", ""),
                text=node.get("text", ""),
                start_page=node.get("start_index"),
                end_page=node.get("end_index"),
                summary=node.get("summary", ""),
            )
        )

    return results
