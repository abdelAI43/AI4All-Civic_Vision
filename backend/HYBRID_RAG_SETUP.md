# Hybrid RAG Pipeline Setup — Ollama Edition

> ChromaDB vector search + PageIndex reasoning-based tree search, **fully local via Ollama**.  
> No cloud APIs. No external costs. All inference runs on your RTX 4070 Laptop GPU.

---

## Prerequisites

- **Ollama** installed and running at `http://localhost:11434`
- **GPU**: NVIDIA RTX 4070 Laptop (8 GB VRAM) or equivalent
- **Python 3.10+**
- **Node 18+** (for the React frontend)

### Required Ollama Models

```bash
# Embedding model (used by ChromaDB during ingestion + retrieval)
ollama pull qwen3-embedding:4b

# LLM for PageIndex tree generation (one-time build, needs strong reasoning)
ollama pull gemma3:12b

# LLM for runtime: agent evaluation + tree search
ollama pull gemma3:4b
```

### VRAM Budget

| Process | Model | VRAM |
|---------|-------|------|
| Embedding | qwen3-embedding:4b | ~2.5 GB |
| Tree generation (one-time) | gemma3:12b | ~8 GB (run alone) |
| Runtime LLM | gemma3:4b | ~3 GB |
| **Runtime total** | embedding + gemma3:4b | **~5.5 GB** ✅ |

> **Important:** Tree generation uses `gemma3:12b` which needs full VRAM — run it separately, not alongside the embedding model. Runtime uses `gemma3:4b` which coexists with the embedding model.

---

## Architecture Overview

```
┌─────────────── BUILD PHASE (one-time) ───────────────────┐
│                                                           │
│  1. ChromaDB Ingestion (already done via notebooks)       │
│     PDFs → PyMuPDF → chunks → qwen3-embedding:4b         │
│     → 5 ChromaDB collections (chroma_cat1..cat5)          │
│                                                           │
│  2. PageIndex Tree Generation (NEW — this guide)          │
│     PDFs → PageIndex + gemma3:12b via Ollama              │
│     → hierarchical JSON trees per document                │
│     → backend/trees/cat1..cat5/                           │
│                                                           │
└───────────────────────────────────────────────────────────┘

┌─────────────── RUNTIME (per proposal) ───────────────────┐
│                                                           │
│  User submits proposal via React frontend                 │
│       │                                                   │
│       ▼                                                   │
│  POST /api/evaluate → FastAPI backend                     │
│       │                                                   │
│       ▼ (×5 agents in parallel)                           │
│                                                           │
│  Stage 1: ChromaDB Vector Search (fast, ~ms)              │
│    → embed query via qwen3-embedding:4b                   │
│    → cosine search → top-15 chunks                        │
│    → identifies which source PDFs are relevant             │
│       │                                                   │
│       ▼                                                   │
│  Stage 2: PageIndex Tree Search (reasoning, ~2-5s)        │
│    → load pre-built tree JSONs for Stage 1 source PDFs    │
│    → gemma3:4b reasons over tree node summaries            │
│    → extracts precise document sections                    │
│       │                                                   │
│       ▼                                                   │
│  Merge → deduplicate → top-5 context passages             │
│       │                                                   │
│       ▼                                                   │
│  System prompt (.md file) + context → gemma3:4b           │
│       │                                                   │
│       ▼                                                   │
│  Agent JSON response (score, summary, risks, refs)        │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Environment Setup

```bash
cd backend

# Copy env template and edit if needed
cp .env.example .env

# Create venv and install dependencies
python -m venv .venv
.venv\Scripts\Activate.ps1          # Windows PowerShell
pip install -r requirements.txt
```

The `.env` file contains:

```env
OLLAMA_URL=http://localhost:11434
OPENAI_BASE_URL=http://localhost:11434/v1
CHATGPT_API_KEY=ollama

EMBEDDING_MODEL=qwen3-embedding:4b
TREE_GENERATION_MODEL=gemma3:12b
RUNTIME_LLM_MODEL=gemma3:4b

CAT1_COLLECTION=barcelona_cat1_local_regulations
CAT2_COLLECTION=barcelona_cat2_safety_building
CAT3_COLLECTION=barcelona_cat3_social_value
CAT4_COLLECTION=barcelona_cat4_heritage
CAT5_COLLECTION=barcelona_cat5_mobility
```

### 2. Generate PageIndex Trees (One-Time)

PageIndex uses the `openai` Python SDK internally. By setting `OPENAI_BASE_URL` to Ollama's OpenAI-compatible endpoint, all LLM calls route to your local Ollama instance.

```bash
# Generate trees for ALL categories (takes time — runs gemma3:12b per PDF)
python scripts/generate_trees.py

# Or just one category
python scripts/generate_trees.py --category 4

# Force re-generation of existing trees
python scripts/generate_trees.py --category 1 --force
```

This creates:
```
backend/trees/
├── cat1/   ← one JSON tree per PDF from Category 1
├── cat2/
├── cat3/
├── cat4/
└── cat5/
```

Each JSON file contains a hierarchical tree structure like:
```json
{
  "title": "Document Title",
  "node_id": "0000",
  "summary": "Overview of the document...",
  "start_index": 1,
  "end_index": 45,
  "text": "Full text of this section...",
  "nodes": [
    {
      "title": "Chapter 1: Regulations",
      "node_id": "0001",
      "summary": "This section covers...",
      "text": "...",
      "nodes": []
    }
  ]
}
```

### 3. Start the Backend

```bash
# Make sure Ollama is running
ollama serve

# Start the API
cd backend
uvicorn main:app --reload --port 8000
```

### 4. Start the Frontend

```bash
# In project root (separate terminal)
npm run dev
```

The frontend runs at `http://localhost:5173` and calls the backend at `http://localhost:8000`.

---

## How Hybrid Retrieval Works

### Stage 1 — ChromaDB (vector similarity, ~milliseconds)
- Proposal text is embedded using `qwen3-embedding:4b` via Ollama
- ChromaDB searches the relevant category collection using cosine distance
- Returns top-15 chunks with source filenames and page numbers
- **Purpose**: Fast narrowing — identifies WHICH documents are relevant

### Stage 2 — PageIndex (LLM reasoning, ~2-5 seconds)
- For each unique source PDF identified in Stage 1, loads its pre-built tree JSON
- Sends the tree structure (titles + summaries only, NOT full text) to `gemma3:4b`
- The LLM reasons about which tree nodes likely contain relevant information
- Extracts the full text from the identified nodes
- **Purpose**: Precise extraction — finds EXACTLY which sections matter

### Merge
- Combines PageIndex passages (reasoning-ranked, higher precision) with ChromaDB chunks (similarity-ranked, broader recall)
- Deduplicates overlapping content
- Returns final top-5 context passages to the agent

### Why Hybrid?

| Approach | Strengths | Weaknesses |
|----------|-----------|------------|
| ChromaDB only | Fast, simple | Arbitrary chunk boundaries, "vibe matching" |
| PageIndex only | Precise, natural sections | Slow if scanning all documents |
| **Hybrid** | **Fast + precise** | **Slight complexity** |

---

## Agent → Category → Collection Mapping

| Agent | Category | ChromaDB Collection | Tree Folder | Prompt File |
|-------|----------|-------------------|-------------|-------------|
| Regulations | Cat 1 | `barcelona_cat1_local_regulations` | `trees/cat1/` | `prompts/regulations.md` |
| Safety | Cat 2 | `barcelona_cat2_safety_building` | `trees/cat2/` | `prompts/safety.md` |
| Sociologist | Cat 3 | `barcelona_cat3_social_value` | `trees/cat3/` | `prompts/sociologist.md` |
| Heritage | Cat 4 | `barcelona_cat4_heritage` | `trees/cat4/` | `prompts/heritage.md` |
| Mobility | Cat 5 | `barcelona_cat5_mobility` | `trees/cat5/` | `prompts/mobility.md` |

---

## System Prompts (for the other team member)

System prompts live in `backend/prompts/` as plain Markdown files. **No code changes are needed to update them** — the backend reads them fresh on every request.

```
backend/prompts/
├── regulations.md    ← Cat 1: zoning, permits, urban planning codes
├── safety.md         ← Cat 2: CTE, fire safety, accessibility, building codes
├── sociologist.md    ← Cat 3: social impact, participation, inclusion
├── heritage.md       ← Cat 4: UNESCO, heritage protection, patrimony
└── mobility.md       ← Cat 5: mobility plans, climate, green infrastructure
```

To update an agent's behavior:
1. Open the `.md` file
2. Edit the instructions
3. Save the file
4. Next evaluation request uses the new prompt — no restart needed

---

## API Endpoints

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/evaluate` | `{proposal, location, hotspot_id}` | Full evaluation: runs 5 agents in parallel, returns scores |
| `POST` | `/api/retrieve/{agent_id}` | `{query, n_results}` | Retrieval-only: returns raw ChromaDB chunks (no LLM eval) |
| `GET` | `/api/health` | — | Status: collections, chunk counts, tree file counts |

### Example: Full Evaluation

```bash
curl -X POST http://localhost:8000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "proposal": "Add a community garden with seating to Plaça del Sol",
    "location": "Plaça del Sol, Gràcia",
    "hotspot_id": "placa-sol"
  }'
```

### Example: Test Retrieval

```bash
curl -X POST http://localhost:8000/api/retrieve/heritage \
  -H "Content-Type: application/json" \
  -d '{"query": "solar panels rooftop Eixample heritage", "n_results": 5}'
```

### Example: Health Check

```bash
curl http://localhost:8000/api/health
```

---

## Ollama Configuration Details

PageIndex internally uses the `openai` Python SDK. Ollama exposes an OpenAI-compatible API at `/v1`. By setting these environment variables, ALL OpenAI SDK calls (from both PageIndex and our backend) route to your local Ollama:

```env
OPENAI_BASE_URL=http://localhost:11434/v1
CHATGPT_API_KEY=ollama
```

The `CHATGPT_API_KEY` value doesn't matter — Ollama doesn't check it — but the SDK requires it to be non-empty.

### Model Recommendations for RTX 4070 (8 GB VRAM)

| Use Case | Model | VRAM | Notes |
|----------|-------|------|-------|
| Embedding | `qwen3-embedding:4b` | ~2.5 GB | Used by ChromaDB, runs alongside LLM |
| Tree generation | `gemma3:12b` | ~8 GB | One-time build, run alone |
| Agent eval + tree search | `gemma3:4b` | ~3 GB | Runtime, runs alongside embedding |
| Higher quality (if VRAM allows) | `gemma3:12b` | ~8 GB | Replace gemma3:4b but can't coexist with embedding |

---

## File Structure

```
backend/
├── main.py              ← FastAPI app, CORS, endpoints
├── config.py            ← Centralized configuration
├── agents.py            ← Agent orchestration (prompt + retrieval + LLM)
├── prompt_loader.py     ← Load .md system prompts from disk
├── rag_chroma.py        ← Stage 1: ChromaDB vector retrieval
├── rag_pageindex.py     ← Stage 2: PageIndex tree search
├── rag_hybrid.py        ← Two-stage orchestrator, merge + dedup
├── requirements.txt     ← Python dependencies
├── .env.example         ← Environment variable template
├── HYBRID_RAG_SETUP.md  ← This file
├── prompts/             ← System prompts (team member edits these)
│   ├── regulations.md
│   ├── safety.md
│   ├── sociologist.md
│   ├── heritage.md
│   └── mobility.md
├── scripts/
│   └── generate_trees.py  ← Batch PageIndex tree generation
└── trees/               ← Pre-built PageIndex tree JSONs
    ├── cat1/
    ├── cat2/
    ├── cat3/
    ├── cat4/
    └── cat5/
```
