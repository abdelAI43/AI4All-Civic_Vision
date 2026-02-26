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

// ── Specialist AI agents — Gemini Flash parallel evaluation ──────────────────
const DISCLAIMER = ' (This is an AI simulation — not a certified expert assessment.)';

const AGENTS = [
  {
    agentId: 'budget',
    name: 'Budget Analyst',
    icon: '💰',
    systemPrompt:
      'You are a municipal budget analyst for Barcelona City Council. ' +
      'Evaluate civic proposals for financial feasibility. Consider: typical implementation ' +
      'costs for Barcelona, available EU and municipal funding streams, annual maintenance costs, ' +
      'and cost-benefit ratio over a 10-year horizon. ' +
      'Score 1–5: 1 = extremely costly or financially unfeasible, 5 = excellent value for public money.',
  },
  {
    agentId: 'heritage',
    name: 'Heritage Expert',
    icon: '🏛️',
    systemPrompt:
      'You are a heritage conservation specialist for Barcelona City Council, with deep knowledge ' +
      'of Catalan Modernisme, the Gothic Quarter, and UNESCO World Heritage obligations. ' +
      'Evaluate civic proposals for compatibility with Barcelona\'s cultural and architectural heritage. ' +
      'Score 1–5: 1 = serious heritage risk, 5 = fully compatible or actively enhances heritage character.',
  },
  {
    agentId: 'safety',
    name: 'Safety Officer',
    icon: '🛡️',
    systemPrompt:
      'You are a public safety officer and urban engineer for Barcelona City Council. ' +
      'Evaluate civic proposals for safety implications: pedestrian flow, emergency vehicle access, ' +
      'structural integrity, lighting, accessibility for people with disabilities, and EU safety standards. ' +
      'Score 1–5: 1 = serious safety concerns requiring major redesign, 5 = excellent safety outcome.',
  },
  {
    agentId: 'sociologist',
    name: 'Urban Sociologist',
    icon: '👥',
    systemPrompt:
      'You are an urban sociologist specialising in Barcelona\'s communities and public space usage. ' +
      'Evaluate civic proposals for social impact: inclusivity, benefit to different demographics ' +
      '(elderly, children, tourists, long-term residents), effect on livelihoods, and contribution to ' +
      'social cohesion and community identity. ' +
      'Score 1–5: 1 = negative or exclusionary social impact, 5 = outstanding inclusive community benefit.',
  },
  {
    agentId: 'regulations',
    name: 'Regulations Dept',
    icon: '📋',
    systemPrompt:
      'You are a municipal regulations officer for Barcelona, expert in urban planning law, ' +
      'the Ordenança del Paisatge Urbà, environmental impact requirements, and licencing timelines. ' +
      'Evaluate civic proposals for their regulatory and permitting feasibility in Barcelona. ' +
      'Score 1–5: 1 = major legal barriers or multi-year approval process, 5 = straightforward to approve.',
  },
];

async function runAgentEvaluations(
  spaceName: string,
  promptText: string,
  ai: GoogleGenAI,
) {
  return Promise.all(
    AGENTS.map(async (agent) => {
      try {
        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents:
            `Space: ${spaceName}, Barcelona\nCivic proposal: "${promptText}"\n\n` +
            `Evaluate this proposal from your specialist perspective.`,
          config: {
            systemInstruction:
              agent.systemPrompt +
              '\n\nRespond with JSON only — no markdown: ' +
              '{"score": <integer 1-5>, "feedback": "<2-3 concise sentences>"}',
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        });

        let parsed: { score?: unknown; feedback?: unknown } = {};
        try { parsed = JSON.parse(resp.text ?? '{}') as typeof parsed; } catch { /* fall through */ }

        const score = Math.max(1, Math.min(5, Math.round(Number(parsed.score) || 3)));
        const feedback = String(parsed.feedback || 'Evaluation completed.') + DISCLAIMER;

        return { agentId: agent.agentId, name: agent.name, icon: agent.icon, score, feedback };
      } catch {
        // If one agent fails, return a neutral score so the pipeline can continue
        return {
          agentId: agent.agentId,
          name: agent.name,
          icon: agent.icon,
          score: 3,
          feedback: 'Evaluation could not be completed at this time.' + DISCLAIMER,
        };
      }
    })
  );
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

  // ── Step 3: Generate image with Gemini 2.5 Flash Image ───────────────────
  let generatedBase64: string;
  let generatedMime: string;
  try {
    const wrappedPrompt = buildWrappedPrompt(String(spaceName), String(povId), String(promptText));
    const genResp = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: [
        { text: wrappedPrompt },
        { inlineData: { mimeType, data: base64Image } },
      ]}],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
    });

    const part = genResp.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      return res.status(500).json({ success: false, error: 'Image generation produced no image' });
    }
    generatedBase64 = part.inlineData.data;
    generatedMime   = part.inlineData.mimeType ?? 'image/png';
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

  // ── Step 5: Specialist agent evaluations (5 Gemini Flash calls in parallel) ─
  const evaluations = await runAgentEvaluations(String(spaceName), String(promptText), ai);
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
