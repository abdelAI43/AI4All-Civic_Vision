/**
 * Response Composer Agent
 *
 * Generates natural, warm spoken responses for the AI to say at each
 * conversation stage. Tuned for a public exhibition context.
 */

import type { AgentSkill } from './types';
import { chatCompletion } from '../services/apiClient';

export type ResponseScenario =
  | 'welcome'
  | 'present_areas'
  | 'area_confirmed'
  | 'ask_proposal'
  | 'confirm_intent'
  | 'generating'
  | 'result_ready'
  | 'misunderstand_area'
  | 'misunderstand_proposal'
  | 'retry_final'
  | 'goodbye';

export interface ResponseInput {
  scenario: ResponseScenario;
  /** Dynamic variables to interpolate into the response. */
  variables?: Record<string, string>;
}

export interface ResponseOutput {
  spokenText: string;
}

const SYSTEM_PROMPT = `You are a warm, enthusiastic AI guide at a public urban planning exhibition in Barcelona.
You speak naturally and concisely — this text will be read aloud via TTS.

Rules:
- Keep responses SHORT (1-3 sentences max). This is spoken, not written.
- Be warm and encouraging — visitors are excited to participate
- Never use markdown, bullet points, or formatting — just natural speech
- Use the visitor's name if available
- When listing areas, say them naturally: "You can explore Plaça Catalunya, La Rambla, Passeig de Gràcia, Barceloneta Beach, or Park Güell."
- When confirming understanding, restate what YOU understood concisely
- When something isn't clear, gently ask again without making the user feel bad

Respond in JSON:
{
  "spokenText": "..."
}`;

function buildPromptForScenario(scenario: ResponseScenario, vars: Record<string, string>): string {
  switch (scenario) {
    case 'welcome':
      return 'Generate a brief welcome message for a visitor arriving at the Barcelona Civic Vision exhibition. Invite them to choose an area of the city they want to reimagine.';
    case 'present_areas':
      return 'List the 5 available areas naturally in speech: Plaça Catalunya, La Rambla, Passeig de Gràcia, Barceloneta Beach, Park Güell. Ask which one interests them.';
    case 'area_confirmed':
      return `The visitor has chosen ${vars['areaName'] ?? 'an area'}. Briefly confirm their choice and tell them you\'re now showing that location. Then ask what changes they\'d like to see there.`;
    case 'ask_proposal':
      return `Ask the visitor what changes they would like to see at ${vars['areaName'] ?? 'this location'}. Encourage them to be creative and specific.`;
    case 'confirm_intent':
      return `You understood the visitor wants: "${vars['intentSummary'] ?? ''}". Restate this concisely and ask if that\'s correct, or if they\'d like to change anything.`;
    case 'generating':
      return `Tell the visitor you\'re now generating their vision for ${vars['areaName'] ?? 'the area'}. Build excitement briefly — their idea is becoming real.`;
    case 'result_ready':
      return `The image is ready! Tell the visitor their proposal for ${vars['areaName'] ?? 'the area'} has been visualized. Invite them to see the before and after. Mention they can try another area if they\'d like.`;
    case 'misunderstand_area':
      return `You didn't quite catch which area the visitor meant. Gently ask them to say it again, and remind them of the options: Plaça Catalunya, La Rambla, Passeig de Gràcia, Barceloneta Beach, or Park Güell. Attempt: ${vars['attempt'] ?? '1'} of 3.`;
    case 'misunderstand_proposal':
      return `The visitor's proposal was too vague to visualize. Gently ask them to be more specific about what physical changes they'd like to see at ${vars['areaName'] ?? 'the area'}. Give a quick example like "add more trees" or "create a bike lane."`;
    case 'retry_final':
      return `After multiple attempts you still can't understand. Kindly suggest they try saying one of the area names clearly, or offer to start fresh.`;
    case 'goodbye':
      return 'Thank the visitor for participating in the Barcelona Civic Vision exhibition. Brief and warm.';
  }
}

export const responseComposerAgent: AgentSkill<ResponseInput, ResponseOutput> = {
  name: 'Response Composer',
  description: 'Generates natural spoken responses for each conversation stage',

  async execute(input: ResponseInput): Promise<ResponseOutput> {
    const prompt = buildPromptForScenario(input.scenario, input.variables ?? {});

    const raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { type: 'json_object' },
      0.8,
    );

    return JSON.parse(raw) as ResponseOutput;
  },
};
