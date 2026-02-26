/**
 * Area Matcher Agent
 *
 * Takes raw user transcript + list of available hotspots and determines
 * which area the user is referring to. Uses LLM for fuzzy matching.
 */

import type { Hotspot } from '../types';
import type { AgentSkill } from './types';
import { chatCompletion } from '../services/apiClient';

export interface AreaMatchInput {
  transcript: string;
  hotspots: Hotspot[];
}

export interface AreaMatchOutput {
  matchedHotspot: Hotspot | null;
  confidence: number; // 0-1
  clarificationMessage?: string;
}

const SYSTEM_PROMPT = `You are an assistant at a public urban planning exhibition in Barcelona.
The user has spoken about which area they want to work on.
You must match their speech to one of the available areas.

Rules:
- Match even if the user uses informal names, partial names, or descriptions
- "the beach" → Barceloneta Beach, "the park" → Park Güell, "the main square" → Plaça Catalunya
- "rambla" or "ramblas" → La Rambla
- If the match is clear, set confidence to 0.8-1.0
- If ambiguous between 2 options, set confidence to 0.4-0.6 and ask a clarifying question
- If you cannot match at all, set confidence to 0.0 and list available areas

Respond in JSON:
{
  "matchedHotspotId": "id-here" | null,
  "confidence": 0.0-1.0,
  "clarificationMessage": "optional question to ask"
}`;

function buildHotspotsContext(hotspots: Hotspot[]): string {
  return hotspots
    .map((h) => `- ID: "${h.id}" | Name: "${h.name}" | Type: ${h.type} | Neighborhood: ${h.neighborhood} | Description: ${h.description}`)
    .join('\n');
}

export const areaMatcherAgent: AgentSkill<AreaMatchInput, AreaMatchOutput> = {
  name: 'Area Matcher',
  description: 'Matches user speech to a Barcelona hotspot area',

  async execute(input: AreaMatchInput): Promise<AreaMatchOutput> {
    const userMessage = `Available areas:\n${buildHotspotsContext(input.hotspots)}\n\nUser said: "${input.transcript}"`;

    const raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { type: 'json_object' },
      0.3,
    );

    const parsed = JSON.parse(raw) as {
      matchedHotspotId: string | null;
      confidence: number;
      clarificationMessage?: string;
    };

    const matchedHotspot = parsed.matchedHotspotId
      ? input.hotspots.find((h) => h.id === parsed.matchedHotspotId) ?? null
      : null;

    return {
      matchedHotspot,
      confidence: parsed.confidence,
      clarificationMessage: parsed.clarificationMessage,
    };
  },
};
