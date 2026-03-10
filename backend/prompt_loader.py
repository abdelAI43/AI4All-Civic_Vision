"""Load system prompts from markdown files in backend/prompts/."""

from __future__ import annotations

import logging
from pathlib import Path

from config import PROMPTS_DIR

logger = logging.getLogger(__name__)

_DEFAULT_PROMPT = (
    "You are an expert evaluating urban proposals in Barcelona. "
    "Use ONLY the retrieved document excerpts to inform your evaluation. "
    "Cite sources by filename and page number.\n\n"
    "Respond in JSON: "
    '{"score": 1-5, "summary": "...", "risks": [...], '
    '"recommendations": [...], "references": [...]}'
)


def load_system_prompt(agent_id: str) -> str:
    """Read the system prompt for *agent_id* from ``prompts/{agent_id}.md``.

    Falls back to a generic default when the file is missing or empty.
    The file is read fresh on every call so edits take effect immediately
    without restarting the server.
    """
    prompt_file: Path = PROMPTS_DIR / f"{agent_id}.md"

    if not prompt_file.exists():
        logger.warning("Prompt file missing for '%s', using default", agent_id)
        return _DEFAULT_PROMPT

    text = prompt_file.read_text(encoding="utf-8").strip()
    if not text:
        logger.warning("Prompt file empty for '%s', using default", agent_id)
        return _DEFAULT_PROMPT

    return text
