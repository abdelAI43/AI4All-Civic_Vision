# Barcelona Civic Vision Implementation Report

Date: 2026-06-15

This document explains the platform changes implemented in the latest local work session. It covers the new features, fixes, database changes, new files, modified files, and verification results.

## High-Level Summary

The platform was updated to support four main improvements:

1. Waiting-time community voting while a new proposal is being generated.
2. Draft-based generation and expert-suggested regeneration.
3. Richer participant demographic collection with consent validation.
4. Stability and UX fixes around voice, transcripts, results scrolling, browse overlays, and Supabase schema compatibility.

The biggest workflow change is that proposal generation now creates a temporary draft first. The draft is only saved to Supabase when the user exits the final results screen back to the map or starts over. If the user regenerates using the expert-suggested prompt, the previous draft is replaced instead of being saved publicly.

## New Features

### 1. Waiting-Time Community Voting UI

While a visitor waits for image generation and expert feedback, the app now shows a voting panel instead of the old carousel.

The approved layout was implemented:

- Large before/after image comparison on the left.
- A full-width voting band below the image.
- Five large star buttons for scoring from 1 to 5.
- A small Skip button to move to the next proposal.
- Proposal summary, expert score, and radar chart on the right.
- No detailed agent feedback is shown during voting, so voters are not biased by individual expert comments.

Relevant files:

- `src/components/flow/GenerationVotingPanel.tsx`
- `src/components/flow/GeneratingScreen.tsx`
- `src/styles/flow.css`
- `src/services/proposals.ts`

### 2. Balanced Voting Candidate System

The voting system tries to avoid over-voting the same proposal repeatedly. It fetches least-voted complete proposals first and randomizes ties.

Behavior:

- Each browser gets an anonymous `voterSessionId` stored in `localStorage`.
- The API excludes proposals already voted on by that browser session.
- Candidates are ordered by lowest `vote_count` first.
- Ties are randomized.
- After Vote or Skip, the UI immediately loads the next candidate.

Relevant files:

- `src/services/proposals.ts`
- `api/proposals/vote-candidates.ts`
- `api/proposals/vote.ts`
- `supabase/schema.sql`
- `supabase/migrations/20260615_voting_demographics_prompt_metadata.sql`

### 3. Community Score Display

Community voting results are now shown when browsing existing proposals.

Added to:

- Browse proposal cards.
- Proposal detail overlay.

Displayed values:

- `Community: no votes yet` when there are no votes.
- Average community score and vote count after votes exist.

Demographic fields are not displayed publicly.

Relevant files:

- `src/components/proposal/ProposalListPanel.tsx`
- `src/components/proposal/ProposalPanel.tsx`
- `src/components/proposal/ProposalPanel.css`

### 4. Draft and Publish Generation Flow

Generation now supports draft behavior.

Old behavior:

- `/api/proposals/create` generated the proposal and immediately saved it to Supabase.

New behavior:

- `/api/proposals/create` can run with `persist: false`.
- In that mode, it generates image and expert feedback but returns a draft object instead of saving a public proposal row.
- `ResultsView` publishes the draft only when the user leaves Step 6.
- If the user regenerates, the current draft is discarded and replaced by the regenerated version.

This means:

- Cancelling before results saves nothing.
- Regenerating does not create duplicate public proposals.
- Only the final visible version is published.

Relevant files:

- `api/proposals/create.ts`
- `api/proposals/publish.ts`
- `src/components/flow/GeneratingScreen.tsx`
- `src/components/flow/ResultsView.tsx`
- `src/services/proposals.ts`

### 5. Expert-Suggested Prompt Improvement

After image generation and RAG agent evaluation, Gemini now creates an improved prompt suggestion based on:

- The user's original prompt.
- The proposal location.
- The RAG agent scores and feedback.
- Risks and recommendations when available.

The Step 6 results screen now shows:

- `Experts' suggested improvement`
- Suggested improved prompt text.
- `Regenerate` button.

Clicking Regenerate:

- Stores the first user prompt as `originalPromptText`.
- Replaces `promptText` with the expert-suggested prompt.
- Restarts generation.
- Does not publish the previous draft.

Relevant files:

- `api/proposals/create.ts`
- `api/generate/suggest-prompt.ts`
- `src/components/flow/ResultsView.tsx`
- `src/types/index.ts`
- `src/store/useAppStore.ts`

### 6. Richer Participant Demographics

The Review step now asks optional participant questions:

- Name.
- Age.
- Gender:
  - Woman.
  - Man.
  - Non-binary.
  - Prefer not to say.
- Has children:
  - Yes.
  - No.
- Has pets:
  - Yes.
  - No.
- Uses a wheelchair or has restricted mobility:
  - Yes.
  - No.

Consent behavior:

- If the visitor answers any profile field, consent is required.
- A `No` answer counts as an answered field.
- `Prefer not to say` counts as an answered field.
- Empty fields do not require consent.

Privacy behavior:

- Demographic values are saved for future analysis.
- Demographic values are not displayed in browse cards or proposal detail.

Relevant files:

- `src/components/flow/ConfirmStep.tsx`
- `src/components/flow/SuggestFlow.tsx`
- `src/store/useAppStore.ts`
- `src/types/index.ts`
- `api/_proposalUtils.ts`
- `api/proposals/create.ts`
- `api/proposals/publish.ts`
- `src/locales/en.json`
- `src/locales/ca.json`
- `src/locales/es.json`

## Supabase Database Changes

Two SQL files were updated or added:

- `supabase/schema.sql`
- `supabase/migrations/20260615_voting_demographics_prompt_metadata.sql`

The migration file is the one to paste into Supabase SQL Editor for the existing live database.

### Agent Evaluation Columns

Added missing JSON fields to `agent_evaluations`:

```sql
risks jsonb not null default '[]'::jsonb
recommendations jsonb not null default '[]'::jsonb
references jsonb not null default '[]'::jsonb
```

These fields support richer RAG output without causing insert failures when the API stores agent metadata.

### Proposal Community Vote Columns

Added to `proposals`:

```sql
community_score numeric(3,2) not null default 0
vote_count integer not null default 0
```

These are cached summary fields updated automatically by a trigger.

### Proposal Demographic Columns

Added to `proposals`:

```sql
participant_gender text
has_children boolean
has_pets boolean
has_restricted_mobility boolean
```

Gender values are constrained to:

```sql
'woman'
'man'
'non_binary'
'prefer_not_to_say'
```

Participant age is constrained to 1 through 99.

### Prompt Metadata Columns

Added to `proposals`:

```sql
original_prompt_text text
expert_suggested_prompt text
prompt_source text
```

`prompt_source` is constrained to:

```sql
'original'
'expert_suggested'
```

These fields let the app remember whether the final saved proposal came from the user's original text or from an expert-suggested regenerated prompt.

### New `proposal_votes` Table

Added a new table:

```sql
proposal_votes
```

Important columns:

- `proposal_id`
- `voter_session_id`
- `score`
- `created_at`

Important constraint:

```sql
unique (proposal_id, voter_session_id)
```

This prevents the same browser session from voting twice on the same proposal.

### Vote Stats Trigger

Added trigger function:

```sql
public.refresh_proposal_vote_stats()
```

Added trigger:

```sql
trg_refresh_proposal_vote_stats
```

Whenever a row is inserted, updated, or deleted in `proposal_votes`, the trigger refreshes:

- `proposals.community_score`
- `proposals.vote_count`

### Vote Candidate RPC

Added function:

```sql
public.get_vote_candidates(p_voter_session_id uuid, p_limit integer default 3)
```

It returns complete public proposals that the current browser session has not voted on yet, ordered by:

1. Lowest `vote_count`.
2. Random tie-breaking.

## API Changes

### Updated `POST /api/proposals/create`

File:

- `api/proposals/create.ts`

Main changes:

- Accepts demographic fields.
- Validates consent server-side.
- Accepts prompt metadata.
- Supports `persist: false` draft generation.
- Generates expert-suggested prompt text using Gemini.
- Returns richer proposal objects with:
  - `communityScore`
  - `voteCount`
  - demographic metadata
  - prompt metadata
  - `isDraft`
- Stores new agent fields:
  - `risks`
  - `recommendations`
  - `references`
- Returns an error if agent evaluation insert fails instead of silently ignoring it.

### New `POST /api/proposals/publish`

File:

- `api/proposals/publish.ts`

Purpose:

- Takes a draft proposal returned by generation.
- Inserts it into `proposals`.
- Inserts its `agent_evaluations`.
- Returns the published proposal with `isDraft: false`.

Used by:

- `ResultsView` when the user leaves Step 6.

### New `POST /api/proposals/vote-candidates`

File:

- `api/proposals/vote-candidates.ts`

Purpose:

- Gets balanced vote candidates for the current browser session.
- Calls Supabase RPC `get_vote_candidates`.
- Fetches agent evaluations for those proposals.
- Returns proposals in frontend `Proposal` shape.

### New `POST /api/proposals/vote`

File:

- `api/proposals/vote.ts`

Purpose:

- Records one vote per proposal per browser session.
- Validates UUIDs and score range.
- Returns updated community score and vote count.

Duplicate vote behavior:

- Duplicate `(proposal_id, voter_session_id)` returns `409 already_voted`.

### New `POST /api/generate/suggest-prompt`

File:

- `api/generate/suggest-prompt.ts`

Purpose:

- Standalone Gemini endpoint for improving a prompt using agent outputs.
- The main generation endpoint also performs this work internally.

### Updated Local API Server

File:

- `scripts/api-server.ts`

New local routes added:

- `/api/proposals/publish`
- `/api/proposals/vote-candidates`
- `/api/proposals/vote`
- `/api/generate/suggest-prompt`

## Frontend Changes

### App Shell

File:

- `src/App.tsx`

Change:

- The Suggest FAB is hidden while browse list or proposal detail overlays are open.

Why:

- Prevents UI conflict where the Suggest button floated above browse/detail overlays.

### Suggest Flow

File:

- `src/components/flow/SuggestFlow.tsx`

Changes:

- Added voice opt-in toggle.
- Improved Step 4 validation.
- Consent is required for any answered profile field.
- `No` demographic answers count as answered.
- Step 6 is now owned by `ResultsView`, so publishing can happen before leaving the flow.
- Stores original prompt before generation starts.

### Review Step

File:

- `src/components/flow/ConfirmStep.tsx`

Changes:

- Added gender select.
- Added Yes/No controls for children.
- Added Yes/No controls for pets.
- Added Yes/No controls for restricted mobility.
- Improved age validation.
- Fixed corrupted summary separator and quote characters.
- Shows consent block when any personal or demographic field is answered.

### Generating Screen

File:

- `src/components/flow/GeneratingScreen.tsx`

Changes:

- Sends `persist: false` to create draft proposals.
- Sends demographic fields.
- Sends prompt metadata.
- Shows `GenerationVotingPanel` during generation.
- Keeps generation progress visible.

### Results View

File:

- `src/components/flow/ResultsView.tsx`

Changes:

- Publishes draft when closing or starting over.
- Shows expert-suggested prompt panel.
- Adds Regenerate button.
- Regenerate restarts generation with the expert-suggested prompt.
- Keeps previous draft unpublished when regenerating.
- Shows publish errors if saving fails.

### Browse Proposal List

File:

- `src/components/proposal/ProposalListPanel.tsx`

Changes:

- Maps `community_score` and `vote_count`.
- Shows community score in cards.
- Keeps demographic fields private.
- Uses a legacy-compatible nested select for agent evaluations, so browse still works before the live Supabase migration is applied.

### Proposal Detail

Files:

- `src/components/proposal/ProposalPanel.tsx`
- `src/components/proposal/ProposalPanel.css`

Changes:

- Shows Community score and vote count.
- Keeps demographic fields hidden.

### Global Flow Styles

File:

- `src/styles/flow.css`

Changes:

- Added styles for:
  - voting panel
  - voting image layout
  - full-width voting band
  - star buttons
  - demographic fields
  - voice toggle
  - results suggested prompt panel
  - results scroll behavior
  - responsive voting layout

## Voice and Transcript Fixes

### Manual Voice Opt-In

Files:

- `src/store/useVoiceStore.ts`
- `src/hooks/useVoiceFlow.ts`
- `src/components/flow/SuggestFlow.tsx`

Changes:

- Added `isEnabled` voice state.
- Voice is off by default.
- Voice flow does not start just because the suggest modal opened.
- The user must click the Voice toggle first.
- Voice turns off when leaving suggest mode.

### Transcript Sanitizer

File:

- `src/services/voice/transcriptSanitizer.ts`

Purpose:

- Removes SRT/WebVTT timestamp lines.
- Removes timestamp-only transcripts.
- Rejects low-signal transcript junk.

Used by:

- `src/hooks/useVoiceFlow.ts`

Why:

- Prevents timestamp strings from entering the user prompt.

### Mic and Audio Cancellation

Files:

- `src/services/voice/audioRecorder.ts`
- `src/services/voice/audioPlayer.ts`

Changes:

- `recordAudioOnce` now exits cleanly if the abort signal is already active.
- If abort happens after microphone permission but before recording starts, tracks are stopped.
- Audio playback cancellation now resolves pending promises so the voice flow does not hang.
- Audio stop logic is idempotent to avoid double resolve issues.

## Type and Store Changes

### Types

File:

- `src/types/index.ts`

Added:

- `ParticipantGender`
- `PromptSource`
- `communityScore`
- `voteCount`
- demographic proposal fields
- prompt metadata fields
- `isDraft`
- new suggest flow fields and setters

### App Store

File:

- `src/store/useAppStore.ts`

Added state:

- `originalPromptText`
- `participantGender`
- `hasChildren`
- `hasPets`
- `hasRestrictedMobility`

Added setters for each new field.

### Voice Store

File:

- `src/store/useVoiceStore.ts`

Added:

- `isEnabled`
- `setEnabled`

## Locales Updated

Files:

- `src/locales/en.json`
- `src/locales/ca.json`
- `src/locales/es.json`

Change:

- Updated privacy note to explain that optional profile answers are stored for future analysis and are not displayed publicly.

## Lint Configuration

File:

- `eslint.config.js`

Changes:

- Ignores generated/local folders:
  - `dist`
  - `.claude/worktrees/**`
  - `.playwright-cli/**`

Why:

- Prevents lint from checking generated agent worktrees and browser QA artifacts.

## Tests Added

### Participant and Consent Tests

File:

- `tests/proposalUtils.test.ts`

Covers:

- Any answered optional demographic field requires consent.
- Empty fields remain unanswered instead of becoming `false`.
- Age only accepts whole numbers from 1 to 99.

### Transcript Sanitizer Tests

File:

- `tests/transcriptSanitizer.test.ts`

Covers:

- SRT/WebVTT timestamp removal.
- Timestamp-only transcript rejection.
- Low-signal caption rejection.

## New Files Created

### API and Backend Helpers

- `api/_proposalUtils.ts`
- `api/generate/suggest-prompt.ts`
- `api/proposals/publish.ts`
- `api/proposals/vote-candidates.ts`
- `api/proposals/vote.ts`

### Frontend

- `src/components/flow/GenerationVotingPanel.tsx`
- `src/services/proposals.ts`
- `src/services/voice/transcriptSanitizer.ts`

### Supabase

- `supabase/migrations/20260615_voting_demographics_prompt_metadata.sql`

### Tests

- `tests/proposalUtils.test.ts`
- `tests/transcriptSanitizer.test.ts`

### Documentation

- `IMPLEMENTATION_REPORT_2026-06-15.md`

## Modified Files

- `api/proposals/create.ts`
- `api/voice/speak.ts`
- `eslint.config.js`
- `src/App.tsx`
- `src/components/flow/ConfirmStep.tsx`
- `src/components/flow/GeneratingScreen.tsx`
- `src/components/flow/ResultsView.tsx`
- `src/components/flow/SuggestFlow.tsx`
- `src/components/proposal/ProposalListPanel.tsx`
- `src/components/proposal/ProposalPanel.css`
- `src/components/proposal/ProposalPanel.tsx`
- `src/hooks/useVoiceFlow.ts`
- `src/locales/ca.json`
- `src/locales/en.json`
- `src/locales/es.json`
- `src/services/voice/audioPlayer.ts`
- `src/services/voice/audioRecorder.ts`
- `src/store/useAppStore.ts`
- `src/store/useVoiceStore.ts`
- `src/styles/flow.css`
- `src/types/index.ts`
- `supabase/schema.sql`

## Verification Performed

The following commands passed locally:

```bash
node --import tsx --test tests\proposalUtils.test.ts tests\transcriptSanitizer.test.ts
npm run lint
npm run build
python -m compileall deploy\app
```

Browser QA was also performed with Playwright against the local dev server.

Verified in browser:

- Map loads.
- Suggest flow opens.
- Voice is off by default.
- Manual space and POV selection work.
- Review demographic fields appear.
- Answering `No` for a demographic field reveals consent and disables submit until consent is checked.
- Review summary text no longer shows corrupted separator characters.
- Browse overlay opens from a map marker.
- Suggest FAB hides while browse overlay is open.
- Proposal cards show Community score.
- Proposal detail shows Community score.
- Demographic data is not shown publicly.
- Console was clean after the browse schema compatibility fix.

Not fully browser-verified:

- The visual generation voting panel was type-checked and build-checked, but not fully browser-verified with a real generation call because that would spend Gemini/API resources. An attempted Playwright route mock was blocked by the CLI stripping JSON quotes from mocked bodies.

## Supabase Migration Instructions

To apply the database changes to the live Supabase project:

1. Open the Supabase Dashboard.
2. Select the project used by this app.
3. Go to SQL Editor.
4. Click New query.
5. Paste the full contents of:

```text
supabase/migrations/20260615_voting_demographics_prompt_metadata.sql
```

6. Click Run.

After running it, check:

- Table Editor -> `proposals`
  - `community_score`
  - `vote_count`
  - `participant_gender`
  - `has_children`
  - `has_pets`
  - `has_restricted_mobility`
  - `original_prompt_text`
  - `expert_suggested_prompt`
  - `prompt_source`

- Table Editor -> `proposal_votes`

- Database -> Functions
  - `get_vote_candidates`
  - `refresh_proposal_vote_stats`

## Important Notes

### Live Supabase Must Be Migrated

The frontend includes a compatibility fallback for browsing old proposals before the migration is applied, but the new voting endpoints require the new table and RPC to exist in Supabase.

Until the migration is applied:

- Browse remains usable.
- Community scores will show as no votes yet.
- Voting API calls may fail because `proposal_votes` and `get_vote_candidates` do not exist yet.

### RAG Backend

The canonical RAG/FastAPI backend remains:

```text
deploy/app
```

The Python compile check passed for `deploy/app`.

### Generated Local Artifacts

The `.playwright-cli/` folder was generated by browser QA and is not part of the feature implementation.

