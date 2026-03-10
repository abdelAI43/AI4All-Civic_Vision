"""Agent orchestration: prompt assembly, LLM calls, and per-agent evaluation."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

import httpx

from config import (
    AGENT_CATEGORY,
    AGENT_DISPLAY,
    OLLAMA_GENERATE_URL,
    RUNTIME_LLM_MODEL,
)
from prompt_loader import load_system_prompt
from rag_hybrid import RetrievedPassage, hybrid_retrieve

logger = logging.getLogger(__name__)


# ── Data models ──────────────────────────────────────────

@dataclass
class AgentResult:
    agent_id: str
    name: str
    icon: str
    score: int
    feedback: str
    risks: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    references: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "agentId": self.agent_id,
            "name": self.name,
            "icon": self.icon,
            "score": self.score,
            "feedback": self.feedback,
            "risks": self.risks,
            "recommendations": self.recommendations,
            "references": self.references,
        }


# ── Ollama LLM call ─────────────────────────────────────

async def call_ollama(prompt: str, model: str = RUNTIME_LLM_MODEL) -> str:
    """Send a prompt to Ollama ``/api/generate`` and return the full response text."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            OLLAMA_GENERATE_URL,
            json={"model": model, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        return resp.json().get("response", "")


# ── Prompt builder ───────────────────────────────────────

def _build_prompt(
    system_prompt: str,
    passages: list[RetrievedPassage],
    proposal: str,
    location: str,
) -> str:
    """Assemble the full prompt: system instructions + retrieved docs + proposal."""
    context_parts: list[str] = []
    for i, p in enumerate(passages, 1):
        page_str = f", page {p.page}" if p.page else ""
        source = f"{p.source_file}{page_str}"
        context_parts.append(f"[CONTEXT {i} — source: {source}]\n{p.text}")

    context_block = "\n\n".join(context_parts)

    return (
        f"{system_prompt}\n\n"
        f"--- Retrieved Documents ---\n"
        f"{context_block}\n"
        f"--- End of Documents ---\n\n"
        f"PROPOSAL: {proposal}\n"
        f"LOCATION: {location}\n\n"
        f"Evaluate this proposal from your expert perspective. "
        f"Respond ONLY with a valid JSON object."
    )


def _parse_agent_json(raw: str, agent_id: str) -> dict:
    """Best-effort parse of the LLM's JSON response."""
    cleaned = raw.strip()

    # Strip markdown code fences
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Agent '%s' returned unparseable JSON: %s", agent_id, raw[:300])
        return {
            "score": 3,
            "summary": raw[:500],
            "risks": [],
            "recommendations": [],
            "references": [],
        }


# ── Single agent evaluation ──────────────────────────────

async def evaluate_single(
    agent_id: str,
    proposal: str,
    location: str,
) -> AgentResult:
    """Run a single agent's full pipeline: retrieve → prompt → LLM → parse."""
    category = AGENT_CATEGORY.get(agent_id)
    if category is None:
        raise ValueError(f"Unknown agent: {agent_id}")

    display = AGENT_DISPLAY[agent_id]

    # 1. Load the system prompt (read from disk each time for hot-reload)
    system_prompt = load_system_prompt(agent_id)

    # 2. Hybrid retrieval (Stage 1 + Stage 2)
    passages = await hybrid_retrieve(category, proposal, call_ollama)

    # 3. Assemble prompt
    prompt = _build_prompt(system_prompt, passages, proposal, location)

    # 4. Call Ollama LLM
    raw_response = await call_ollama(prompt)

    # 5. Parse response
    parsed = _parse_agent_json(raw_response, agent_id)

    score = parsed.get("score", 3)
    if not isinstance(score, int) or not 1 <= score <= 5:
        score = 3

    return AgentResult(
        agent_id=agent_id,
        name=display["name"],
        icon=display["icon"],
        score=score,
        feedback=parsed.get("summary", raw_response[:500]),
        risks=parsed.get("risks", []),
        recommendations=parsed.get("recommendations", []),
        references=parsed.get("references", []),
    )
