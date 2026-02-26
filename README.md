# Barcelona Civic Vision

> **A conference booth installation inviting citizens to imagine the future of six iconic Barcelona public spaces — powered by AI image generation, specialist AI agents, and a live 3D heatmap.**

<p align="center">
  <img src="https://img.shields.io/badge/Status-Live%20%E2%80%94%20Fully%20Wired-brightgreen" alt="Status: Live">
  <img src="https://img.shields.io/badge/React-19-blue" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue" alt="TypeScript 5.9">
  <img src="https://img.shields.io/badge/Gemini-2.5%20Flash-orange" alt="Gemini 2.5 Flash">
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Realtime-green" alt="Supabase">
</p>

---

## What It Does

Visitors at a physical booth walk up to a screen showing a live 3D map of Barcelona. They can:

1. **Browse** — Explore what others have imagined. Click any of the 6 glowing space markers to see real submissions with AI-generated before/after images and expert scores. A live heatmap shows proposal density across the city.
2. **Suggest** — Hit the orange button, pick a space and a viewpoint photograph, describe a change in plain language (typed or spoken), and within ~30 seconds receive:
   - A photorealistic AI-generated visualization of their proposal
   - Structured feedback from 5 specialist AI agents (Budget, Heritage, Safety, Sociologist, Regulations), each with a score and written assessment
3. **Contribute** — Every accepted submission is stored and appears on the live heatmap immediately, building a collective picture of citizen aspirations.

**Primary goal:** Familiarise the general public with AI as a practical, creative tool in everyday civic life.

---

## Current Status

This is a **fully wired live prototype** — all features connect to real APIs.

| Feature | Status |
|---|---|
| 3D Mapbox map with 6 space markers | ✅ Live |
| Live heatmap from real submissions | ✅ Supabase Realtime |
| Browse proposals (list + detail + image slider) | ✅ Real data |
| 6-step suggest flow (modal) | ✅ Complete |
| Voice input (Web Speech API) | ✅ Chrome only |
| AI image generation (Gemini 2.5 Flash) | ✅ Live |
| 3-layer content guardrails | ✅ Live |
| 5 specialist AI agents | ✅ Gemini Flash simulation* |
| Proposal persistence (Supabase) | ✅ Live |
| EN / CA / ES language switcher | ✅ Live |

> *Agents use Gemini 2.5 Flash with specialist system prompts, each response tagged as an AI simulation. Replacement with OpenAI Assistants (with dedicated knowledge bases) is planned.

---

## Architecture

```
┌──────────────────────────────────────────┐
│         FRONTEND — Vercel Pages          │
│   React 19 · TypeScript · Vite + SWC    │
│   Mapbox GL · Zustand · react-i18next   │
└──────────────────┬───────────────────────┘
                   │ HTTPS
┌──────────────────▼───────────────────────┐
│      BACKEND — Vercel Serverless         │
│              /api/* routes               │
└────────┬───────────────┬─────────────────┘
         │               │
┌────────▼──────┐  ┌─────▼────────────────┐
│   Supabase    │  │  Google AI Studio     │
│  PostgreSQL   │  │  Gemini 2.5 Flash     │
│  + Storage    │  │  (image gen +         │
│  + Realtime   │  │   validation +        │
└───────────────┘  │   agent simulation)   │
                   └──────────────────────-┘
```

**Why this stack:**
- **Vercel** — Zero-config deploys from `git push`, serverless functions in `/api/`, free tier handles conference volumes
- **Supabase** — PostgreSQL + Storage + Realtime in one service, EU-region (Frankfurt), live heatmap subscriptions
- **Single repo** — Frontend and backend co-located, single deploy, zero DevOps

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 + SWC |
| 3D Map | Mapbox GL JS via `react-map-gl` |
| State | Zustand |
| Data Viz | Recharts (radar charts) |
| i18n | react-i18next (EN / CA / ES) |
| Backend | Vercel Serverless Functions |
| Database | Supabase (PostgreSQL + Storage + Realtime) |
| Image AI | Google Gemini 2.5 Flash Image |
| Agent AI | Google Gemini 2.5 Flash (simulation) |
| Design | CSS Variables — Dieter Rams aesthetic |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Modern browser** with WebGL — Chrome recommended (required for voice input)
- **Mapbox account** (free) → [Get API token](https://account.mapbox.com/access-tokens/)
- **Supabase project** with schema from `supabase/schema.sql`
- **Google AI Studio account** → [Get Gemini API key](https://aistudio.google.com/apikey)

### Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```
VITE_MAPBOX_TOKEN=           # Mapbox GL rendering (client)
VITE_SUPABASE_URL=           # Supabase project URL (client + server)
VITE_SUPABASE_ANON_KEY=      # Supabase read queries (client + server)
APP_URL=http://localhost:5173 # App origin for POV image fetching (server only)
GOOGLE_GEMINI_API_KEY=       # Gemini image gen + validation + agents (server only)
SUPABASE_SERVICE_ROLE_KEY=   # Supabase writes (server only — never expose client-side)
```

### Installation

```bash
git clone <repo-url>
cd barcelona-civic-vision
npm install
cp .env.example .env
# Fill in .env values
```

### Running Locally

For **full local development** (frontend + API routes), deploy to Vercel or use the Vercel CLI:

```bash
# Option A — Deploy to Vercel (recommended for production/demo)
vercel deploy

# Option B — Vercel CLI local (requires Vercel account)
npm install -g vercel
vercel dev

# Option C — Vite only (map + browse mode works; suggest flow requires API)
npm run dev
```

### Build for Production

```bash
npm run build    # Type-check + bundle
npm run preview  # Preview production build locally
```

---

## Project Structure

```
barcelona-civic-vision/
├── api/                          # Vercel serverless functions
│   ├── proposals/
│   │   ├── create.ts             # Full pipeline: validate → generate → persist
│   │   └── heatmap.ts            # Heatmap data from Supabase view
│   └── generate/
│       ├── validate-prompt.ts    # Gemini Flash content guardrail
│       └── image.ts              # Gemini image generation endpoint
├── public/
│   └── images/                   # 24 POV photos (6 spaces × 4 views)
│       ├── placa-catalunya/
│       ├── la-rambla/
│       ├── passeig-de-gracia/
│       ├── barceloneta-beach/
│       ├── park-guell/
│       └── mnac-esplanade/
├── src/
│   ├── components/
│   │   ├── map/                  # MapView, HotspotMarker, HeatmapLayer (Realtime)
│   │   ├── proposal/             # ProposalListPanel, ProposalPanel, ImageComparison
│   │   ├── flow/                 # 6-step suggest modal (SuggestFlow → step components)
│   │   ├── agents/               # AgentPanel (radar chart) + AgentCard
│   │   └── ui/                   # Header (lang switcher)
│   ├── data/
│   │   └── spaces.ts             # 6 spaces × 4 POVs — single source of truth
│   ├── hooks/
│   │   └── voice/                # Web Speech API — swappable module
│   ├── lib/
│   │   └── supabase.ts           # Frontend Supabase client (anon key)
│   ├── locales/                  # en.json · ca.json · es.json
│   ├── store/
│   │   └── useAppStore.ts        # Zustand global state
│   ├── styles/
│   │   ├── globals.css           # Design tokens (CSS variables)
│   │   └── flow.css              # Suggest flow UI
│   └── types/index.ts
├── supabase/
│   └── schema.sql                # Full Supabase schema (apply once)
├── .env.example                  # Environment variable template
└── vite.config.ts
```

---

## The 6 Spaces

| # | Space | Type |
|---|---|---|
| 1 | Plaça Catalunya | Square |
| 2 | La Rambla | Boulevard |
| 3 | Passeig de Gràcia | Boulevard |
| 4 | Barceloneta Beach | Beach |
| 5 | Park Güell | Park |
| 6 | MNAC Esplanade | Esplanade |

Each space has 4 pre-chosen POV photographs (pedestrian, aerial, cyclist, etc.) sourced by the team and stored in `public/images/`. To swap a photo: replace the file and update `isPlaceholder`/`path` in `src/data/spaces.ts` — no code changes needed.

---

## Content Guardrails (3 Layers)

1. **Client-side keyword filter** — instant blocklist check on blur and submit
2. **Gemini Flash validator** — server-side contextual check before image generation; rejected prompts return user to Step 3 with a specific explanation
3. **Prompt wrapping + safety settings** — user text is never sent raw to the image model; server wraps it in an architectural rendering context with `BLOCK_MEDIUM_AND_ABOVE` on all harm categories

---

## Design System

Inspired by Dieter Rams / Braun industrial design — functional, minimal, timeless.

| Token | Value | Usage |
|---|---|---|
| `--color-accent` | `#D4763C` | Braun orange — buttons, markers, highlights |
| `--color-bg` | `#F5F0EB` | Warm off-white background |
| `--color-text` | `#2C2C2C` | Charcoal primary text |
| `--color-green` | `#6B8F71` | Score ≥ 4 |
| `--color-amber` | `#C4943A` | Score ≥ 3, warnings |
| `--color-red` | `#B5574B` | Score < 3, errors |

All values are CSS custom properties in `src/styles/globals.css`. Never hardcode colors or spacing.

---

## Academic Context

This project is part of **MaAI**'s "AI for All" class at **IAAC (Institute for Advanced Architecture of Catalonia)**, exploring:
- Participatory urban planning
- AI-assisted civic decision-making
- Human-centered design for public installations

---

## License

MIT — Free for academic and personal use.

---

## Contact

Open an issue or reach out via GitHub for questions or collaboration.
