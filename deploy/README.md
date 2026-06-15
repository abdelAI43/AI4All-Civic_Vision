# Deploy — RAG Backend API

This folder contains the **FastAPI backend** that powers the 5 AI agent evaluations for Barcelona Civic Vision. It is deployed on **Render (free tier)** and uses cloud APIs for both LLM inference and embeddings — no local GPU required.

**Live API:** `https://ai4all-civic-vision.onrender.com`

---

## Architecture

```
User submits proposal (React frontend)
        │
        ▼
   POST /api/evaluate
        │
        ▼
┌─────────────────────────────────────────────┐
│  FastAPI Backend (Render)                   │
│                                             │
│  For each of the 5 agents (sequential):     │
│    1. Load system prompt (prompts/*.md)      │
│    2. Query ChromaDB vectorstore             │
│       → Jina AI embeds the query            │
│       → Returns top 5 relevant PDF chunks    │
│    3. Build prompt: system + context + query │
│    4. Call Groq LLM (llama-3.1-8b)          │
│    5. Parse JSON response                    │
│                                             │
│  Return all 5 agent evaluations as JSON     │
└─────────────────────────────────────────────┘
```

## The 5 Agents

| Agent | Category | ChromaDB Collection | What it evaluates |
|-------|----------|--------------------|--------------------|
| **Regulations** | Cat 1 | `barcelona_cat1_local_regulations` | Zoning, municipal codes, PGM, Superblocks |
| **Safety** | Cat 2 | `barcelona_cat2_safety_building` | CTE codes, structural safety, fire, accessibility |
| **Sociologist** | Cat 3 | `barcelona_cat3_social_value` | Social inclusion, participation, quality of life |
| **Heritage** | Cat 4 | `barcelona_cat4_heritage` | UNESCO, architectural catalogues, Cerda Plan |
| **Mobility** | Cat 5 | `barcelona_cat5_mobility` | PMU, cycling, ZBE, Pla Clima, green infra |

Each agent has its own:
- **System prompt** in `app/prompts/{agent_id}.md`
- **ChromaDB vectorstore** in `data/vectorstores/chroma_cat{1-5}/`
- **Score 1-5** with summary, risks, recommendations, and source references

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/evaluate` | Run all 5 agents on a proposal. Body: `{"proposal": "...", "location": "...", "hotspot_id": "..."}` |
| `POST` | `/api/retrieve/{agent_id}` | Test retrieval only (no LLM). Body: `{"query": "...", "n_results": 5}` |
| `GET` | `/api/health` | Status check — shows provider, model, collection status |

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Server | FastAPI + Uvicorn | Async Python, fast, auto-docs at `/docs` |
| Vector DB | ChromaDB (PersistentClient) | Local file-based, no external DB needed |
| Embeddings | Jina AI (`jina-embeddings-v3`) | Free tier, OpenAI-compatible API |
| LLM | Groq (`llama-3.1-8b-instant`) | Free tier, fast inference with lower token pressure |
| Hosting | Render (free) | Docker support, auto-deploy from GitHub |

## File Structure

```
deploy/
  app/
    main.py              # FastAPI entry point, endpoints, CORS
    config.py            # All config from environment variables
    agents.py            # Agent orchestration: retrieve → prompt → LLM → parse
    llm_client.py        # Provider-agnostic LLM (OpenAI SDK wrapper)
    embedding.py         # Jina AI embedding function for ChromaDB
    rag_chroma.py        # ChromaDB vector retrieval (Stage 1)
    rag_hybrid.py        # Hybrid retrieval with optional PageIndex (Stage 2)
    rag_pageindex.py     # LLM-powered document tree search
    prompt_loader.py     # Reads system prompts from .md files
    prompts/
      regulations.md     # System prompt for regulations agent
      safety.md          # System prompt for safety agent
      sociologist.md     # System prompt for sociologist agent
      heritage.md        # System prompt for heritage agent
      mobility.md        # System prompt for mobility agent
  data/
    vectorstores/        # Pre-embedded ChromaDB collections (360MB)
      chroma_cat1/       # ~6300 chunks from regulation PDFs
      chroma_cat2/       # ~2450 chunks from safety PDFs
      chroma_cat3/       # ~4800 chunks from social PDFs
      chroma_cat4/       # ~700 chunks from heritage PDFs
      chroma_cat5/       # ~4200 chunks from mobility PDFs
  Dockerfile             # Python 3.11 + deps + vectorstores
  render.yaml            # Render deployment config
  requirements.txt       # Python dependencies
  .env.example           # Environment variable template
  setup_data.sh          # Helper to copy vectorstores from Knowledge base
  re_embed.ipynb         # One-time notebook to re-embed with Jina AI
```

## How It Works — Data Flow

### 1. PDF Corpus → Vectorstores (one-time, offline)

The Barcelona PDF corpus (regulations, safety codes, social studies, heritage docs, mobility plans) was:
1. Chunked (1400 chars, 250 overlap) in the ingestion notebooks (`Knwlodge base/`)
2. Embedded with `qwen3-embedding:4b` via local Ollama
3. **Re-embedded** with Jina AI `jina-embeddings-v3` using `re_embed.ipynb` (for cloud compatibility)
4. Stored as ChromaDB persistent collections in `data/vectorstores/`

### 2. User Query → Agent Response (runtime, per request)

1. Frontend sends `POST /api/evaluate` with proposal text and location
2. For each agent (sequentially, to stay within Groq rate limits):
   - `rag_chroma.py` embeds the query via Jina AI and retrieves top 8 similar chunks
   - `rag_hybrid.py` returns top 3 chunks (optionally refined by PageIndex tree search)
   - `agents.py` builds a prompt: system instructions + retrieved context + proposal
   - `llm_client.py` sends system + user messages to Groq's LLM
   - Response is parsed as JSON: `{score, summary, risks, recommendations, references}`
3. All 5 results returned to frontend

### 3. LLM Provider Flexibility

The backend uses the OpenAI Python SDK with configurable `base_url`. You can swap LLM providers by changing 3 env vars — no code changes:

```bash
# Groq (default, free)
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant

# OpenAI (paid, best quality)
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# Together AI (free trial)
LLM_BASE_URL=https://api.together.xyz/v1
LLM_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo

# Local Ollama (your own GPU)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=gemma3:4b
```

## Setup for Development

### Run locally (without Docker)

```bash
cd deploy
cp .env.example .env
# Fill in your Groq and Jina API keys in .env

pip install -r requirements.txt
cd app
python main.py
# → http://localhost:8001/api/health
```

### Run with Docker

```bash
cd deploy
cp .env.example .env
# Fill in API keys

docker build -t bcn-api .
docker run -p 8001:8001 --env-file .env bcn-api
```

### Re-embed vectorstores (only needed if changing embedding model)

1. Open `re_embed.ipynb` in Jupyter
2. Set your embedding API key in `deploy/.env`
3. Run all cells — reads chunks from `Knwlodge base/vectorstores/`, re-embeds, writes to `deploy/data/vectorstores/`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_BASE_URL` | Yes | `https://api.groq.com/openai/v1` | LLM provider endpoint |
| `LLM_API_KEY` | Yes | — | LLM provider API key |
| `LLM_MODEL` | Yes | `llama-3.1-8b-instant` | LLM model ID |
| `LLM_MAX_TOKENS` | No | `600` | Maximum response tokens per agent |
| `EMBEDDING_BASE_URL` | Yes | `https://api.jina.ai/v1` | Embedding provider endpoint |
| `EMBEDDING_API_KEY` | Yes | — | Embedding provider API key |
| `EMBEDDING_MODEL` | Yes | `jina-embeddings-v3` | Embedding model ID |
| `CHROMA_N_RESULTS` | No | `8` | Initial retrieval count per agent |
| `FINAL_CONTEXT_CHUNKS` | No | `3` | Context chunks sent to each agent LLM |
| `ENABLE_PAGEINDEX` | No | `false` | Enable Stage 2 tree search |
| `FRONTEND_URL` | No | — | Frontend URL for CORS |
| `PORT` | No | `8001` | Server port (Render sets this) |

## Connecting the Frontend

In the **project root** `.env`:

```bash
# For deployed backend
VITE_API_URL=https://ai4all-civic-vision.onrender.com

# For local backend
VITE_API_URL=http://localhost:8001
```

The frontend reads this in `src/services/api.ts` and calls `POST /api/evaluate`.
