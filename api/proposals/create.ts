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

async function runAgentEvaluations(
  spaceName: string,
  hotspotId: string,
  promptText: string,
) {
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

    return agents.map((a) => {
      const agent = a as Record<string, unknown>;
      const agentId = String(agent.agentId ?? agent.agent_id ?? '');
      const meta = RAG_AGENT_META[agentId] ?? { name: agentId, icon: '🤖' };
      return {
        agentId,
        name:            String(agent.name            ?? meta.name),
        icon:            String(agent.icon            ?? meta.icon),
        score:           Math.max(1, Math.min(5, Math.round(Number(agent.score) || 3))),
        feedback:        String(agent.feedback        ?? agent.summary ?? 'Evaluation completed.'),
        risks:           Array.isArray(agent.risks)           ? agent.risks as string[]           : [],
        recommendations: Array.isArray(agent.recommendations) ? agent.recommendations as string[] : [],
        references:      Array.isArray(agent.references)      ? agent.references as string[]      : [],
      };
    });
  } catch (err) {
    console.error('[agents] RAG backend call failed:', err instanceof Error ? err.message : err);
    // Fallback: neutral scores so the rest of the pipeline can complete
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
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const {
    spaceId, spaceName, povId, baseImagePath, promptText,
    language, consentGiven, participantName, participantAge,
  } = req.body ?? {};

  // Validate required fields
  if (!spaceId || !spaceName || !povId || !baseImagePath || !promptText) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  if (!consentGiven) {
    return res.status(400).json({ success: false, error: 'consent_given is required' });
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

  // ── Step 4: Upload image to Supabase Storage ──────────────────────────────
  const proposalId = randomUUID();
  const ext = generatedMime === 'image/png' ? 'png' : 'jpg';
  const fileName = `${proposalId}.${ext}`;
  let generatedImageUrl: string;

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

  // ── Step 5: RAG backend agent evaluations (5 agents via Render) ─────────────
  const evaluations = await runAgentEvaluations(String(spaceName), String(spaceId), String(promptText));
  const avgScore = parseFloat(
    (evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length).toFixed(2)
  );

  // ── Step 6: Persist to Supabase ───────────────────────────────────────────
  const lang = ['en', 'ca', 'es'].includes(String(language)) ? String(language) : 'en';
  const age  = participantAge ? parseInt(String(participantAge), 10) : null;

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
      participant_name:     participantName ? String(participantName) : null,
      participant_age:      age && !isNaN(age) ? age : null,
      consent_given:        true,
      status:               'complete',
    })
    .select()
    .single();

  if (insertErr || !proposal) {
    return res.status(500).json({ success: false, error: `DB insert failed: ${insertErr?.message ?? 'unknown'}` });
  }

  // Insert agent evaluations (non-fatal if this fails)
  await supabase.from('agent_evaluations').insert(
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
      participantName:     (proposal.participant_name as string | null) ?? undefined,
      participantAge:      (proposal.participant_age as number | null) ?? undefined,
      consentGiven:        true,
      status:              'complete',
      createdAt:           proposal.created_at as string,
    },
  });
}
