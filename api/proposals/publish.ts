import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../_types';
import {
  assertConsentForParticipantInfo,
  type NormalizedParticipantInput,
  type ParticipantGender,
  type PromptSource,
} from '../_proposalUtils';

type DraftAgent = {
  agentId: string;
  name: string;
  icon: string;
  score: number;
  feedback: string;
  risks?: string[];
  recommendations?: string[];
  references?: string[];
};

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const draft = req.body?.proposal && typeof req.body.proposal === 'object'
    ? req.body.proposal as Record<string, unknown>
    : req.body ?? {};

  const id = requiredString(draft.id);
  const spaceId = requiredString(draft.spaceId);
  const povId = requiredString(draft.povId);
  const promptText = requiredString(draft.promptText);
  const language = ['en', 'ca', 'es'].includes(String(draft.language)) ? String(draft.language) : 'en';
  const baseImagePath = requiredString(draft.baseImagePath);
  const generatedImageUrl = requiredString(draft.generatedImageUrl);

  if (!id || !spaceId || !povId || !promptText || !baseImagePath || !generatedImageUrl) {
    return res.status(400).json({ success: false, error: 'Missing required proposal draft fields' });
  }

  let participant: NormalizedParticipantInput;
  try {
    participant = assertConsentForParticipantInfo({
      participantName: draft.participantName,
      participantAge: draft.participantAge === undefined ? undefined : String(draft.participantAge),
      participantGender: draft.participantGender,
      hasChildren: draft.hasChildren,
      hasPets: draft.hasPets,
      hasRestrictedMobility: draft.hasRestrictedMobility,
    }, draft.consentGiven);
  } catch (err) {
    return res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'participant_info_check' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ success: false, error: 'Supabase not configured' });
  }

  const agents = Array.isArray(draft.agentFeedback) ? draft.agentFeedback as DraftAgent[] : [];
  if (agents.length === 0) {
    return res.status(400).json({ success: false, error: 'Draft has no agent feedback' });
  }

  const avgAgentScore = Number(draft.avgAgentScore ?? 0);
  const promptSource: PromptSource = draft.promptSource === 'expert_suggested' ? 'expert_suggested' : 'original';
  const supabase = createClient(supabaseUrl, serviceKey);

  // Draft images arrive as a data URL (see /create draft mode). Upload to
  // permanent storage now — this is the first and only time the image is
  // persisted, so cancelled/regenerated drafts never leave orphans behind.
  let finalImageUrl = generatedImageUrl;
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(generatedImageUrl);
  if (dataUrlMatch) {
    const [, mime, base64] = dataUrlMatch;
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const fileName = `${id}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('generated-images')
      .upload(fileName, Buffer.from(base64, 'base64'), { contentType: mime, upsert: true });
    if (uploadErr) {
      return res.status(500).json({ success: false, error: `Storage upload failed: ${uploadErr.message}` });
    }
    finalImageUrl = supabase.storage.from('generated-images').getPublicUrl(fileName).data.publicUrl;
  }

  const { data: proposal, error: insertErr } = await supabase
    .from('proposals')
    .insert({
      id,
      space_id: spaceId,
      pov_id: povId,
      prompt_text: promptText,
      language,
      base_image_path: baseImagePath,
      generated_image_url: finalImageUrl,
      avg_agent_score: avgAgentScore,
      participant_name: participant.participantName,
      participant_age: participant.participantAge,
      participant_gender: participant.participantGender,
      has_children: participant.hasChildren,
      has_pets: participant.hasPets,
      has_restricted_mobility: participant.hasRestrictedMobility,
      consent_given: draft.consentGiven === true,
      status: 'complete',
      original_prompt_text: requiredString(draft.originalPromptText) ?? promptText,
      expert_suggested_prompt: requiredString(draft.expertSuggestedPrompt),
      prompt_source: promptSource,
    })
    .select()
    .single();

  if (insertErr || !proposal) {
    return res.status(500).json({ success: false, error: `DB insert failed: ${insertErr?.message ?? 'unknown'}` });
  }

  const { error: evalInsertErr } = await supabase.from('agent_evaluations').insert(
    agents.map((agent) => ({
      proposal_id: id,
      agent_id: agent.agentId,
      agent_name: agent.name,
      agent_icon: agent.icon,
      score: Math.max(1, Math.min(5, Math.round(Number(agent.score) || 3))),
      feedback: agent.feedback,
      risks: Array.isArray(agent.risks) ? agent.risks : [],
      recommendations: Array.isArray(agent.recommendations) ? agent.recommendations : [],
      references: Array.isArray(agent.references) ? agent.references : [],
    })),
  );

  if (evalInsertErr) {
    return res.status(500).json({ success: false, error: `Agent evaluation insert failed: ${evalInsertErr.message}` });
  }

  return res.status(200).json({
    success: true,
    data: {
      ...draft,
      isDraft: false,
      generatedImageUrl: finalImageUrl,
      communityScore: Number(proposal.community_score ?? 0),
      voteCount: Number(proposal.vote_count ?? 0),
      createdAt: proposal.created_at as string,
      participantGender: (proposal.participant_gender as ParticipantGender | null) ?? undefined,
    },
  });
}
