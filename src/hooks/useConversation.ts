/**
 * useConversation — the main orchestration hook.
 *
 * Wires together: AudioRecorder → Whisper → State Machine → TTS → AudioPlayer
 * Components only need to call `startConversation()` and watch the store.
 */

import { useCallback, useRef, useEffect } from 'react';
import { useVoiceStore } from '../store/useVoiceStore';
import { useAppStore } from '../store/useAppStore';
import { AudioRecorder } from '../services/audio/recorder';
import { AudioPlayer } from '../services/audio/player';
import { transcribeAudio, generateSpeech } from '../services/apiClient';
import { processTransition } from '../services/conversation/stateMachine';
import type { ConversationStage } from '../services/conversation/types';

/** Stages where we should listen for user input after AI speaks. */
const LISTENING_STAGES: ConversationStage[] = [
  'area_select',
  'proposal_input',
  'proposal_confirm',
  'result',
];

export function useConversation() {
  const store = useVoiceStore();
  const appStore = useAppStore();
  const recorderRef = useRef(new AudioRecorder({ silenceDuration: 2000 }));
  const playerRef = useRef(new AudioPlayer());
  const isProcessingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current.stop();
      playerRef.current.stop();
    };
  }, []);

  /** Speak text via TTS and wait for playback to finish. */
  const speak = useCallback(async (text: string): Promise<void> => {
    const voiceStore = useVoiceStore.getState();
    voiceStore.setActivity('speaking');
    voiceStore.addMessage('ai', text);

    try {
      const audioBlob = await generateSpeech(text);
      await playerRef.current.play(audioBlob);
    } catch (err) {
      console.warn('[conversation] TTS failed, continuing without audio:', err);
      // Even if TTS fails, the text is in the message log — user can read it
    }

    useVoiceStore.getState().setActivity('idle');
  }, []);

  /** Listen for user speech, transcribe, return text. */
  const listen = useCallback(async (): Promise<string> => {
    const voiceStore = useVoiceStore.getState();
    voiceStore.setActivity('listening');

    const recorder = recorderRef.current;

    // Pipe volume levels to the store for visualization
    recorder.onVolumeChange = (level) => {
      useVoiceStore.getState().setVolumeLevel(level);
    };

    const audioBlob = await recorder.start();

    voiceStore.setActivity('transcribing');
    voiceStore.setVolumeLevel(0);

    const result = await transcribeAudio(audioBlob);
    const text = result.text.trim();

    if (text) {
      voiceStore.addMessage('user', text);
    }

    return text;
  }, []);

  /** Run one conversation turn: AI speaks → user speaks → process → repeat. */
  const runTurn = useCallback(
    async (stage: ConversationStage): Promise<void> => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      const voiceStore = useVoiceStore.getState();

      try {
        // 1. Process the transition (for 'idle'/'welcome', no transcript needed)
        voiceStore.setActivity('thinking');
        const transition = await processTransition(
          stage,
          '',
          voiceStore.context,
        );

        // 2. Update context and stage
        voiceStore.updateContext(transition.updatedContext);
        voiceStore.setStage(transition.nextStage);

        // 3. Sync with main app store if hotspot was selected
        if (transition.updatedContext.selectedHotspot) {
          appStore.setSelectedHotspot(transition.updatedContext.selectedHotspot);
        }

        // 4. Speak AI response
        await speak(transition.aiResponse);

        // 5. If the next stage expects user input, listen and recurse
        if (LISTENING_STAGES.includes(transition.nextStage)) {
          await listenAndProcess(transition.nextStage);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        voiceStore.setError(message);
        console.error('[conversation] Turn error:', err);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [speak, appStore],
  );

  /** Listen → transcribe → process transition → speak → loop. */
  const listenAndProcess = useCallback(
    async (currentStage: ConversationStage): Promise<void> => {
      const voiceStore = useVoiceStore.getState();

      try {
        // Listen
        const transcript = await listen();

        if (!transcript) {
          // Empty transcript — ask again
          await speak("I didn't catch that. Could you say that again?");
          await listenAndProcess(currentStage);
          return;
        }

        // Process
        voiceStore.setActivity('thinking');
        const transition = await processTransition(
          currentStage,
          transcript,
          voiceStore.context,
        );

        // Update
        voiceStore.updateContext(transition.updatedContext);
        voiceStore.setStage(transition.nextStage);

        // Sync hotspot selection with main app store
        if (transition.updatedContext.selectedHotspot) {
          appStore.setSelectedHotspot(transition.updatedContext.selectedHotspot);
        }

        // Sync generated image
        if (transition.generatedImageUrl) {
          // The ProposalPanel can show this via the voice store context
        }

        // Speak
        await speak(transition.aiResponse);

        // If next stage is area_confirm, auto-advance (no user input needed)
        if (transition.nextStage === 'area_confirm') {
          const confirmTransition = await processTransition(
            'area_confirm',
            '',
            useVoiceStore.getState().context,
          );
          voiceStore.updateContext(confirmTransition.updatedContext);
          voiceStore.setStage(confirmTransition.nextStage);
          await speak(confirmTransition.aiResponse);

          if (LISTENING_STAGES.includes(confirmTransition.nextStage)) {
            await listenAndProcess(confirmTransition.nextStage);
          }
          return;
        }

        // If generating stage, the state machine already handles the full pipeline
        // (it calls generateImage internally and returns result stage)
        if (transition.nextStage === 'generating') {
          // Already handled in proposal_confirm → startImageGeneration
          // The transition result already contains result stage
          return;
        }

        // Continue listening if needed
        if (LISTENING_STAGES.includes(transition.nextStage)) {
          await listenAndProcess(transition.nextStage);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        voiceStore.setError(message);
        console.error('[conversation] Listen/process error:', err);
      }
    },
    [listen, speak, appStore],
  );

  /** Start the entire conversation from the beginning. */
  const startConversation = useCallback(async () => {
    const voiceStore = useVoiceStore.getState();
    voiceStore.reset();
    voiceStore.setActive(true);
    await runTurn('idle');
  }, [runTurn]);

  /** Stop the conversation and clean up. */
  const stopConversation = useCallback(() => {
    recorderRef.current.stop();
    playerRef.current.stop();
    isProcessingRef.current = false;
    useVoiceStore.getState().setActive(false);
  }, []);

  return {
    // State (read from store)
    isActive: store.isActive,
    stage: store.stage,
    activity: store.activity,
    messages: store.messages,
    context: store.context,
    volumeLevel: store.volumeLevel,
    error: store.error,

    // Actions
    startConversation,
    stopConversation,
  };
}
