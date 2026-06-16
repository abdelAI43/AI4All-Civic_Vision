import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../_types';

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { sessionId, proposalId, score } = req.body ?? {};
  const numericScore = Number(score);

  if (!isUuid(sessionId) || !isUuid(proposalId) || !Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
    return res.status(400).json({ success: false, error: 'Valid sessionId, proposalId, and score 1-5 are required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ success: false, error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  // Upsert so a returning voter can re-score on a second lap (once every proposal
  // has been voted on) instead of hitting the unique constraint. The vote-stats
  // trigger recomputes community_score on both insert and update.
  const { error: upsertErr } = await supabase
    .from('proposal_votes')
    .upsert(
      { proposal_id: proposalId, voter_session_id: sessionId, score: numericScore },
      { onConflict: 'proposal_id,voter_session_id' },
    );

  if (upsertErr) {
    return res.status(500).json({ success: false, error: upsertErr.message });
  }

  const { data: proposal, error: proposalErr } = await supabase
    .from('proposals')
    .select('community_score, vote_count')
    .eq('id', proposalId)
    .single();

  if (proposalErr) {
    return res.status(500).json({ success: false, error: proposalErr.message });
  }

  return res.status(200).json({
    success: true,
    data: {
      proposalId,
      communityScore: Number(proposal.community_score ?? 0),
      voteCount: Number(proposal.vote_count ?? 0),
    },
  });
}
