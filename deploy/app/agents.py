"""Agent orchestration: prompt assembly, LLM calls, and per-agent evaluation."""

from __future__ import annotations

import json
import logging
import re
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

def _format_source_label(passage: RetrievedPassage) -> str:
    """Return the exact source label the model is allowed to cite."""
    if passage.page:
        return f"{passage.source_file} p.{passage.page}"
    return passage.source_file


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
    allowed_sources: list[str] = []
    for i, p in enumerate(passages, 1):
        source = _format_source_label(p)
        allowed_sources.append(source)
        context_parts.append(f"[CONTEXT {i} — source: {source}]\n{p.text}")

    context_block = "\n\n".join(context_parts)
    source_block = "\n".join(f"- {source}" for source in allowed_sources)

    return (
        f"--- Retrieved Documents ---\n"
        f"{context_block}\n"
        f"--- End of Documents ---\n\n"
        f"Allowed reference strings:\n"
        f"{source_block}\n\n"
        f"PROPOSAL: {proposal}\n"
        f"LOCATION: {location}\n\n"
        f"Evaluate this proposal from your expert perspective. "
        f"Base your evaluation ONLY on the retrieved documents above. "
        f"Do not use general knowledge for facts, rules, codes, place-specific claims, or source names. "
        f"If the retrieved documents do not support a point, say that the evidence was not found in the retrieved context. "
        f"The references array may contain ONLY exact strings from the allowed reference strings list.\n\n"
        f"Respond ONLY with a JSON object using EXACTLY these keys:\n"
        f'{{"score": <integer 1-5>, "summary": "<2-3 sentences>", '
        f'"risks": ["<risk>", ...], "recommendations": ["<rec>", ...], '
        f'"references": ["<exact allowed reference string>", ...]}}'
    )


def _as_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _normalize_reference(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _filter_references(raw_refs: object, passages: list[RetrievedPassage]) -> list[str]:
    """Keep only references that map to a retrieved context source."""
    allowed = [_format_source_label(p) for p in passages]
    normalized_allowed = {_normalize_reference(source): source for source in allowed}

    filtered: list[str] = []
    for ref in _as_string_list(raw_refs):
        match = normalized_allowed.get(_normalize_reference(ref))
        if match and match not in filtered:
            filtered.append(match)

    return filtered


def _grounded_fallback(agent_id: str, reason: str) -> dict:
    return {
        "score": 3,
        "summary": (
            "The retrieved knowledge base context was not sufficient for a grounded "
            f"{agent_id} evaluation. {reason}"
        ),
        "risks": [],
        "recommendations": ["Review or expand the relevant knowledge-base documents before relying on this evaluation."],
        "references": [],
    }


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
        return _grounded_fallback(agent_id, "The model response could not be parsed as valid JSON.")

    # Normalize variant keys
    if "summary" not in data:
        for alt_key in ("evaluation", "feedback", "assessment", "analysis", "description"):
            if alt_key in data:
                data["summary"] = data.pop(alt_key)
                break

    return data


def _sanitize_agent_output(parsed: dict, passages: list[RetrievedPassage], agent_id: str) -> dict:
    """Normalize fields and reject citations that were not retrieved."""
    summary = str(parsed.get("summary") or "").strip()
    if not summary:
        summary = _grounded_fallback(agent_id, "The model did not provide a summary.")["summary"]

    risks = _as_string_list(parsed.get("risks"))
    recommendations = _as_string_list(parsed.get("recommendations"))
    references = _filter_references(parsed.get("references"), passages)

    score = parsed.get("score", 3)
    if isinstance(score, str) and score.isdigit():
        score = int(score)
    if not isinstance(score, int) or not 1 <= score <= 5:
        score = 3

    if not references:
        score = min(score, 3)
        recommendations.append("No valid retrieved-source citation was returned; treat this evaluation as provisional.")

    return {
        "score": score,
        "summary": summary,
        "risks": risks,
        "recommendations": recommendations,
        "references": references,
    }


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
    retrieval_query = f"{proposal}\nLocation: {location}" if location else proposal
    passages = await hybrid_retrieve(category, retrieval_query, call_llm)
    if not passages:
        parsed = _grounded_fallback(agent_id, "No relevant passages were retrieved.")
        return AgentResult(
            agent_id=agent_id,
            name=display["name"],
            icon=display["icon"],
            score=parsed["score"],
            feedback=parsed["summary"],
            risks=parsed["risks"],
            recommendations=parsed["recommendations"],
            references=parsed["references"],
        )

    # 3. Assemble user prompt (system prompt sent separately)
    user_prompt = _build_user_prompt(passages, proposal, location)

    # 4. Call LLM with system + user messages
    raw_response = await call_llm(prompt=user_prompt, system=system_prompt)

    # 5. Parse response
    parsed = _sanitize_agent_output(_parse_agent_json(raw_response, agent_id), passages, agent_id)

    return AgentResult(
        agent_id=agent_id,
        name=display["name"],
        icon=display["icon"],
        score=parsed["score"],
        feedback=parsed["summary"],
        risks=parsed["risks"],
        recommendations=parsed["recommendations"],
        references=parsed["references"],
    )
