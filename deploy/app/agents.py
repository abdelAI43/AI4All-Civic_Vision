"""Agent orchestration: prompt assembly, LLM calls, and per-agent evaluation."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from config import AGENT_CATEGORY, AGENT_DISPLAY
from llm_client import call_llm
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


# ── Prompt builder ───────────────────────────────────────

def _build_user_prompt(
    passages: list[RetrievedPassage],
    proposal: str,
    location: str,
) -> str:
    """Assemble the user message: retrieved docs + proposal.

    The system prompt is sent separately as a system message for better
    provider compatibility.
    """
    context_parts: list[str] = []
    for i, p in enumerate(passages, 1):
        page_str = f", page {p.page}" if p.page else ""
        source = f"{p.source_file}{page_str}"
        context_parts.append(f"[CONTEXT {i} — source: {source}]\n{p.text}")

    context_block = "\n\n".join(context_parts)

    return (
        f"--- Retrieved Documents ---\n"
        f"{context_block}\n"
        f"--- End of Documents ---\n\n"
        f"PROPOSAL: {proposal}\n"
        f"LOCATION: {location}\n\n"
        f"Evaluate this proposal from your expert perspective. "
        f"Base your evaluation ONLY on the retrieved documents above. "
        f"Do not invent or assume document names — cite only sources shown in the [CONTEXT] blocks.\n\n"
        f"Respond ONLY with a JSON object using EXACTLY these keys:\n"
        f'{{"score": <integer 1-5>, "summary": "<2-3 sentences>", '
        f'"risks": ["<risk>", ...], "recommendations": ["<rec>", ...], '
        f'"references": ["<source_file.pdf p.XX>", ...]}}'
    )


def _parse_agent_json(raw: str, agent_id: str) -> dict:
    """Best-effort parse of the LLM's JSON response, normalizing variant key names."""
    cleaned = raw.strip()

    # Strip markdown code fences
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Agent '%s' returned unparseable JSON: %s", agent_id, raw[:300])
        return {
            "score": 3,
            "summary": raw[:500],
            "risks": [],
            "recommendations": [],
            "references": [],
        }

    # Normalize variant keys
    if "summary" not in data:
        for alt_key in ("evaluation", "feedback", "assessment", "analysis", "description"):
            if alt_key in data:
                data["summary"] = data.pop(alt_key)
                break

    return data


# ── Single agent evaluation ──────────────────────────────

async def evaluate_single(
    agent_id: str,
    proposal: str,
    location: str,
) -> AgentResult:
    """Run a single agent's full pipeline: retrieve -> prompt -> LLM -> parse."""
    category = AGENT_CATEGORY.get(agent_id)
    if category is None:
        raise ValueError(f"Unknown agent: {agent_id}")

    display = AGENT_DISPLAY[agent_id]

    # 1. Load the system prompt (read from disk each time for hot-reload)
    system_prompt = load_system_prompt(agent_id)

    # 2. Hybrid retrieval (Stage 1 + optional Stage 2)
    passages = await hybrid_retrieve(category, proposal, call_llm)

    # 3. Assemble user prompt (system prompt sent separately)
    user_prompt = _build_user_prompt(passages, proposal, location)

    # 4. Call LLM with system + user messages
    raw_response = await call_llm(prompt=user_prompt, system=system_prompt)

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
