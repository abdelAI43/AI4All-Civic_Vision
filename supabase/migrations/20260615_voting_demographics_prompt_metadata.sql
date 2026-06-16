-- Adds community voting, richer participant demographics, agent metadata,
-- and prompt regeneration metadata to an existing Barcelona Civic Vision DB.

alter table public.agent_evaluations
  add column if not exists risks jsonb not null default '[]'::jsonb,
  add column if not exists recommendations jsonb not null default '[]'::jsonb,
  add column if not exists references jsonb not null default '[]'::jsonb;

alter table public.proposals
  add column if not exists community_score numeric(3,2) not null default 0,
  add column if not exists vote_count integer not null default 0,
  add column if not exists participant_gender text,
  add column if not exists has_children boolean,
  add column if not exists has_pets boolean,
  add column if not exists has_restricted_mobility boolean,
  add column if not exists original_prompt_text text,
  add column if not exists expert_suggested_prompt text,
  add column if not exists prompt_source text;

alter table public.proposals
  drop constraint if exists proposals_participant_age_check;

alter table public.proposals
  add constraint proposals_participant_age_check
  check (participant_age is null or (participant_age >= 1 and participant_age <= 99));

do $$
begin
  alter table public.proposals
    add constraint proposals_participant_gender_check
    check (
      participant_gender is null or
      participant_gender in ('woman', 'man', 'non_binary', 'prefer_not_to_say')
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.proposals
    add constraint proposals_prompt_source_check
    check (prompt_source is null or prompt_source in ('original', 'expert_suggested'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.proposal_votes (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  voter_session_id uuid not null,
  score integer not null check (score >= 1 and score <= 5),
  created_at timestamptz not null default now(),
  unique (proposal_id, voter_session_id)
);

create index if not exists idx_proposal_votes_proposal_id
  on public.proposal_votes(proposal_id);

create index if not exists idx_proposals_vote_balance
  on public.proposals(status, consent_given, vote_count, created_at desc);

alter table public.proposal_votes enable row level security;

create or replace function public.refresh_proposal_vote_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_proposal_id uuid;
begin
  target_proposal_id := coalesce(new.proposal_id, old.proposal_id);

  update public.proposals p
  set
    vote_count = stats.vote_count,
    community_score = stats.community_score
  from (
    select
      proposal_id,
      count(*)::integer as vote_count,
      round(avg(score)::numeric, 2) as community_score
    from public.proposal_votes
    where proposal_id = target_proposal_id
    group by proposal_id
  ) stats
  where p.id = stats.proposal_id;

  update public.proposals
  set vote_count = 0, community_score = 0
  where id = target_proposal_id
    and not exists (
      select 1
      from public.proposal_votes v
      where v.proposal_id = target_proposal_id
    );

  return null;
end;
$$;

drop trigger if exists trg_refresh_proposal_vote_stats on public.proposal_votes;

create trigger trg_refresh_proposal_vote_stats
after insert or update or delete on public.proposal_votes
for each row execute function public.refresh_proposal_vote_stats();

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
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.space_id,
    p.pov_id,
    p.prompt_text,
    p.generated_image_url,
    p.base_image_path,
    p.avg_agent_score,
    p.community_score,
    p.vote_count,
    p.created_at
  from public.proposals p
  where p.status = 'complete'
    and p.consent_given = true
    and not exists (
      select 1
      from public.proposal_votes v
      where v.proposal_id = p.id
        and v.voter_session_id = p_voter_session_id
    )
  order by p.vote_count asc, random()
  limit greatest(1, least(p_limit, 10));
$$;
