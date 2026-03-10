"""Barcelona Civic Vision — FastAPI backend with hybrid RAG retrieval."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents import AgentResult, evaluate_single
from config import AGENT_CATEGORY, COLLECTION_NAMES, TREES_DIR
from rag_chroma import ChromaChunk, chroma_retrieve, collection_count
from rag_pageindex import list_tree_files

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App ──────────────────────────────────────────────────
app = FastAPI(
    title="BCN Civic Vision API",
    version="0.1.0",
    description="Hybrid RAG backend: ChromaDB + PageIndex tree search via Ollama",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ────────────────────────────

class EvaluateRequest(BaseModel):
    proposal: str
    location: str
    hotspot_id: str = ""


class EvaluateResponse(BaseModel):
    agents: list[dict]


class RetrieveRequest(BaseModel):
    query: str
    n_results: int = 5


class RetrieveResponse(BaseModel):
    chunks: list[dict]


# ── Endpoints ────────────────────────────────────────────

@app.post("/api/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    """Run all 5 agents in parallel and return their evaluations."""
    if not req.proposal.strip():
        raise HTTPException(status_code=400, detail="Proposal text is required")

    agent_ids = list(AGENT_CATEGORY.keys())

    tasks = [
        evaluate_single(aid, req.proposal, req.location)
        for aid in agent_ids
    ]

    results: list[AgentResult] = await asyncio.gather(*tasks, return_exceptions=True)

    agents: list[dict] = []
    for aid, result in zip(agent_ids, results):
        if isinstance(result, Exception):
            logger.error("Agent '%s' failed: %s", aid, result)
            agents.append(
                AgentResult(
                    agent_id=aid,
                    name=aid.title(),
                    icon="⚠️",
                    score=0,
                    feedback=f"Agent error: {result}",
                ).to_dict()
            )
        else:
            agents.append(result.to_dict())

    return EvaluateResponse(agents=agents)


@app.post("/api/retrieve/{agent_id}", response_model=RetrieveResponse)
async def retrieve(agent_id: str, req: RetrieveRequest):
    """Retrieval-only endpoint — no LLM evaluation.

    Returns raw ChromaDB chunks for testing retrieval quality.
    """
    category = AGENT_CATEGORY.get(agent_id)
    if category is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent: {agent_id}")

    chunks: list[ChromaChunk] = chroma_retrieve(category, req.query, n_results=req.n_results)

    return RetrieveResponse(
        chunks=[
            {
                "text": c.text[:1000],
                "source_file": c.source_file,
                "page": c.page,
                "distance": round(c.distance, 4),
            }
            for c in chunks
        ]
    )


@app.get("/api/health")
async def health():
    """Status check: collections available, chunk counts, tree file counts."""
    collections: dict[str, dict] = {}
    for cat, name in COLLECTION_NAMES.items():
        count = collection_count(cat)
        tree_count = len(list_tree_files(cat))
        collections[f"cat{cat}"] = {
            "collection": name,
            "chunks": count,
            "trees": tree_count,
            "status": "ok" if count > 0 else "empty_or_unavailable",
        }

    return {
        "status": "healthy",
        "collections": collections,
    }


# ── Run ──────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
