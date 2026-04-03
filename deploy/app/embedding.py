"""Remote embedding function for ChromaDB using any OpenAI-compatible API.

Replaces the local Ollama embedding function used in development.
Works with Together AI, OpenAI, Jina, or any provider that supports
the /v1/embeddings endpoint.
"""

from __future__ import annotations

import logging
from typing import cast

from chromadb import Documents, EmbeddingFunction, Embeddings
from openai import OpenAI

from config import EMBEDDING_API_KEY, EMBEDDING_BASE_URL, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

_embed_client = OpenAI(
    api_key=EMBEDDING_API_KEY,
    base_url=EMBEDDING_BASE_URL,
)


class RemoteEmbeddingFunction(EmbeddingFunction[Documents]):
    """ChromaDB-compatible embedding function that calls a remote API."""

    def __call__(self, input: Documents) -> Embeddings:
        if not input:
            return cast(Embeddings, [])

        try:
            response = _embed_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=list(input),
            )
            return cast(
                Embeddings,
                [item.embedding for item in response.data],
            )
        except Exception:
            logger.exception(
                "Embedding call failed (model=%s, base_url=%s)",
                EMBEDDING_MODEL,
                EMBEDDING_BASE_URL,
            )
            raise
