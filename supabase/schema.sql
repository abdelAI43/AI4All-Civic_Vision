-- ============================================================
-- Barcelona Civic Vision — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- ── Enable required extensions ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── proposals ─────────────────────────────────────────────────────────────────
create table if not exists proposals (
  id                  uuid primary key default uuid_generate_v4(),
  space_id            text not null,
  pov_id              text not null,
  prompt_text         text not null,
  language            text not null default 'en' check (language in ('en', 'ca', 'es')),
  base_image_path     text not null,
  generated_image_url text not null default '',
  avg_agent_score     numeric(3,2) not null default 0,
  community_score     numeric(3,2) not null default 0,
  vote_count          integer not null default 0,
  participant_name    text,
  participant_age     integer check (participant_age is null or (participant_age >= 1 and participant_age <= 99)),
  participant_gender  text check (participant_gender is null or participant_gender in ('woman', 'man', 'non_binary', 'prefer_not_to_say')),
  has_children        boolean,
  has_pets            boolean,
  has_restricted_mobility boolean,
  consent_given       boolean not null default false,
  status              text not null default 'pending' check (status in ('pending', 'generating', 'complete', 'failed')),
  original_prompt_text text,
  expert_suggested_prompt text,
  prompt_source       text check (prompt_source is null or prompt_source in ('original', 'expert_suggested')),
  created_at          timestamptz not null default now()
);

-- ── agent_evaluations ─────────────────────────────────────────────────────────
create table if not exists agent_evaluations (
  id          uuid primary key default uuid_generate_v4(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  agent_id    text not null,
  agent_name  text not null,
  agent_icon  text not null,
  score       integer not null check (score >= 1 and score <= 5),
  feedback    text not null,
  risks       jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  "references" jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

-- Idempotent migrations for existing projects created from an older schema.
alter table proposals
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

alter table agent_evaluations
  add column if not exists risks jsonb not null default '[]'::jsonb,
  add column if not exists recommendations jsonb not null default '[]'::jsonb,
  add column if not exists "references" jsonb not null default '[]'::jsonb;

create table if not exists proposal_votes (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  voter_session_id uuid not null,
  score integer not null check (score >= 1 and score <= 5),
  created_at timestamptz not null default now(),
  unique (proposal_id, voter_session_id)
);

-- ── indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_proposals_space_id     on proposals(space_id);
create index if not exists idx_proposals_status       on proposals(status);
create index if not exists idx_proposals_created_at   on proposals(created_at desc);
create index if not exists idx_evaluations_proposal   on agent_evaluations(proposal_id);
create index if not exists idx_proposal_votes_proposal_id on proposal_votes(proposal_id);
create index if not exists idx_proposals_vote_balance on proposals(status, consent_given, vote_count, created_at desc);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Public (anon) can read completed proposals only.
-- Writes go through the service role key in serverless functions.

alter table proposals         enable row level security;
alter table agent_evaluations enable row level security;
alter table proposal_votes    enable row level security;

-- Anon: read complete proposals
create policy "public_read_proposals"
  on proposals for select
  using (status = 'complete' and consent_given = true);

-- Anon: read evaluations for complete proposals
create policy "public_read_evaluations"
  on agent_evaluations for select
  using (
    exists (
      select 1 from proposals p
      where p.id = agent_evaluations.proposal_id
        and p.status = 'complete'
        and p.consent_given = true
    )
  );

-- Service role: full access (bypasses RLS automatically — no policy needed)

-- ── Storage bucket for generated images ───────────────────────────────────────
-- Run this AFTER creating the bucket named "generated-images" in Storage UI.
-- Or run it here — Supabase will create it.
insert into storage.buckets (id, name, public)
  values ('generated-images', 'generated-images', true)
  on conflict (id) do nothing;

-- Allow anyone to read generated images (they're public visualizations)
create policy "public_read_generated_images"
  on storage.objects for select
  using (bucket_id = 'generated-images');

-- Only service role can upload (handled server-side)
create policy "service_upload_generated_images"
  on storage.objects for insert
  with check (bucket_id = 'generated-images');

-- ── Heatmap view ──────────────────────────────────────────────────────────────
-- Used by GET /api/proposals/heatmap
create or replace view public.heatmap_data as
  select
    space_id,
    count(*)::integer          as proposal_count,
    round(avg(avg_agent_score)::numeric, 2) as avg_score
  from proposals
  where status = 'complete' and consent_given = true
  group by space_id;

-- Keep cached voting stats on proposals in sync with private proposal_votes rows.
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
      select 1 from public.proposal_votes v
      where v.proposal_id = target_proposal_id
    );

  return null;
end;
$$;

drop trigger if exists trg_refresh_proposal_vote_stats on public.proposal_votes;

create trigger trg_refresh_proposal_vote_stats
after insert or update or delete on public.proposal_votes
for each row execute function public.refresh_proposal_vote_stats();

-- Return least-voted complete public proposals first, excluding proposals this
-- browser session already scored. Once the session has voted on everything, it
-- restarts with all complete proposals in random order so voters never run out.
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

-- ============================================================
-- Done. Next steps:
--   1. Copy Project URL → VITE_SUPABASE_URL in .env
--   2. Copy anon key    → VITE_SUPABASE_ANON_KEY in .env
--   3. Copy service key → SUPABASE_SERVICE_ROLE_KEY in .env
--      (Settings → API → Project API keys)
-- ============================================================
