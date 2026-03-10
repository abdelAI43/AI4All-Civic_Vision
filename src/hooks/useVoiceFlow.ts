import { useCallback, useEffect, useRef } from 'react';
import i18n from '../i18n';
import { spaces } from '../data/spaces';
import type { FlowStep, Proposal } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useVoiceStore } from '../store/useVoiceStore';
import {
  agentCall,
  generateSpeech,
  transcribeAudio,
  type AreaMatcherResult,
  type InputExtractorResult,
  type PovMatcherResult,
  type ResponseComposerResult,
  type VoiceLanguage,
} from '../services/voice/apiClient';
import { getPromptSet, isAffirmative, isNegative } from '../services/voice/agents';
import { AudioPlayer } from '../services/voice/audioPlayer';
import { recordAudioOnce } from '../services/voice/audioRecorder';
import { shouldCollapseTranscript, shouldAutoAdvanceFromSelection } from '../services/voice/stateMachine';

const SUGGEST_STEP_TWO = 2 as FlowStep;
const SUGGEST_STEP_THREE = 3 as FlowStep;
const SUGGEST_STEP_FOUR = 4 as FlowStep;
const SUGGEST_STEP_FIVE = 5 as FlowStep;

function toVoiceLanguage(): VoiceLanguage {
  const base = i18n.language.split('-')[0];
  if (base === 'ca' || base === 'es') return base;
  return 'en';
}

function getSummarySeed(proposal: Proposal): string {
  const first = proposal.agentFeedback[0]?.feedback?.split('. ')?.[0] ?? '';
  const keyPoint = first.trim();
  const score = Number.isFinite(proposal.avgAgentScore) ? proposal.avgAgentScore.toFixed(1) : '0.0';
  return `Average score ${score}. Key point: ${keyPoint}`;
}

export function useVoiceFlow() {
  const {
    mode,
    flow,
    setSelectedSpace,
    setSelectedPov,
    setPromptText,
    setParticipantName,
    setParticipantAge,
    setFlowStep,
  } = useAppStore();

  const {
    setIsActive,
    setActivity,
    setError,
    clearMessages,
    setCollapsed,
    setVolumeLevel,
    addMessage,
    setAutoSelectedSpaceId,
    setAutoSelectedPovId,
  } = useVoiceStore();

  const runRef = useRef(0);
  const listenAbortRef = useRef<AbortController | null>(null);
  const playerRef = useRef<AudioPlayer>(new AudioPlayer());
  const previousModeRef = useRef(mode);
  const step4ReadyRef = useRef(false);
  const step5MessageShownRef = useRef(false);
  const step6SummaryForProposalRef = useRef<string | null>(null);

  const isStale = useCallback((runId: number): boolean => {
    return runId !== runRef.current || useAppStore.getState().mode !== 'suggest';
  }, []);

  const cancelCurrentIO = useCallback(() => {
    listenAbortRef.current?.abort();
    listenAbortRef.current = null;
    playerRef.current.stopAll();
    setVolumeLevel(0);
  }, [setVolumeLevel]);

  const speakAssistant = useCallback(async (text: string, runId: number, withAudio = true) => {
    const trimmed = text.trim();
    if (!trimmed || isStale(runId)) return;

    addMessage('assistant', trimmed);

    if (!withAudio) return;

    setActivity('speaking');
    setError(null);

    try {
      const speech = await generateSpeech({
        text: trimmed,
        language: toVoiceLanguage(),
      });

      if (isStale(runId)) return;
      await playerRef.current.enqueue(speech);
    } catch (err) {
      if (!isStale(runId)) {
        const message = err instanceof Error ? err.message : 'Audio playback failed';
        setError(message);
      }
    } finally {
      if (!isStale(runId)) {
        setActivity('idle');
      }
    }
  }, [addMessage, isStale, setActivity, setError]);

  const listenOnce = useCallback(async (runId: number): Promise<string> => {
    if (isStale(runId)) return '';

    const abortController = new AbortController();
    listenAbortRef.current = abortController;
    setActivity('listening');
    setError(null);

    try {
      const recorded = await recordAudioOnce({
        signal: abortController.signal,
        onVolume: setVolumeLevel,
      });

      if (isStale(runId)) return '';
      if (!recorded) {
        console.warn('[voice] recordAudioOnce returned null (aborted or empty)');
        return '';
      }

      console.log('[voice] Recorded audio:', recorded.mimeType, 'base64 length:', recorded.audioBase64.length);

      if (recorded.audioBase64.length < 100) {
        console.warn('[voice] Audio too short, skipping transcription');
        return '';
      }

      setActivity('thinking');
      const transcript = await transcribeAudio({
        audioBase64: recorded.audioBase64,
        mimeType: recorded.mimeType,
        language: toVoiceLanguage(),
      });

      console.log('[voice] Transcription result:', JSON.stringify(transcript));

      if (isStale(runId)) return '';
      const trimmed = transcript.trim();
      if (trimmed) {
        addMessage('user', trimmed);
      }
      return trimmed;
    } catch (err) {
      console.error('[voice] listenOnce error:', err);
      if (!isStale(runId) && !(err instanceof DOMException && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : 'Voice capture failed';
        setError(message);
      }
      return '';
    } finally {
      if (listenAbortRef.current === abortController) {
        listenAbortRef.current = null;
      }
      if (!isStale(runId)) {
        setActivity('idle');
        setVolumeLevel(0);
      }
    }
  }, [addMessage, isStale, setActivity, setError, setVolumeLevel]);

  const composeResponse = useCallback(async (runId: number, context: Record<string, unknown>, fallback: string) => {
    try {
      const data = await agentCall<ResponseComposerResult>({
        agentType: 'responseComposer',
        language: toVoiceLanguage(),
        messages: [{ role: 'user', content: fallback }],
        context,
      });
      if (isStale(runId)) return fallback;
      return data.spokenText || fallback;
    } catch {
      return fallback;
    }
  }, [isStale]);

  const runStep = useCallback(async (step: FlowStep, runId: number) => {
    const lang = toVoiceLanguage();
    const prompts = getPromptSet(lang);
    const currentFlow = useAppStore.getState().flow;
    if (step !== 5) {
      step5MessageShownRef.current = false;
    }

    if (step === 1) {
      if (currentFlow.selectedSpaceId) return;

      await speakAssistant(prompts.step1Greeting, runId);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const transcript = await listenOnce(runId);
        if (isStale(runId)) return;
        if (!transcript) {
          await speakAssistant(prompts.retrySpace, runId);
          continue;
        }

        try {
          const data = await agentCall<AreaMatcherResult>({
            agentType: 'areaMatcher',
            language: lang,
            messages: [{ role: 'user', content: transcript }],
            context: { spaces: spaces.map((space) => ({ id: space.id, name: space.name })) },
          });

          if (isStale(runId)) return;

          if (data.matchedSpaceId) {
            setAutoSelectedSpaceId(data.matchedSpaceId);
            setSelectedSpace(data.matchedSpaceId);
            window.setTimeout(() => setAutoSelectedSpaceId(null), 700);
            return;
          }

          await speakAssistant(data.clarificationMessage || prompts.retrySpace, runId);
        } catch {
          await speakAssistant(prompts.retrySpace, runId);
        }
      }
      return;
    }

    if (step === 2) {
      const now = useAppStore.getState().flow;
      const space = spaces.find((item) => item.id === now.selectedSpaceId);
      if (!space || now.selectedPovId) return;

      await speakAssistant(prompts.step2Guidance, runId);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const transcript = await listenOnce(runId);
        if (isStale(runId)) return;
        if (!transcript) {
          await speakAssistant(prompts.retryPov, runId);
          continue;
        }

        try {
          const data = await agentCall<PovMatcherResult>({
            agentType: 'povMatcher',
            language: lang,
            messages: [{ role: 'user', content: transcript }],
            context: {
              spaceId: space.id,
              povOptions: space.povImages.map((pov) => ({ id: pov.id, label: pov.label })),
            },
          });

          if (isStale(runId)) return;

          if (data.matchedPovId) {
            setAutoSelectedPovId(data.matchedPovId);
            setSelectedPov(data.matchedPovId);
            window.setTimeout(() => setAutoSelectedPovId(null), 700);
            return;
          }

          await speakAssistant(data.clarificationMessage || prompts.retryPov, runId);
        } catch {
          await speakAssistant(prompts.retryPov, runId);
        }
      }
      return;
    }

    if (step === 3) {
      const now = useAppStore.getState().flow;
      // If user already typed something, don't overwrite it
      if (useVoiceStore.getState().userIsTyping || now.promptText.trim()) {
        // User typed a prompt — skip voice input, go straight to confirmation
      } else {
        await speakAssistant(prompts.step3Guidance, runId);
        if (isStale(runId)) return;
        const transcript = await listenOnce(runId);
        if (isStale(runId)) return;

        // Re-check: user may have typed while we were listening
        if (useVoiceStore.getState().userIsTyping) {
          // User started typing — don't overwrite
        } else if (transcript) {
          setPromptText(transcript);
        } else {
          await speakAssistant(prompts.retryPrompt, runId);
          return;
        }
      }

      const latestPrompt = useAppStore.getState().flow.promptText.trim();
      if (!latestPrompt) return;

      // Confirmation: read back the prompt and ask if it's correct
      const confirmQuestion =
        lang === 'ca' ? 'Està bé o vols canviar-ho?' :
        lang === 'es' ? '¿Está bien o quieres cambiarlo?' :
        'Does that sound right, or would you like to change it?';
      const confirmText = `${prompts.step3ConfirmPrefix}: "${latestPrompt}". ${confirmQuestion}`;
      await speakAssistant(confirmText, runId);
      if (isStale(runId)) return;

      for (let confirmAttempt = 0; confirmAttempt < 2; confirmAttempt += 1) {
        const confirmation = await listenOnce(runId);
        if (isStale(runId)) return;

        if (!confirmation) {
          // No response — ask again once, then accept
          if (confirmAttempt === 0) {
            await speakAssistant(confirmQuestion, runId);
            if (isStale(runId)) return;
            continue;
          }
          // Second empty response — accept the prompt as-is
          setFlowStep(SUGGEST_STEP_FOUR);
          return;
        }

        if (isNegative(confirmation, lang)) {
          if (!useVoiceStore.getState().userIsTyping) {
            setPromptText('');
          }
          await speakAssistant(prompts.step3Guidance, runId);
          if (isStale(runId)) return;
          const retryTranscript = await listenOnce(runId);
          if (retryTranscript && !isStale(runId) && !useVoiceStore.getState().userIsTyping) {
            setPromptText(retryTranscript);
          }
          setFlowStep(SUGGEST_STEP_FOUR);
          return;
        }

        // Affirmative or any other response — accept
        setFlowStep(SUGGEST_STEP_FOUR);
        return;
      }
      return;
    }

    if (step === 4) {
      step4ReadyRef.current = false;
      await speakAssistant(prompts.step4Guidance, runId);

      // If user is already typing name/age, skip voice input for this step
      if (useVoiceStore.getState().userIsTyping) {
        step4ReadyRef.current = true;
      } else {
        const transcript = await listenOnce(runId);
        if (isStale(runId)) return;

        // Re-check: user may have started typing while we were listening
        if (transcript && !useVoiceStore.getState().userIsTyping) {
          try {
            const data = await agentCall<InputExtractorResult>({
              agentType: 'inputExtractor',
              language: lang,
              messages: [{ role: 'user', content: transcript }],
            });

            if (isStale(runId)) return;

            // Final check before writing to inputs
            if (!useVoiceStore.getState().userIsTyping) {
              if (data.skipped) {
                setParticipantName('');
                setParticipantAge('');
              } else {
                setParticipantName(data.name ?? '');
                setParticipantAge(data.age ? String(data.age) : '');
              }
            }
          } catch {
            // Keep manual inputs as fallback if extraction fails.
          }
        }
      }

      step4ReadyRef.current = true;

      const updated = useAppStore.getState().flow;
      const hasPersonalInfo = updated.participantName.trim() !== '' || updated.participantAge.trim() !== '';

      if (hasPersonalInfo && !updated.consentGiven) {
        await speakAssistant(prompts.step4ConsentReminder, runId);
        return;
      }

      setFlowStep(SUGGEST_STEP_FIVE);
      return;
    }

    if (step === 5) {
      if (!step5MessageShownRef.current) {
        step5MessageShownRef.current = true;
        addMessage('assistant', prompts.step5Generating);
      }
      return;
    }

    if (step === 6) {
      const proposal = useAppStore.getState().flow.currentProposal;
      if (!proposal) return;
      if (step6SummaryForProposalRef.current === proposal.id) return;
      step6SummaryForProposalRef.current = proposal.id;

      const summary = await composeResponse(
        runId,
        {
          scenario: 'results_summary',
          avgAgentScore: proposal.avgAgentScore,
          keyPoint: getSummarySeed(proposal),
          language: lang,
        },
        prompts.step6FallbackSummary,
      );
      await speakAssistant(summary, runId);
    }
  }, [
    addMessage,
    composeResponse,
    isStale,
    listenOnce,
    setAutoSelectedPovId,
    setAutoSelectedSpaceId,
    setFlowStep,
    setParticipantAge,
    setParticipantName,
    setPromptText,
    setSelectedPov,
    setSelectedSpace,
    speakAssistant,
  ]);

  useEffect(() => {
    if (mode === 'suggest' && previousModeRef.current !== 'suggest') {
      clearMessages();
      setError(null);
      step4ReadyRef.current = false;
      step5MessageShownRef.current = false;
      step6SummaryForProposalRef.current = null;
      setAutoSelectedSpaceId(null);
      setAutoSelectedPovId(null);
    }

    previousModeRef.current = mode;
  }, [clearMessages, mode, setAutoSelectedPovId, setAutoSelectedSpaceId, setError]);

  useEffect(() => {
    const active = mode === 'suggest';
    setIsActive(active);

    if (!active) {
      cancelCurrentIO();
      setActivity('idle');
      setAutoSelectedSpaceId(null);
      setAutoSelectedPovId(null);
      step4ReadyRef.current = false;
    }
  }, [cancelCurrentIO, mode, setActivity, setAutoSelectedPovId, setAutoSelectedSpaceId, setIsActive]);

  useEffect(() => {
    if (mode !== 'suggest') return;
    setCollapsed(shouldCollapseTranscript(flow.step));
  }, [flow.step, mode, setCollapsed]);

  useEffect(() => {
    if (mode !== 'suggest') return;
    if (!shouldAutoAdvanceFromSelection(flow.step)) return;

    if (flow.step === 1 && flow.selectedSpaceId) {
      cancelCurrentIO();
      const timer = window.setTimeout(() => {
        const state = useAppStore.getState();
        if (state.mode === 'suggest' && state.flow.step === 1 && state.flow.selectedSpaceId) {
          state.setFlowStep(SUGGEST_STEP_TWO);
        }
      }, 550);
      return () => window.clearTimeout(timer);
    }

    if (flow.step === 2 && flow.selectedPovId) {
      cancelCurrentIO();
      const timer = window.setTimeout(() => {
        const state = useAppStore.getState();
        if (state.mode === 'suggest' && state.flow.step === 2 && state.flow.selectedPovId) {
          state.setFlowStep(SUGGEST_STEP_THREE);
        }
      }, 550);
      return () => window.clearTimeout(timer);
    }
  }, [cancelCurrentIO, flow.selectedPovId, flow.selectedSpaceId, flow.step, mode]);

  useEffect(() => {
    if (mode !== 'suggest' || flow.step !== 4 || !step4ReadyRef.current) return;

    const hasPersonalInfo = flow.participantName.trim() !== '' || flow.participantAge.trim() !== '';
    if (!hasPersonalInfo || flow.consentGiven) {
      step4ReadyRef.current = false;
      setFlowStep(SUGGEST_STEP_FIVE);
    }
  }, [flow.consentGiven, flow.participantAge, flow.participantName, flow.step, mode, setFlowStep]);

  // Reset userIsTyping flag when flow step changes
  useEffect(() => {
    useVoiceStore.getState().setUserIsTyping(false);
  }, [flow.step]);

  useEffect(() => {
    if (mode !== 'suggest') return;

    runRef.current += 1;
    const runId = runRef.current;

    void runStep(flow.step, runId);

    return () => {
      cancelCurrentIO();
    };
  }, [cancelCurrentIO, flow.step, mode, runStep]);

  useEffect(() => {
    return () => {
      cancelCurrentIO();
      setActivity('idle');
      setIsActive(false);
    };
  }, [cancelCurrentIO, setActivity, setIsActive]);
}


