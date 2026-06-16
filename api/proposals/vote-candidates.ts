import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../_types';

type CandidateRow = {
  id: string;
  space_id: string;
  pov_id: string;
  prompt_text: string;
  generated_image_url: string;
  base_image_path: string;
  avg_agent_score: number;
  community_score: number;
  vote_count: number;
  created_at: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { sessionId, limit } = req.body ?? {};
  if (!isUuid(sessionId)) {
    return res.status(400).json({ success: false, error: 'Valid sessionId is required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ success: false, error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const cappedLimit = Math.max(1, Math.min(Number(limit ?? 3) || 3, 10));

  const { data, error } = await supabase.rpc('get_vote_candidates', {
    p_voter_session_id: sessionId,
    p_limit: cappedLimit,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const rows = (data ?? []) as CandidateRow[];
  const ids = rows.map((row) => row.id);
  let evaluationsByProposal = new Map<string, Array<Record<string, unknown>>>();

  if (ids.length > 0) {
    const { data: evals, error: evalErr } = await supabase
      .from('agent_evaluations')
      .select('proposal_id, agent_id, agent_name, agent_icon, score, feedback')
      .in('proposal_id', ids);

    if (evalErr) {
      return res.status(500).json({ success: false, error: evalErr.message });
    }

    evaluationsByProposal = (evals ?? []).reduce((map, item) => {
      const proposalId = item.proposal_id as string;
      const existing = map.get(proposalId) ?? [];
      existing.push(item as Record<string, unknown>);
      map.set(proposalId, existing);
      return map;
    }, new Map<string, Array<Record<string, unknown>>>());
  }

  return res.status(200).json({
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      spaceId: row.space_id,
      povId: row.pov_id,
      promptText: row.prompt_text,
      language: 'en',
      baseImagePath: row.base_image_path,
      generatedImageUrl: row.generated_image_url,
      avgAgentScore: Number(row.avg_agent_score ?? 0),
      communityScore: Number(row.community_score ?? 0),
      voteCount: Number(row.vote_count ?? 0),
      consentGiven: true,
      status: 'complete',
      createdAt: row.created_at,
      agentFeedback: (evaluationsByProposal.get(row.id) ?? []).map((agent) => ({
        agentId: agent.agent_id as string,
        name: agent.agent_name as string,
        icon: agent.agent_icon as string,
        score: Number(agent.score ?? 3),
        feedback: String(agent.feedback ?? ''),
      })),
    })),
  });
}
