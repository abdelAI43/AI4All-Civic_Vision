"""Stage 1 — ChromaDB vector retrieval against the 5 category collections."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import chromadb

from config import (
    COLLECTION_NAMES,
    VECTORSTORES_DIR,
    CHROMA_N_RESULTS,
)
from embedding import RemoteEmbeddingFunction

logger = logging.getLogger(__name__)


@dataclass
class ChromaChunk:
    """A single retrieved text chunk with metadata."""

    text: str
    source_file: str
    page: int | None
    distance: float
    chunk_index: int | None = None


# ── Singleton caches (lazy loading) ─────────────────────
_clients: dict[int, chromadb.ClientAPI] = {}
_collections: dict[int, Any] = {}

_embedding_fn = RemoteEmbeddingFunction()


def get_chroma_collection(category: int) -> Any:
    """Return the ChromaDB collection for *category* (1-5), creating the
    client on first access (lazy loading to save RAM)."""
    if category in _collections:
        return _collections[category]

    if category not in COLLECTION_NAMES:
        raise ValueError(f"Invalid category {category}; expected 1-5")

    db_path = VECTORSTORES_DIR / f"chroma_cat{category}"
    if not db_path.exists():
        raise FileNotFoundError(f"ChromaDB store not found: {db_path}")

    client = chromadb.PersistentClient(path=str(db_path))
    _clients[category] = client

    collection_name = COLLECTION_NAMES[category]
    # Don't pass embedding_function to get_collection — ChromaDB 1.x
    # rejects it when the collection was created with the default config.
    # We embed queries manually in chroma_retrieve() instead.
    collection = client.get_collection(name=collection_name)
    _collections[category] = collection
    logger.info(
        "Opened ChromaDB cat%d (%s) — %d chunks",
        category,
        collection_name,
        collection.count(),
    )
    return collection


def chroma_retrieve(
    category: int,
    query: str,
    n_results: int = CHROMA_N_RESULTS,
) -> list[ChromaChunk]:
    """Query the ChromaDB collection for *category* and return ranked chunks."""
    collection = get_chroma_collection(category)

    # Embed the query manually using our remote embedding function
    query_embedding = _embedding_fn([query])[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
    )

    chunks: list[ChromaChunk] = []
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(documents, metadatas, distances):
        chunks.append(
            ChromaChunk(
                text=doc,
                source_file=meta.get("source_file", meta.get("relative_path", "unknown")),
                page=meta.get("page"),
                distance=dist,
                chunk_index=meta.get("chunk_index"),
            )
        )

    return chunks


def collection_count(category: int) -> int:
    """Return chunk count for *category*, or -1 if unavailable."""
    try:
        return get_chroma_collection(category).count()
    except Exception:
        return -1
