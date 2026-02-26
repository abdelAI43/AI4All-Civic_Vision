/**
 * Conversation types — shared across the state machine, store, and UI.
 */

import type { Hotspot } from '../../types';

/* ---- Conversation stages (the finite state machine) ---- */

export type ConversationStage =
  | 'idle'            // not started
  | 'welcome'         // AI greets user
  | 'area_select'     // AI listed areas, waiting for user to pick
  | 'area_confirm'    // AI confirms the selected area
  | 'proposal_input'  // AI asked for proposal, waiting for user speech
  | 'proposal_confirm'// AI confirms understanding of intent
  | 'generating'      // image generation in progress
  | 'result'          // showing the generated proposal
  | 'error';          // something went wrong

/* ---- Pipeline sub-states (what the system is doing right now) ---- */

export type PipelineActivity =
  | 'idle'
  | 'listening'       // microphone active, user speaking
  | 'transcribing'    // sending audio to Whisper
  | 'thinking'        // LLM processing (agent skill running)
  | 'speaking'        // TTS playing back AI response
  | 'generating_image'; // waiting for Replicate

/* ---- Message in the conversation log ---- */

export interface ConversationMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
  timestamp: number;
}

/* ---- Context accumulated during the conversation ---- */

export interface ConversationContext {
  selectedHotspot: Hotspot | null;
  userTranscript: string;
  intentSummary: string;
  urbanChanges: string[];
  imagePrompt: string;
  generatedImageUrl: string | null;
  retryCount: number;
  maxRetries: number;
}

export function createInitialContext(): ConversationContext {
  return {
    selectedHotspot: null,
    userTranscript: '',
    intentSummary: '',
    urbanChanges: [],
    imagePrompt: '',
    generatedImageUrl: null,
    retryCount: 0,
    maxRetries: 2,
  };
}
