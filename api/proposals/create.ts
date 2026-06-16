/* -----------------------------------------------------------------------
   POST /api/proposals/create
   Body: {
     spaceId: string, spaceName: string,
     povId: string, povLabel: string,
     baseImagePath: string,          // e.g. "/images/placa-catalunya/pedestrian.jpg"
     promptText: string,
     language: "en" | "ca" | "es",
     consentGiven: boolean,
     participantName?: string,
     participantAge?: string,
   }
   Returns: { success: true, data: Proposal }

   Pipeline:
     1. Layer 2 guardrail  — Gemini Flash validates prompt
     2. Image generation   — Gemini 2.5 Flash Image (text-and-image-to-image)
     3. Storage upload     — Supabase Storage "generated-images" bucket
     4. Persist            — INSERT proposals + agent_evaluations
     5. Return             — full Proposal object
   ----------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '../_types';
import {
  assertConsentForParticipantInfo,
  type NormalizedParticipantInput,
  type ParticipantGender,
  type PromptSource,
} from '../_proposalUtils';

// ── POV prompt modifiers ──────────────────────────────────────────────────────
const POV_MODIFIERS: Record<string, string> = {
  pedestrian:        'from street level as a pedestrian',
  'bottom-up':       'from a low angle looking upward',
  aerial:            'from an aerial bird\'s-eye perspective',
  cyclist:           'from street level as a cyclist',
  rooftop:           'from a rooftop vantage point',
  waterfront:        'from the waterfront looking inland',
  overview:          'from a wide overview angle',
  building:          'focusing on the building facades',
  night:             'at night with city lighting',
  'top-view':        'from directly above (top-down view)',
  'placa-reial':     'from the Plaça Reial entrance perspective',
  resident:          'from a resident\'s street-level viewpoint',
  road:              'from the road perspective',
  beach:             'from the beach facing the sea',
  esplanade:         'from the esplanade promenade',
  court:             'from within the court area',
  alley:             'from the park alley path',
  pillars:           'near the iconic pillared viaduct',
  'two-towers':      'from between the two towers',
  'placa-puig':      'from the Plaça Puig i Cadafalch centre',
};

// ── RAG backend agent evaluation ─────────────────────────────────────────────

// Display metadata for the 5 RAG agents (used only for fallback responses)
const RAG_AGENT_META: Record<string, { name: string; icon: string }> = {
  regulations: { name: 'Regulations Dept',  icon: '📋' },
  safety:      { name: 'Safety Officer',    icon: '🛡️' },
  sociologist: { name: 'Urban Sociologist', icon: '👥' },
  heritage:    { name: 'Heritage Expert',   icon: '🏛️' },
  mobility:    { name: 'Mobility Planner',  icon: '🚴' },
};

type Evaluation = {
  agentId: string;
  name: string;
  icon: string;
  score: number;
  feedback: string;
  risks: string[];
  recommendations: string[];
  references: string[];
};

// The RAG backend can return per-agent error strings (e.g. a Groq 429 token-limit
// message) inside the feedback field. Never surface raw provider errors to users —
// swap them for a calm fallback so the UI stays clean.
const AGENT_ERROR_MARKERS = ['agent error', 'error code', 'rate_limit', 'rate limit', 'resource_exhausted'];
function isErrorFeedback(feedback: string): boolean {
  const lower = feedback.toLowerCase();
  return AGENT_ERROR_MARKERS.some((m) => lower.includes(m));
}
function cleanAgentFeedback(feedback: string): string {
  return isErrorFeedback(feedback) ? 'Evaluation is temporarily unavailable for this specialist.' : feedback;
}

// Persona briefs for the Gemini fallback panel. Order is canonical (5 agents,
// no "budget" agent — replaced by mobility). Kept in sync with RAG_AGENT_META.
const RAG_AGENT_PERSONAS: Array<{ agentId: string; brief: string }> = [
  { agentId: 'regulations', brief: 'Regulations Dept — municipal urban-planning rules, permits, and legal feasibility in Barcelona.' },
  { agentId: 'safety',      brief: 'Safety Officer — public safety, accident risk, and construction/operational safety.' },
  { agentId: 'sociologist', brief: 'Urban Sociologist — social inclusion, community impact, and effects on diverse residents.' },
  { agentId: 'heritage',    brief: 'Heritage Expert — architectural and cultural heritage and the historic character of the space.' },
  { agentId: 'mobility',    brief: 'Mobility Planner — pedestrian, cyclist, and public-transport flow plus accessibility.' },
];

// Silent fallback: when the RAG backend is down or rate-limited, run the five
// specialists directly through Gemini with persona system prompts. Output looks
// the same EXCEPT it carries no document `references` — that empty Sources list
// is the (intentional) tell that this was the lighter Gemini panel, not full RAG.
async function runGeminiAgentFallback(
  ai: GoogleGenAI,
  spaceName: string,
  promptText: string,
  language: string,
): Promise<Evaluation[]> {
  const personaList = RAG_AGENT_PERSONAS.map((p, i) => `${i + 1}. ${p.brief}`).join('\n');
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        `Location: ${spaceName}, Barcelona\n` +
        `Citizen proposal: "${promptText}"\n` +
        `Write all feedback in this language: ${language}.`,
      config: {
        systemInstruction:
          'You are a panel of five Barcelona urban-planning specialists evaluating a citizen proposal. ' +
          `The specialists are:\n${personaList}\n` +
          'For each specialist, from their own domain, give: a score from 1 to 5, one or two sentences of ' +
          'concrete feedback, up to two short risks, and up to two short recommendations. ' +
          'Return JSON only: {"agents":[{"agentId":"regulations|safety|sociologist|heritage|mobility",' +
          '"score":3,"feedback":"","risks":[],"recommendations":[]}]}',
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });

    const parsed = JSON.parse(response.text ?? '{}') as { agents?: Array<Record<string, unknown>> };
    const byId = new Map((Array.isArray(parsed.agents) ? parsed.agents : []).map((a) => [String(a.agentId ?? ''), a]));

    return RAG_AGENT_PERSONAS.map(({ agentId }) => {
      const a = byId.get(agentId) ?? {};
      const meta = RAG_AGENT_META[agentId];
      const toStringArray = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 2) : []);
      return {
        agentId,
        name:            meta.name,
        icon:            meta.icon,
        score:           Math.max(1, Math.min(5, Math.round(Number(a.score) || 3))),
        feedback:        cleanAgentFeedback(String(a.feedback ?? 'Evaluation completed.')),
        risks:           toStringArray(a.risks),
        recommendations: toStringArray(a.recommendations),
        references:      [], // no document sources in the Gemini fallback
      };
    });
  } catch (err) {
    console.error('[agents] Gemini fallback failed:', err instanceof Error ? err.message : err);
    // Last resort: neutral scores so the rest of the pipeline can still complete.
    return Object.entries(RAG_AGENT_META).map(([agentId, meta]) => ({
      agentId,
      name:            meta.name,
      icon:            meta.icon,
      score:           3,
      feedback:        'Evaluation could not be completed at this time.',
      risks:           [] as string[],
      recommendations: [] as string[],
      references:      [] as string[],
    }));
  }
}

type ProposalResponse = {
  id: string;
  spaceId: string;
  povId: string;
  promptText: string;
  language: string;
  baseImagePath: string;
  generatedImageUrl: string;
  agentFeedback: Evaluation[];
  avgAgentScore: number;
  communityScore: number;
  voteCount: number;
  participantName?: string;
  participantAge?: number;
  participantGender?: ParticipantGender;
  hasChildren?: boolean;
  hasPets?: boolean;
  hasRestrictedMobility?: boolean;
  consentGiven: boolean;
  status: 'complete';
  createdAt: string;
  originalPromptText?: string;
  expertSuggestedPrompt?: string;
  promptSource: PromptSource;
  isDraft?: boolean;
};

function averageScore(evaluations: Evaluation[]): number {
  if (evaluations.length === 0) return 0;
  return parseFloat((evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length).toFixed(2));
}

function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

async function runAgentEvaluations(
  ai: GoogleGenAI,
  spaceName: string,
  hotspotId: string,
  promptText: string,
  language: string,
): Promise<Evaluation[]> {
  const ragUrl = process.env.RAG_BACKEND_URL ?? 'https://ai4all-civic-vision.onrender.com';

  try {
    const resp = await fetch(`${ragUrl}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal:   promptText,
        location:   `${spaceName}, Barcelona`,
        hotspot_id: hotspotId,
      }),
      signal: AbortSignal.timeout(120_000), // 2-min timeout for cold-start + 5 sequential agents
    });

    if (!resp.ok) {
      throw new Error(`RAG backend returned ${resp.status}`);
    }

    const data = await resp.json() as { agents?: unknown[] };
    const agents = Array.isArray(data.agents) ? data.agents : [];
    if (agents.length === 0) {
      throw new Error('RAG backend returned no agents');
    }

    const mapped = agents.map((a) => {
      const agent = a as Record<string, unknown>;
      const agentId = String(agent.agentId ?? agent.agent_id ?? '');
      const meta = RAG_AGENT_META[agentId] ?? { name: agentId, icon: '🤖' };
      return {
        agentId,
        name:            String(agent.name            ?? meta.name),
        icon:            String(agent.icon            ?? meta.icon),
        score:           Math.max(1, Math.min(5, Math.round(Number(agent.score) || 3))),
        rawFeedback:     String(agent.feedback ?? agent.summary ?? 'Evaluation completed.'),
        risks:           Array.isArray(agent.risks)           ? agent.risks as string[]           : [],
        recommendations: Array.isArray(agent.recommendations) ? agent.recommendations as string[] : [],
        references:      Array.isArray(agent.references)      ? agent.references as string[]      : [],
      };
    });

    const finalize = ({ rawFeedback, ...rest }: typeof mapped[number]): Evaluation => ({ ...rest, feedback: rawFeedback });
    const goodById = new Map(mapped.filter((m) => !isErrorFeedback(m.rawFeedback)).map((m) => [m.agentId, finalize(m)]));

    // All agents errored (e.g. provider fully rate-limited) → full Gemini panel.
    if (goodById.size === 0) {
      throw new Error('RAG agents all errored (provider rate-limited)');
    }

    // All good → return RAG as-is (in canonical order so the radar axes line up).
    if (goodById.size === RAG_AGENT_PERSONAS.length) {
      return RAG_AGENT_PERSONAS.map(({ agentId }) => goodById.get(agentId)).filter((e): e is Evaluation => e !== undefined);
    }

    // PARTIAL failure: keep the good RAG agents (with their real sources) and fill
    // ONLY the failed specialists from Gemini, so the panel is always complete.
    console.warn(`[agents] ${RAG_AGENT_PERSONAS.length - goodById.size} RAG agent(s) errored — filling the rest from Gemini.`);
    const gemini = await runGeminiAgentFallback(ai, spaceName, promptText, language);
    const geminiById = new Map(gemini.map((g) => [g.agentId, g]));

    return RAG_AGENT_PERSONAS.map(({ agentId }): Evaluation => goodById.get(agentId) ?? geminiById.get(agentId) ?? {
      agentId,
      name:            RAG_AGENT_META[agentId].name,
      icon:            RAG_AGENT_META[agentId].icon,
      score:           3,
      feedback:        'Evaluation could not be completed at this time.',
      risks:           [],
      recommendations: [],
      references:      [],
    });
  } catch (err) {
    console.warn('[agents] RAG unavailable — using Gemini fallback panel:', err instanceof Error ? err.message : err);
    return runGeminiAgentFallback(ai, spaceName, promptText, language);
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildWrappedPrompt(spaceName: string, povId: string, userPrompt: string): string {
  const mod = POV_MODIFIERS[povId] ?? 'from this viewpoint';
  return (
    `Photorealistic urban planning visualization for ${spaceName}, Barcelona. ` +
    `Proposed civic change: ${userPrompt}. ` +
    `Perspective: ${mod}. ` +
    `Style: family-friendly, daytime, architectural rendering, photorealistic. ` +
    `Keep all existing surroundings intact; only modify what is described.`
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function generateSuggestedPrompt(params: {
  ai: GoogleGenAI;
  spaceName: string;
  promptText: string;
  language: string;
  evaluations: Evaluation[];
}): Promise<string | undefined> {
  try {
    const agentBrief = params.evaluations.map((agent) => ({
      agent: agent.name,
      score: agent.score,
      feedback: agent.feedback,
      risks: agent.risks,
      recommendations: agent.recommendations,
    }));

    const response = await params.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        `Location: ${params.spaceName}, Barcelona\n` +
        `Language: ${params.language}\n` +
        `Original citizen proposal: "${params.promptText}"\n` +
        `Expert agent feedback JSON: ${JSON.stringify(agentBrief)}\n\n` +
        'Rewrite the proposal as one improved citizen-facing prompt for image generation. ' +
        'Keep the citizen intention, make it more specific, feasible, inclusive, and responsive to the expert feedback. ' +
        'Do not add agent scores or explanations.',
      config: {
        systemInstruction:
          'You improve civic design prompts. Return JSON only: {"suggestedPromptText":"one clear improved proposal, max 70 words"}',
        responseMimeType: 'application/json',
        temperature: 0.35,
      },
    });

    const parsed = JSON.parse(response.text ?? '{}') as { suggestedPromptText?: string };
    const suggested = parsed.suggestedPromptText?.trim();
    if (!suggested || suggested === params.promptText.trim()) return undefined;
    return suggested.slice(0, 700);
  } catch (err) {
    console.warn('[prompt] Suggested prompt generation failed:', err instanceof Error ? err.message : err);
    return undefined;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const {
    spaceId, spaceName, povId, baseImagePath, promptText,
    language, consentGiven, participantName, participantAge,
    participantGender, hasChildren, hasPets, hasRestrictedMobility,
    originalPromptText, promptSource, persist = true,
  } = req.body ?? {};

  // Validate required fields
  if (!spaceId || !spaceName || !povId || !baseImagePath || !promptText) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  let participant: NormalizedParticipantInput;
  try {
    participant = assertConsentForParticipantInfo({
      participantName,
      participantAge,
      participantGender,
      hasChildren,
      hasPets,
      hasRestrictedMobility,
    }, consentGiven);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'participant_info_check';
    return res.status(400).json({ success: false, error: message });
  }

  // Check env vars
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl      = process.env.APP_URL;

  if (!geminiKey || !supabaseUrl || !serviceKey || !appUrl) {
    return res.status(500).json({ success: false, error: 'Server not fully configured (missing env vars)' });
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Step 1: Layer 2 guardrail — Gemini Flash validation ──────────────────
  try {
    const validationResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Space: ${String(spaceId)}\nProposal: "${String(promptText)}"\nIs this proposal appropriate for a Barcelona civic platform?`,
      config: {
        systemInstruction:
          'You are a content moderator for a Barcelona civic platform. ' +
          'Evaluate if the proposal is: (a) safe for all ages, (b) physically plausible in an urban space, ' +
          '(c) non-violent/offensive, (d) relevant to urban planning. ' +
          'Respond with JSON only: {"approved":true/false,"reason":"one sentence"}',
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = validationResponse.text ?? '{}';
    let parsed: { approved?: boolean; reason?: string } = {};
    try { parsed = JSON.parse(text) as { approved?: boolean; reason?: string }; } catch { /* fall through */ }

    if (parsed.approved === false) {
      return res.status(422).json({
        success: false,
        error: 'proposal_rejected',
        reason: parsed.reason ?? 'Your proposal could not be processed. Please try a different description.',
      });
    }
  } catch {
    // If validation itself errors, allow through (fail open — not fail closed)
  }

  // ── Step 2: Fetch base image ──────────────────────────────────────────────
  let base64Image: string;
  let mimeType: string;
  try {
    const imageUrl = encodeURI(`${appUrl}${String(baseImagePath)}`);
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      return res.status(400).json({ success: false, error: `Cannot load base image (${imgResp.status})` });
    }
    const buf = await imgResp.arrayBuffer();
    base64Image = Buffer.from(buf).toString('base64');
    mimeType = String(baseImagePath).endsWith('.png') ? 'image/png' : 'image/jpeg';
  } catch (err) {
    return res.status(500).json({ success: false, error: `Image fetch failed: ${err instanceof Error ? err.message : 'unknown'}` });
  }

  // ── Step 3: Generate image with Gemini 2.5 Flash Image (retry on 429) ────
  let generatedBase64: string;
  let generatedMime: string;
  const MAX_IMAGE_RETRIES = 4;
  // Wait times: 15s, 30s, 45s, 60s — enough for RPM window to reset
  const RETRY_WAIT_SECONDS = [15, 30, 45, 60];
  try {
    const wrappedPrompt = buildWrappedPrompt(String(spaceName), String(povId), String(promptText));

    let lastError: unknown = null;
    let imagePart: { data: string; mimeType?: string } | null = null;

    for (let attempt = 0; attempt < MAX_IMAGE_RETRIES; attempt++) {
      try {
        const genResp = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: [
            { text: wrappedPrompt },
            { inlineData: { mimeType, data: base64Image } },
          ],
        });

        const part = genResp.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (part?.inlineData?.data) {
          imagePart = { data: part.inlineData.data, mimeType: part.inlineData.mimeType };
          break;
        }
        lastError = new Error('Image generation produced no image');
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('429') && !msg.includes('RESOURCE_EXHAUSTED')) throw err;
        const waitSec = RETRY_WAIT_SECONDS[attempt] ?? 60;
        console.warn(`[image] Rate limited (attempt ${attempt + 1}/${MAX_IMAGE_RETRIES}), retrying in ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
    }

    if (!imagePart) {
      return res.status(500).json({ success: false, error: `Image generation failed: ${lastError instanceof Error ? lastError.message : 'unknown'}` });
    }
    generatedBase64 = imagePart.data;
    generatedMime   = imagePart.mimeType ?? 'image/png';
  } catch (err) {
    return res.status(500).json({ success: false, error: `Image generation failed: ${err instanceof Error ? err.message : 'unknown'}` });
  }

  // ── Step 4: Image handling — draft vs. publish ────────────────────────────
  // In draft mode (persist === false) we DON'T touch permanent storage: the
  // image rides along as a data URL and is only uploaded by /publish when the
  // user actually keeps it. This avoids orphaned storage objects every time a
  // user cancels or regenerates. Direct-persist still uploads immediately.
  const proposalId = randomUUID();
  const ext = generatedMime === 'image/png' ? 'png' : 'jpg';
  const fileName = `${proposalId}.${ext}`;
  let generatedImageUrl: string;

  if (persist === false) {
    generatedImageUrl = `data:${generatedMime};base64,${generatedBase64}`;
  } else {
    try {
      const imgBuffer = Buffer.from(generatedBase64, 'base64');
      const { error: uploadErr } = await supabase.storage
        .from('generated-images')
        .upload(fileName, imgBuffer, { contentType: generatedMime, upsert: false });

      if (uploadErr) {
        return res.status(500).json({ success: false, error: `Storage upload failed: ${uploadErr.message}` });
      }

      const { data: urlData } = supabase.storage
        .from('generated-images')
        .getPublicUrl(fileName);

      generatedImageUrl = urlData.publicUrl;
    } catch (err) {
      return res.status(500).json({ success: false, error: `Storage error: ${err instanceof Error ? err.message : 'unknown'}` });
    }
  }

  // ── Step 5: Agent evaluations — RAG backend, with a Gemini fallback panel ────
  const evaluations = await runAgentEvaluations(ai, String(spaceName), String(spaceId), String(promptText), String(language));
  const avgScore = averageScore(evaluations);

  // ── Step 6: Persist to Supabase ───────────────────────────────────────────
  const lang = ['en', 'ca', 'es'].includes(String(language)) ? String(language) : 'en';
  const finalPromptSource: PromptSource = promptSource === 'expert_suggested' ? 'expert_suggested' : 'original';
  const finalOriginalPrompt = String(originalPromptText || promptText);
  // Only offer an expert-suggested improvement on the ORIGINAL generation.
  // A regenerated proposal (already expert-suggested) gets no further suggestion,
  // which caps regeneration at one round and avoids a wasted Gemini call.
  const expertSuggestedPrompt = finalPromptSource === 'original'
    ? await generateSuggestedPrompt({
        ai,
        spaceName: String(spaceName),
        promptText: String(promptText),
        language: lang,
        evaluations,
      })
    : undefined;

  const draft: ProposalResponse = {
    id: proposalId,
    spaceId: String(spaceId),
    povId: String(povId),
    promptText: String(promptText),
    language: lang,
    baseImagePath: String(baseImagePath),
    generatedImageUrl,
    agentFeedback: evaluations,
    avgAgentScore: avgScore,
    communityScore: 0,
    voteCount: 0,
    participantName: optional(participant.participantName),
    participantAge: optional(participant.participantAge),
    participantGender: optional(participant.participantGender),
    hasChildren: optional(participant.hasChildren),
    hasPets: optional(participant.hasPets),
    hasRestrictedMobility: optional(participant.hasRestrictedMobility),
    consentGiven: consentGiven === true,
    status: 'complete',
    createdAt: new Date().toISOString(),
    originalPromptText: finalOriginalPrompt,
    expertSuggestedPrompt,
    promptSource: finalPromptSource,
    isDraft: persist === false,
  };

  if (persist === false) {
    return res.status(200).json({ success: true, data: draft });
  }

  const { data: proposal, error: insertErr } = await supabase
    .from('proposals')
    .insert({
      id:                   proposalId,
      space_id:             String(spaceId),
      pov_id:               String(povId),
      prompt_text:          String(promptText),
      language:             lang,
      base_image_path:      String(baseImagePath),
      generated_image_url:  generatedImageUrl,
      avg_agent_score:      avgScore,
      participant_name:     participant.participantName,
      participant_age:      participant.participantAge,
      participant_gender:   participant.participantGender,
      has_children:         participant.hasChildren,
      has_pets:             participant.hasPets,
      has_restricted_mobility: participant.hasRestrictedMobility,
      consent_given:        consentGiven === true,
      status:               'complete',
      original_prompt_text: finalOriginalPrompt,
      expert_suggested_prompt: expertSuggestedPrompt ?? null,
      prompt_source:        finalPromptSource,
    })
    .select()
    .single();

  if (insertErr || !proposal) {
    return res.status(500).json({ success: false, error: `DB insert failed: ${insertErr?.message ?? 'unknown'}` });
  }

  const { error: evalInsertErr } = await supabase.from('agent_evaluations').insert(
    evaluations.map((e) => ({
      proposal_id: proposalId,
      agent_id:    e.agentId,
      agent_name:  e.name,
      agent_icon:  e.icon,
      score:       e.score,
      feedback:    e.feedback,
      risks:           e.risks,
      recommendations: e.recommendations,
      references:      e.references,
    }))
  );

  if (evalInsertErr) {
    return res.status(500).json({ success: false, error: `Agent evaluation insert failed: ${evalInsertErr.message}` });
  }

  // ── Step 7: Return the full Proposal ─────────────────────────────────────
  return res.status(200).json({
    success: true,
    data: {
      id:                  proposal.id as string,
      spaceId:             proposal.space_id as string,
      povId:               proposal.pov_id as string,
      promptText:          proposal.prompt_text as string,
      language:            proposal.language as string,
      baseImagePath:       proposal.base_image_path as string,
      generatedImageUrl:   proposal.generated_image_url as string,
      agentFeedback:       evaluations,
      avgAgentScore:       avgScore,
      communityScore:      Number(proposal.community_score ?? 0),
      voteCount:           Number(proposal.vote_count ?? 0),
      participantName:     (proposal.participant_name as string | null) ?? undefined,
      participantAge:      (proposal.participant_age as number | null) ?? undefined,
      participantGender:   (proposal.participant_gender as ParticipantGender | null) ?? undefined,
      hasChildren:         (proposal.has_children as boolean | null) ?? undefined,
      hasPets:             (proposal.has_pets as boolean | null) ?? undefined,
      hasRestrictedMobility: (proposal.has_restricted_mobility as boolean | null) ?? undefined,
      consentGiven:        proposal.consent_given as boolean,
      status:              'complete',
      createdAt:           proposal.created_at as string,
      originalPromptText:  (proposal.original_prompt_text as string | null) ?? undefined,
      expertSuggestedPrompt: (proposal.expert_suggested_prompt as string | null) ?? undefined,
      promptSource:        ((proposal.prompt_source as PromptSource | null) ?? 'original'),
    },
  });
}
