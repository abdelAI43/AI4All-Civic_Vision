import type { AgentFeedback } from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8001';

interface EvaluateResponse {
  hotspot_id: string;
  proposal: string;
  agents: AgentFeedback[];
}

export async function evaluateProposal(
  proposal: string,
  location: string,
  hotspotId: string,
): Promise<AgentFeedback[]> {
  const res = await fetch(`${API_BASE}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposal,
      location,
      hotspot_id: hotspotId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Evaluation failed (${res.status}): ${text}`);
  }

  const data: EvaluateResponse = await res.json();
  return data.agents;
}
