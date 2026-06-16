import type { Proposal } from '../types';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const SESSION_KEY = 'bcn-civic-vision-voter-session';

function createUuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  );
}

export function getVoterSessionId(): string {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = createUuid();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !json.success || json.data === undefined) {
    throw new Error(json.error ?? `Request failed: ${response.status}`);
  }
  return json.data;
}

export function fetchVoteCandidates(limit = 3): Promise<Proposal[]> {
  return postJson<Proposal[]>('/api/proposals/vote-candidates', {
    sessionId: getVoterSessionId(),
    limit,
  });
}

export function submitProposalVote(
  proposalId: string,
  score: number,
): Promise<{ proposalId: string; communityScore: number; voteCount: number }> {
  return postJson('/api/proposals/vote', {
    sessionId: getVoterSessionId(),
    proposalId,
    score,
  });
}

export function publishProposal(proposal: Proposal): Promise<Proposal> {
  if (!proposal.isDraft) return Promise.resolve(proposal);
  return postJson<Proposal>('/api/proposals/publish', { proposal });
}
