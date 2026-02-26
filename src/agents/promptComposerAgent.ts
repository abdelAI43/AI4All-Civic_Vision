/**
 * Prompt Composer Agent
 *
 * Takes the extracted user intent and composes a photorealistic image
 * generation prompt suitable for img2img models (NanoBanana / Stable Diffusion).
 */

import type { AgentSkill, AgentContext } from './types';
import { chatCompletion } from '../services/apiClient';

export interface PromptComposerInput {
  intentSummary: string;
  urbanChanges: string[];
  context: AgentContext;
}

export interface PromptComposerOutput {
  imagePrompt: string;
  negativePrompt: string;
}

const SYSTEM_PROMPT = `You are an expert at writing img2img prompts for photorealistic image editing.
You receive a user's urban planning intent and must output a prompt that EDITS an existing photograph.

CRITICAL — this is img2img (image-to-image), NOT text-to-image:
- The source photograph is provided alongside this prompt
- You MUST preserve the existing scene: same buildings, same streets, same skyline, same perspective, same camera angle, same lighting conditions, same weather
- ONLY describe the specific additions or modifications the user requested
- Think of it as "same photo + targeted changes", not a new scene
- Frame changes as additions to the existing scene: "with a new bike lane added", "with trees planted along the sidewalk"

Rules:
- Start the prompt by describing the existing scene to anchor the model
- Then layer on ONLY the user-requested changes
- Use photorealistic, architectural photography language
- Mention the specific location by name (Barcelona)
- Include the current materials, surfaces, and atmosphere
- Keep the prompt under 120 words — be precise, not verbose
- The negative prompt should prevent deviation from the source photo

Respond in JSON:
{
  "imagePrompt": "A photorealistic photograph of [location name] in Barcelona, showing [existing scene description], now with [specific user-requested changes]. Same perspective, natural daylight, high resolution.",
  "negativePrompt": "different angle, different location, different buildings, cartoon, illustration, painting, blurry, low quality, watermark, text, completely different scene, aerial view unless specified"
}`;

export const promptComposerAgent: AgentSkill<PromptComposerInput, PromptComposerOutput> = {
  name: 'Prompt Composer',
  description: 'Composes photorealistic image generation prompts from urban planning intent',

  async execute(input: PromptComposerInput): Promise<PromptComposerOutput> {
    const userMessage = `Location: ${input.context.locationName ?? 'Barcelona urban area'}
Description: ${input.context.locationDescription ?? ''}
User intent: ${input.intentSummary}
Specific changes: ${input.urbanChanges.join(', ')}

Compose an img2img prompt that applies these changes to a photo of this location.`;

    const raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { type: 'json_object' },
      0.7,
    );

    return JSON.parse(raw) as PromptComposerOutput;
  },
};
