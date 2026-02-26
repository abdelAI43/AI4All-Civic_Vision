/**
 * Voice interaction store — manages the full conversation state.
 *
 * Kept separate from useAppStore so the voice feature is fully modular.
 * Integration points: when an area is selected or a proposal generated,
 * the UI layer syncs back to useAppStore.
 */

import { create } from 'zustand';
import type {
  ConversationStage,
  PipelineActivity,
  ConversationMessage,
  ConversationContext,
} from '../services/conversation/types';
import { createInitialContext } from '../services/conversation/types';

interface VoiceState {
  /* ---- Core state ---- */
  stage: ConversationStage;
  activity: PipelineActivity;
  messages: ConversationMessage[];
  context: ConversationContext;

  /** Whether the voice interaction mode is active (overlay visible). */
  isActive: boolean;

  /** Volume level from microphone (0-1), for waveform visualization. */
  volumeLevel: number;

  /** Error message, if any. */
  error: string | null;

  /* ---- Actions ---- */
  setActive: (active: boolean) => void;
  setStage: (stage: ConversationStage) => void;
  setActivity: (activity: PipelineActivity) => void;
  setVolumeLevel: (level: number) => void;
  addMessage: (role: 'ai' | 'user', text: string) => void;
  updateContext: (updates: Partial<ConversationContext>) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  stage: 'idle',
  activity: 'idle',
  messages: [],
  context: createInitialContext(),
  isActive: false,
  volumeLevel: 0,
  error: null,

  setActive: (active) =>
    set({
      isActive: active,
      // Reset when activating
      ...(active
        ? {
            stage: 'idle',
            activity: 'idle',
            messages: [],
            context: createInitialContext(),
            error: null,
          }
        : {}),
    }),

  setStage: (stage) => set({ stage }),

  setActivity: (activity) => set({ activity }),

  setVolumeLevel: (level) => set({ volumeLevel: level }),

  addMessage: (role, text) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          text,
          timestamp: Date.now(),
        },
      ],
    })),

  updateContext: (updates) =>
    set((state) => ({
      context: { ...state.context, ...updates },
    })),

  setError: (error) =>
    set({
      error,
      activity: 'idle',
      ...(error ? { stage: 'error' as const } : {}),
    }),

  reset: () =>
    set({
      stage: 'idle',
      activity: 'idle',
      messages: [],
      context: createInitialContext(),
      volumeLevel: 0,
      error: null,
    }),
}));
