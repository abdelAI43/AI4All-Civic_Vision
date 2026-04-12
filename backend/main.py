"""Barcelona Civic Vision — FastAPI backend for Render deployment."""

from __future__ import annotations

import asyncio
import base64
import datetime as dt
import logging
import os
import uuid

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from rag_chroma import ChromaChunk, chroma_retrieve

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_BUCKET = "generated-images"

app = FastAPI(
    title="BCN Civic Vision API",
    version="0.2.0",
    description="RAG backend with provider-agnostic LLM (Together AI / Groq / OpenAI)",
)

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


@app.on_event("startup")
async def startup():
    logger.info("=== BCN Civic Vision API starting ===")
    logger.info("LLM provider:       %s (model: %s)", LLM_BASE_URL, LLM_MODEL)
    logger.info("Embedding provider: %s (model: %s)", EMBEDDING_BASE_URL, EMBEDDING_MODEL)
    logger.info("Vectorstores dir:   %s", VECTORSTORES_DIR)
    logger.info("PageIndex enabled:  %s", ENABLE_PAGEINDEX)
    if FRONTEND_URL:
        logger.info("Frontend CORS:      %s", FRONTEND_URL)


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


class ProposalCreateRequest(BaseModel):
    spaceId: str
    spaceName: str
    povId: str
    povLabel: str
    baseImagePath: str
    promptText: str
    language: str = "en"
    consentGiven: bool = True
    participantName: str | None = None
    participantAge: str | None = None


def _frontend_origin() -> str:
    return (os.getenv("APP_URL") or FRONTEND_URL or "http://localhost:5173").rstrip("/")


def _normalize_language(language: str) -> str:
    return language if language in {"en", "ca", "es"} else "en"


def _parse_age(raw: str | None) -> int | None:
    if not raw or not raw.strip():
        return None
    age = int(raw.strip())
    if age < 5 or age > 120:
        raise ValueError("participant_age_check")
    return age


def _supabase_env() -> tuple[str, str]:
    return os.getenv("VITE_SUPABASE_URL", "").rstrip("/"), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _supabase_headers(service_key: str, content_type: str = "application/json", prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": content_type,
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _build_image_prompt(space_name: str, pov_id: str, user_prompt: str) -> str:
    return (
        f"Photorealistic urban planning visualization for {space_name}, Barcelona. "
        f"Proposed civic change: {user_prompt}. "
        f"Perspective: {pov_id}. "
        "Style: family-friendly, daytime, architectural rendering, photorealistic. "
        "Keep all existing surroundings intact; only modify what is described."
    )


def _proposal_payload(
    *,
    proposal_id: str,
    req: ProposalCreateRequest,
    generated_image_url: str,
    agent_feedback: list[dict],
    avg_score: float,
    participant_age: int | None,
    created_at: str,
) -> dict:
    return {
        "id": proposal_id,
        "spaceId": req.spaceId,
        "povId": req.povId,
        "promptText": req.promptText,
        "language": _normalize_language(req.language),
        "baseImagePath": req.baseImagePath,
        "generatedImageUrl": generated_image_url,
        "agentFeedback": agent_feedback,
        "avgAgentScore": avg_score,
        "participantName": (req.participantName or "").strip() or None,
        "participantAge": participant_age,
        "consentGiven": True,
        "status": "complete",
        "createdAt": created_at,
    }


async def _generate_image(req: ProposalCreateRequest, proposal_id: str) -> str:
    gemini_key = os.getenv("GOOGLE_GEMINI_API_KEY", "")
    if not gemini_key:
        return req.baseImagePath

    image_url = (
        req.baseImagePath
        if req.baseImagePath.startswith(("http://", "https://"))
        else f"{_frontend_origin()}{req.baseImagePath}"
    )
    mime_type = "image/png" if req.baseImagePath.lower().endswith(".png") else "image/jpeg"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            img_resp = await client.get(image_url)
            img_resp.raise_for_status()
            encoded_image = base64.b64encode(img_resp.content).decode("utf-8")

            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": _build_image_prompt(req.spaceName, req.povId, req.promptText)},
                            {"inline_data": {"mime_type": mime_type, "data": encoded_image}},
                        ]
                    }
                ],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            }
            gen_resp = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/"
                "gemini-2.0-flash-preview-image-generation:generateContent",
                params={"key": gemini_key},
                json=payload,
            )
            gen_resp.raise_for_status()
            data = gen_resp.json()

        blob: dict | None = None
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                blob = part.get("inlineData") or part.get("inline_data")
                if blob and blob.get("data"):
                    break
            if blob and blob.get("data"):
                break

        if not blob or not blob.get("data"):
            return req.baseImagePath

        image_bytes = base64.b64decode(blob["data"])
        out_mime = blob.get("mimeType") or blob.get("mime_type") or "image/png"
        supabase_url, service_key = _supabase_env()

        if not supabase_url or not service_key:
            return f"data:{out_mime};base64,{blob['data']}"

        ext = "png" if out_mime == "image/png" else "jpg"
        object_name = f"{proposal_id}.{ext}"
        upload_url = f"{supabase_url}/storage/v1/object/{SUPABASE_BUCKET}/{object_name}"
        headers = _supabase_headers(service_key, out_mime)
        headers["x-upsert"] = "false"

        async with httpx.AsyncClient(timeout=60.0) as client:
            upload_resp = await client.post(upload_url, content=image_bytes, headers=headers)
            upload_resp.raise_for_status()

        return f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{object_name}"
    except Exception:
        logger.exception("Image generation failed; falling back to base image")
        return req.baseImagePath


async def _persist_proposal(proposal: dict, agent_feedback: list[dict]) -> str:
    supabase_url, service_key = _supabase_env()
    if not supabase_url or not service_key:
        return proposal["createdAt"]

    proposal_row = {
        "id": proposal["id"],
        "space_id": proposal["spaceId"],
        "pov_id": proposal["povId"],
        "prompt_text": proposal["promptText"],
        "language": proposal["language"],
        "base_image_path": proposal["baseImagePath"],
        "generated_image_url": proposal["generatedImageUrl"],
        "avg_agent_score": proposal["avgAgentScore"],
        "participant_name": proposal["participantName"],
        "participant_age": proposal["participantAge"],
        "consent_given": proposal["consentGiven"],
        "status": proposal["status"],
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            proposal_resp = await client.post(
                f"{supabase_url}/rest/v1/proposals",
                headers=_supabase_headers(service_key, prefer="return=representation"),
                json=proposal_row,
            )
            proposal_resp.raise_for_status()
            rows = proposal_resp.json()

            eval_rows = [
                {
                    "proposal_id": proposal["id"],
                    "agent_id": item["agentId"],
                    "agent_name": item["name"],
                    "agent_icon": item["icon"],
                    "score": max(1, min(5, int(item.get("score", 3)))),
                    "feedback": item.get("feedback", ""),
                }
                for item in agent_feedback
            ]

            if eval_rows:
                eval_resp = await client.post(
                    f"{supabase_url}/rest/v1/agent_evaluations",
                    headers=_supabase_headers(service_key),
                    json=eval_rows,
                )
                eval_resp.raise_for_status()

        if rows:
            return rows[0].get("created_at", proposal["createdAt"])
    except Exception:
        logger.exception("Supabase persistence failed; returning non-persisted proposal")

    return proposal["createdAt"]


async def _evaluate_agents_parallel(proposal_text: str, location: str) -> list[dict]:
    """Run all agents concurrently and normalize failures into fallback cards."""
    agent_ids = list(AGENT_CATEGORY.keys())
    tasks = [evaluate_single(aid, proposal_text, location) for aid in agent_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    agent_feedback: list[dict] = []
    for aid, result in zip(agent_ids, results):
        if isinstance(result, Exception):
            logger.exception("Agent '%s' failed", aid)
            agent_feedback.append(
                AgentResult(
                    agent_id=aid,
                    name=aid.title(),
                    icon="⚠️",
                    score=3,
                    feedback="Evaluation could not be completed at this time.",
                ).to_dict()
            )
        else:
            agent_feedback.append(result.to_dict())

    return agent_feedback


@app.post("/api/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    if not req.proposal.strip():
        raise HTTPException(status_code=400, detail="Proposal text is required")

    agents = await _evaluate_agents_parallel(req.proposal, req.location)
    return EvaluateResponse(agents=agents)


@app.post("/api/proposals/create")
async def create_proposal(req: ProposalCreateRequest):
    if not all([req.spaceId, req.spaceName, req.povId, req.baseImagePath, req.promptText.strip()]):
        return JSONResponse(status_code=400, content={"success": False, "error": "Missing required fields"})
    if not req.consentGiven:
        return JSONResponse(status_code=400, content={"success": False, "error": "consent_given is required"})

    try:
        participant_age = _parse_age(req.participantAge)
    except ValueError:
        return JSONResponse(status_code=400, content={"success": False, "error": "participant_age_check"})

    proposal_id = str(uuid.uuid4())
    generated_image_url, agent_feedback = await asyncio.gather(
        _generate_image(req, proposal_id),
        _evaluate_agents_parallel(req.promptText, req.spaceName),
    )

    scores = [float(item["score"]) for item in agent_feedback if isinstance(item.get("score"), (int, float))]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
    created_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")

    proposal = _proposal_payload(
        proposal_id=proposal_id,
        req=req,
        generated_image_url=generated_image_url,
        agent_feedback=agent_feedback,
        avg_score=avg_score,
        participant_age=participant_age,
        created_at=created_at,
    )

    proposal["createdAt"] = await _persist_proposal(proposal, agent_feedback)
    return {"success": True, "data": proposal}


@app.post("/api/retrieve/{agent_id}", response_model=RetrieveResponse)
async def retrieve(agent_id: str, req: RetrieveRequest):
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


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
