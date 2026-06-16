"""Centralized configuration for the Barcelona Civic Vision deploy backend."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# ── Load .env ────────────────────────────────────────────
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()

# ── Paths ────────────────────────────────────────────────
APP_DIR = Path(__file__).resolve().parent
DEPLOY_DIR = APP_DIR.parent
VECTORSTORES_DIR = DEPLOY_DIR / "data" / "vectorstores"
PROMPTS_DIR = APP_DIR / "prompts"
TREES_DIR = APP_DIR / "trees"

# ── LLM Provider (OpenAI-compatible) ────────────────────
LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
LLM_MODEL: str = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
# Output cap per agent call. Lower = fewer tokens/day spent (Groq TPD budget).
LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "400"))

# ── Embedding Provider (Jina AI — free, OpenAI-compatible) ─
EMBEDDING_BASE_URL: str = os.getenv("EMBEDDING_BASE_URL", "https://api.jina.ai/v1")
EMBEDDING_API_KEY: str = os.getenv("EMBEDDING_API_KEY", "")
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "jina-embeddings-v3")

# ── Feature toggles ─────────────────────────────────────
ENABLE_PAGEINDEX: bool = os.getenv("ENABLE_PAGEINDEX", "false").lower() in ("true", "1", "yes")

# ── Server ───────────────────────────────────────────────
PORT: int = int(os.getenv("PORT", "8001"))
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")

# ── ChromaDB collection names per category ───────────────
COLLECTION_NAMES: dict[int, str] = {
    1: os.getenv("CAT1_COLLECTION", "barcelona_cat1_local_regulations"),
    2: os.getenv("CAT2_COLLECTION", "barcelona_cat2_safety_building"),
    3: os.getenv("CAT3_COLLECTION", "barcelona_cat3_social_value"),
    4: os.getenv("CAT4_COLLECTION", "barcelona_cat4_heritage"),
    5: os.getenv("CAT5_COLLECTION", "barcelona_cat5_mobility"),
}

# ── Agent-to-category mapping ────────────────────────────
AGENT_CATEGORY: dict[str, int] = {
    "regulations": 1,
    "safety": 2,
    "sociologist": 3,
    "heritage": 4,
    "mobility": 5,
}

AGENT_DISPLAY: dict[str, dict[str, str]] = {
    "regulations": {"name": "Local Regulations", "icon": "📋"},
    "safety": {"name": "Safety", "icon": "🛡️"},
    "sociologist": {"name": "Sociologist", "icon": "👥"},
    "heritage": {"name": "Heritage", "icon": "🏛️"},
    "mobility": {"name": "Mobility & Environment", "icon": "🌿"},
}

# ── Retrieval tunables ───────────────────────────────────
CHROMA_N_RESULTS: int = 15
PAGEINDEX_TOP_NODES: int = 5
# Chunks fed to the LLM per agent and the max chars kept per chunk.
# These two dominate input-token spend → tune them to fit the Groq TPD budget.
FINAL_CONTEXT_CHUNKS: int = int(os.getenv("FINAL_CONTEXT_CHUNKS", "3"))
MAX_CHUNK_CHARS: int = int(os.getenv("MAX_CHUNK_CHARS", "700"))
