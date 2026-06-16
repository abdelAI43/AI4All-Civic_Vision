-- Voting improvements:
--   1. get_vote_candidates restarts (random order) once a session has voted on
--      every complete proposal, so voters never run out.
--   2. (Application side) /api/proposals/vote now upserts, letting a returning
--      voter re-score on the second lap instead of hitting the unique constraint.
--      No schema change needed for that — the unique(proposal_id, voter_session_id)
--      constraint already supports ON CONFLICT.

create or replace function public.get_vote_candidates(
  p_voter_session_id uuid,
  p_limit integer default 3
)
returns table (
  id uuid,
  space_id text,
  pov_id text,
  prompt_text text,
  generated_image_url text,
  base_image_path text,
  avg_agent_score numeric,
  community_score numeric,
  vote_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(p_limit, 10));
begin
  -- First lap: proposals this session has NOT voted on yet, least-voted first.
  return query
    select p.id, p.space_id, p.pov_id, p.prompt_text, p.generated_image_url,
           p.base_image_path, p.avg_agent_score, p.community_score, p.vote_count, p.created_at
    from public.proposals p
    where p.status = 'complete'
      and p.consent_given = true
      and not exists (
        select 1 from public.proposal_votes v
        where v.proposal_id = p.id
          and v.voter_session_id = p_voter_session_id
      )
    order by p.vote_count asc, random()
    limit v_limit;

  if found then
    return;
  end if;

  -- Second lap: this session has voted on everything — restart with all complete
  -- proposals in random order so voting can keep going.
  return query
    select p.id, p.space_id, p.pov_id, p.prompt_text, p.generated_image_url,
           p.base_image_path, p.avg_agent_score, p.community_score, p.vote_count, p.created_at
    from public.proposals p
    where p.status = 'complete'
      and p.consent_given = true
    order by random()
    limit v_limit;
end;
$$;
