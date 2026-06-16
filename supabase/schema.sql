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
  participant_name    text,
  participant_age     integer check (participant_age is null or (participant_age >= 5 and participant_age <= 120)),
  consent_given       boolean not null default false,
  status              text not null default 'pending' check (status in ('pending', 'generating', 'complete', 'failed')),
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
  created_at  timestamptz not null default now()
);

-- ── indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_proposals_space_id     on proposals(space_id);
create index if not exists idx_proposals_status       on proposals(status);
create index if not exists idx_proposals_created_at   on proposals(created_at desc);
create index if not exists idx_evaluations_proposal   on agent_evaluations(proposal_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Public (anon) can read completed proposals only.
-- Writes go through the service role key in serverless functions.

alter table proposals         enable row level security;
alter table agent_evaluations enable row level security;

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

-- ============================================================
-- Done. Next steps:
--   1. Copy Project URL → VITE_SUPABASE_URL in .env
--   2. Copy anon key    → VITE_SUPABASE_ANON_KEY in .env
--   3. Copy service key → SUPABASE_SERVICE_ROLE_KEY in .env
--      (Settings → API → Project API keys)
-- ============================================================
