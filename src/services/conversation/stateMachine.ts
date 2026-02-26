/**
 * Conversation State Machine
 *
 * The core orchestrator. Given the current stage and user input,
 * runs the appropriate agent skills and determines the next stage.
 *
 * This is a pure logic module — no React, no store mutations.
 * The store/hook layer calls this and applies the results.
 */

import type { Hotspot } from '../../types';
import type { ConversationStage, ConversationContext } from './types';
import { hotspots } from '../../data/hotspots';
import { areaMatcherAgent } from '../../agents/areaMatcherAgent';
import { intentExtractorAgent } from '../../agents/intentExtractorAgent';
import { promptComposerAgent } from '../../agents/promptComposerAgent';
import { responseComposerAgent } from '../../agents/responseComposerAgent';
import { generateImage } from '../apiClient';

/* ---- Transition result ---- */

export interface TransitionResult {
  nextStage: ConversationStage;
  aiResponse: string;
  updatedContext: Partial<ConversationContext>;
  /** If set, the image to show in the before/after view. */
  generatedImageUrl?: string;
}

/* ---- Stage handlers ---- */

/** Called when conversation starts. AI welcomes and presents areas. */
export async function handleWelcome(): Promise<TransitionResult> {
  const { spokenText } = await responseComposerAgent.execute({
    scenario: 'welcome',
  });

  return {
    nextStage: 'area_select',
    aiResponse: spokenText,
    updatedContext: { retryCount: 0 },
  };
}

/** Process user speech during area selection. */
export async function handleAreaSelect(
  transcript: string,
  context: ConversationContext,
): Promise<TransitionResult> {
  // Run area matcher agent
  const matchResult = await areaMatcherAgent.execute({
    transcript,
    hotspots,
  });

  // High confidence match
  if (matchResult.matchedHotspot && matchResult.confidence >= 0.6) {
    const { spokenText } = await responseComposerAgent.execute({
      scenario: 'area_confirmed',
      variables: {
        areaName: matchResult.matchedHotspot.name,
      },
    });

    return {
      nextStage: 'area_confirm',
      aiResponse: spokenText,
      updatedContext: {
        selectedHotspot: matchResult.matchedHotspot,
        retryCount: 0,
      },
    };
  }

  // Low confidence — ask again
  const newRetryCount = context.retryCount + 1;

  if (newRetryCount > context.maxRetries) {
    // Final retry — list all options explicitly
    const { spokenText } = await responseComposerAgent.execute({
      scenario: 'retry_final',
    });

    return {
      nextStage: 'area_select',
      aiResponse: spokenText,
      updatedContext: { retryCount: 0 }, // reset after final attempt
    };
  }

  const { spokenText } = await responseComposerAgent.execute({
    scenario: 'misunderstand_area',
    variables: { attempt: String(newRetryCount) },
  });

  return {
    nextStage: 'area_select',
    aiResponse: matchResult.clarificationMessage || spokenText,
    updatedContext: { retryCount: newRetryCount },
  };
}

/** After area is confirmed, transition to proposal input. */
export async function handleAreaConfirm(
  hotspot: Hotspot,
): Promise<TransitionResult> {
  const { spokenText } = await responseComposerAgent.execute({
    scenario: 'ask_proposal',
    variables: { areaName: hotspot.name },
  });

  return {
    nextStage: 'proposal_input',
    aiResponse: spokenText,
    updatedContext: { retryCount: 0 },
  };
}

/** Process user's proposal description. */
export async function handleProposalInput(
  transcript: string,
  context: ConversationContext,
): Promise<TransitionResult> {
  const hotspot = context.selectedHotspot!;

  // Run intent extractor agent
  const intent = await intentExtractorAgent.execute({
    transcript,
    context: {
      hotspotId: hotspot.id,
      locationName: hotspot.name,
      locationDescription: hotspot.description,
    },
  });

  if (intent.isActionable) {
    // Confirm understanding
    const { spokenText } = await responseComposerAgent.execute({
      scenario: 'confirm_intent',
      variables: { intentSummary: intent.intentSummary },
    });

    return {
      nextStage: 'proposal_confirm',
      aiResponse: spokenText,
      updatedContext: {
        userTranscript: transcript,
        intentSummary: intent.intentSummary,
        urbanChanges: intent.urbanChanges,
        retryCount: 0,
      },
    };
  }

  // Not actionable — ask for clarification
  const newRetryCount = context.retryCount + 1;

  if (newRetryCount > context.maxRetries) {
    const { spokenText } = await responseComposerAgent.execute({
      scenario: 'retry_final',
    });

    return {
      nextStage: 'proposal_input',
      aiResponse: spokenText,
      updatedContext: { retryCount: 0 },
    };
  }

  const aiResponse = intent.clarificationMessage ?? (
    await responseComposerAgent.execute({
      scenario: 'misunderstand_proposal',
      variables: { areaName: hotspot.name },
    })
  ).spokenText;

  return {
    nextStage: 'proposal_input',
    aiResponse,
    updatedContext: { retryCount: newRetryCount },
  };
}

/** User confirms their intent — proceed to image generation. */
export async function handleProposalConfirm(
  transcript: string,
  context: ConversationContext,
): Promise<TransitionResult> {
  const lowerTranscript = transcript.toLowerCase();

  // Simple yes/no detection
  const isConfirmation =
    lowerTranscript.includes('yes') ||
    lowerTranscript.includes('yeah') ||
    lowerTranscript.includes('correct') ||
    lowerTranscript.includes('right') ||
    lowerTranscript.includes('sure') ||
    lowerTranscript.includes('go ahead') ||
    lowerTranscript.includes('do it') ||
    lowerTranscript.includes('perfect');

  const isRejection =
    lowerTranscript.includes('no') ||
    lowerTranscript.includes('change') ||
    lowerTranscript.includes('different') ||
    lowerTranscript.includes('wrong') ||
    lowerTranscript.includes('not what');

  if (isRejection) {
    const { spokenText } = await responseComposerAgent.execute({
      scenario: 'ask_proposal',
      variables: { areaName: context.selectedHotspot?.name ?? 'the area' },
    });

    return {
      nextStage: 'proposal_input',
      aiResponse: spokenText,
      updatedContext: {
        intentSummary: '',
        urbanChanges: [],
        retryCount: 0,
      },
    };
  }

  if (isConfirmation) {
    return startImageGeneration(context);
  }

  // Treat ambiguous response as a new proposal
  return handleProposalInput(transcript, context);
}

/** Compose prompt and generate image. */
async function startImageGeneration(
  context: ConversationContext,
): Promise<TransitionResult> {
  const hotspot = context.selectedHotspot!;

  // 1. Tell user we're generating
  const generateMessage = await responseComposerAgent.execute({
    scenario: 'generating',
    variables: { areaName: hotspot.name },
  });

  // 2. Compose image prompt via agent
  const { imagePrompt } = await promptComposerAgent.execute({
    intentSummary: context.intentSummary,
    urbanChanges: context.urbanChanges,
    context: {
      hotspotId: hotspot.id,
      locationName: hotspot.name,
      locationDescription: hotspot.description,
    },
  });

  // 3. Determine base image — server reads local file and converts to base64
  const baseImagePath = `${hotspot.id}-original.jpg`;

  // 4. Generate image via Replicate (NanoBanana) with source image
  let generatedImageUrl: string;
  try {
    generatedImageUrl = await generateImage(imagePrompt, '', baseImagePath);
  } catch {
    // If image gen fails, still show the result stage with error info
    generatedImageUrl = '';
  }

  // 5. Generate result narration
  const resultResponse = await responseComposerAgent.execute({
    scenario: 'result_ready',
    variables: { areaName: hotspot.name },
  });

  return {
    nextStage: 'result',
    aiResponse: generatedImageUrl
      ? resultResponse.spokenText
      : generateMessage.spokenText + " Unfortunately, the image generation didn't work this time. But your idea is great! Feel free to try again.",
    updatedContext: {
      imagePrompt,
      generatedImageUrl: generatedImageUrl || null,
    },
    generatedImageUrl: generatedImageUrl || undefined,
  };
}

/**
 * Main dispatch — route to the correct handler based on current stage.
 */
export async function processTransition(
  stage: ConversationStage,
  transcript: string,
  context: ConversationContext,
): Promise<TransitionResult> {
  switch (stage) {
    case 'idle':
    case 'welcome':
      return handleWelcome();

    case 'area_select':
      return handleAreaSelect(transcript, context);

    case 'area_confirm':
      return handleAreaConfirm(context.selectedHotspot!);

    case 'proposal_input':
      return handleProposalInput(transcript, context);

    case 'proposal_confirm':
      return handleProposalConfirm(transcript, context);

    case 'result':
      // User wants to try again — reset to area selection
      return handleWelcome();

    default:
      return handleWelcome();
  }
}
