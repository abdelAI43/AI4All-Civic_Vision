"""Centralized configuration for the Barcelona Civic Vision backend."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# ── Load .env ────────────────────────────────────────────
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()  # try CWD

# ── Paths ────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
KNOWLEDGE_BASE_DIR = PROJECT_ROOT / "Knwlodge base"
VECTORSTORES_DIR = KNOWLEDGE_BASE_DIR / "vectorstores"
CORPUS_DIR = KNOWLEDGE_BASE_DIR / "barcelona_corpus_downloads"
PROMPTS_DIR = BACKEND_DIR / "prompts"
TREES_DIR = BACKEND_DIR / "trees"

# ── Ollama ───────────────────────────────────────────────
OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_EMBED_URL: str = OLLAMA_URL  # ChromaDB 1.x OllamaEmbeddingFunction needs base URL
OLLAMA_GENERATE_URL: str = f"{OLLAMA_URL}/api/generate"

# ── Models ───────────────────────────────────────────────
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "qwen3-embedding:4b")
TREE_GENERATION_MODEL: str = os.getenv("TREE_GENERATION_MODEL", "gemma3:12b")
RUNTIME_LLM_MODEL: str = os.getenv("RUNTIME_LLM_MODEL", "gemma3:4b")

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
CHROMA_N_RESULTS: int = 15       # Stage 1 over-retrieval count
PAGEINDEX_TOP_NODES: int = 5     # Max tree nodes from Stage 2
FINAL_CONTEXT_CHUNKS: int = 5    # Merged context sent to agent LLM

# ── Category folder name patterns (for PDF discovery) ────
CATEGORY_FOLDERS: dict[int, str] = {
    1: "Category 1_ Local regulations and urban planning",
    2: "Category 2_ Safety and building standards",
    3: "Category 3_ Social value and urban quality",
    4: "Category 4_ Heritage and urban identity",
    5: "Category 5_ Mobility and environment",
}
