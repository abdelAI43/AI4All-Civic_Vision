/**
 * Intent Extractor Agent
 *
 * Takes the user's spoken proposal transcript and extracts a structured
 * urban planning intent. Determines if it's actionable enough to generate an image.
 */

import type { AgentSkill, AgentContext } from './types';
import { chatCompletion } from '../services/apiClient';

export interface IntentInput {
  transcript: string;
  context: AgentContext;
}

export interface IntentOutput {
  intentSummary: string;
  urbanChanges: string[];
  isActionable: boolean;
  clarificationMessage?: string;
}

const SYSTEM_PROMPT = `You are an urban planning AI at a public exhibition in Barcelona.
The user has described changes they want to see at a specific location.
Extract their intent as a structured proposal.

Rules:
- Summarize their desire in 1-2 clear sentences (intentSummary)
- List specific urban changes as short phrases (urbanChanges)
- Set isActionable=true ONLY if you can clearly understand what visual change they want
- If too vague (e.g., "make it better"), set isActionable=false and ask a specific question
- Be encouraging — this is a public exhibition, people are excited to participate

Respond in JSON:
{
  "intentSummary": "The user wants to...",
  "urbanChanges": ["add trees", "widen sidewalk", ...],
  "isActionable": true/false,
  "clarificationMessage": "optional — only if isActionable is false"
}`;

export const intentExtractorAgent: AgentSkill<IntentInput, IntentOutput> = {
  name: 'Intent Extractor',
  description: 'Extracts structured urban planning intent from user speech',

  async execute(input: IntentInput): Promise<IntentOutput> {
    const locationInfo = input.context.locationName
      ? `Location: ${input.context.locationName} — ${input.context.locationDescription ?? ''}`
      : 'Location: unspecified urban area';

    const userMessage = `${locationInfo}\n\nUser said: "${input.transcript}"`;

    const raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { type: 'json_object' },
      0.5,
    );

    return JSON.parse(raw) as IntentOutput;
  },
};
