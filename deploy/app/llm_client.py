"""Provider-agnostic LLM client using the OpenAI SDK.

Works with any OpenAI-compatible API:
  - Together AI:   LLM_BASE_URL=https://api.together.xyz/v1
  - Groq:          LLM_BASE_URL=https://api.groq.com/openai/v1
  - OpenAI:        LLM_BASE_URL=https://api.openai.com/v1
  - Remote Ollama: LLM_BASE_URL=http://<host>:11434/v1
"""

from __future__ import annotations

import logging

from openai import AsyncOpenAI

from config import LLM_API_KEY, LLM_BASE_URL, LLM_MAX_TOKENS, LLM_MODEL

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(
    api_key=LLM_API_KEY,
    base_url=LLM_BASE_URL,
)


async def call_llm(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
) -> str:
    """Send a prompt to the configured LLM and return the response text.

    Parameters
    ----------
    prompt : str
        The user message content.
    system : str | None
        Optional system message (recommended for chat models).
    model : str | None
        Override the default model for this call.
    """
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        response = await _client.chat.completions.create(
            model=model or LLM_MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or ""
    except Exception:
        logger.exception("LLM call failed (model=%s, base_url=%s)", model or LLM_MODEL, LLM_BASE_URL)
        raise
