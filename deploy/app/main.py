"""Barcelona Civic Vision — FastAPI backend for Render deployment."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents import AgentResult, evaluate_single
from config import (
    AGENT_CATEGORY,
    COLLECTION_NAMES,
    ENABLE_PAGEINDEX,
    FRONTEND_URL,
    LLM_BASE_URL,
    LLM_MODEL,
    EMBEDDING_BASE_URL,
    EMBEDDING_MODEL,
    VECTORSTORES_DIR,
)
from rag_chroma import ChromaChunk, chroma_retrieve, collection_count

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App ──────────────────────────────────────────────────
app = FastAPI(
    title="BCN Civic Vision API",
    version="0.2.0",
    description="RAG backend with provider-agnostic LLM (Together AI / Groq / OpenAI)",
)

# Build CORS origins: always allow localhost dev + optional deployed frontend
_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]
if FRONTEND_URL:
    _origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup event ────────────────────────────────────────

@app.on_event("startup")
async def startup():
    logger.info("=== BCN Civic Vision API starting ===")
    logger.info("LLM provider:     %s (model: %s)", LLM_BASE_URL, LLM_MODEL)
    logger.info("Embedding provider: %s (model: %s)", EMBEDDING_BASE_URL, EMBEDDING_MODEL)
    logger.info("Vectorstores dir:  %s", VECTORSTORES_DIR)
    logger.info("PageIndex enabled: %s", ENABLE_PAGEINDEX)
    if FRONTEND_URL:
        logger.info("Frontend CORS:     %s", FRONTEND_URL)


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
    """Retrieval-only endpoint for testing RAG quality."""
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
    """Lightweight status check. Does NOT load all collections on cold start."""
    info: dict[str, dict] = {}
    for cat, name in COLLECTION_NAMES.items():
        db_path = VECTORSTORES_DIR / f"chroma_cat{cat}"
        info[f"cat{cat}"] = {
            "collection": name,
            "vectorstore_exists": db_path.exists(),
        }

    return {
        "status": "healthy",
        "llm_provider": LLM_BASE_URL,
        "llm_model": LLM_MODEL,
        "embedding_model": EMBEDDING_MODEL,
        "pageindex_enabled": ENABLE_PAGEINDEX,
        "collections": info,
    }


# ── Run ──────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
