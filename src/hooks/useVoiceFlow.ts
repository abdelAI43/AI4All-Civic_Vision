import { useCallback, useEffect, useRef } from 'react';
import i18n from '../i18n';
import { spaces, povLabelKey } from '../data/spaces';
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
  type VoiceLanguage,
} from '../services/voice/apiClient';
import { getPromptSet, isNegative } from '../services/voice/agents';
import { AudioPlayer } from '../services/voice/audioPlayer';
import { recordAudioOnce } from '../services/voice/audioRecorder';
import { shouldCollapseTranscript, shouldAutoAdvanceFromSelection } from '../services/voice/stateMachine';
import { sanitizeVoiceTranscript } from '../services/voice/transcriptSanitizer';

const SUGGEST_STEP_TWO = 2 as FlowStep;
const SUGGEST_STEP_THREE = 3 as FlowStep;
const SUGGEST_STEP_FOUR = 4 as FlowStep;
const SUGGEST_STEP_FIVE = 5 as FlowStep;

// Describing a proposal takes longer and includes natural pauses, so give the
// prompt step a much longer recording window and a more forgiving silence cutoff
// than the short single-answer steps (space, POV, name/age).
const PROMPT_RECORD_OPTIONS = { maxDurationMs: 25_000, silenceDurationMs: 2_500 };

function toVoiceLanguage(): VoiceLanguage {
  const base = i18n.language.split('-')[0];
  if (base === 'ca' || base === 'es') return base;
  return 'en';
}

function buildResultsSummary(proposal: Proposal, lang: VoiceLanguage): string {
  const score = Number.isFinite(proposal.avgAgentScore) ? proposal.avgAgentScore.toFixed(1) : '0.0';
  if (lang === 'ca') return `La teva proposta ha obtingut ${score} sobre 5. Revisa el feedback a la pantalla.`;
  if (lang === 'es') return `Tu propuesta obtuvo ${score} sobre 5. Revisa la evaluacion en pantalla.`;
  return `Your proposal scored ${score} out of 5. Check the expert feedback on screen.`;
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
    isEnabled,
    setEnabled,
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
    return runId !== runRef.current ||
      useAppStore.getState().mode !== 'suggest' ||
      !useVoiceStore.getState().isEnabled;
  }, []);

  const cancelCurrentIO = useCallback(() => {
    listenAbortRef.current?.abort();
    listenAbortRef.current = null;
    playerRef.current.stopAll();
    setVolumeLevel(0);
  }, [setVolumeLevel]);

  const speakAssistant = useCallback(async (
    text: string,
    runId: number,
    withAudio = true,
    audioKey?: string,
  ) => {
    const trimmed = text.trim();
    if (!trimmed || isStale(runId)) return;

    addMessage('assistant', trimmed);

    if (!withAudio) return;

    setActivity('speaking');
    setError(null);

    try {
      // Try pre-recorded static file first (zero API cost)
      if (audioKey) {
        const url = `/audio/${toVoiceLanguage()}/${audioKey}.wav`;
        const played = await playerRef.current.playUrl(url);
        if (played && !isStale(runId)) return;
        // File missing or failed — fall through to live TTS
      }

      // Fall back to Gemini TTS API
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

  const listenOnce = useCallback(async (
    runId: number,
    recordOptions?: { maxDurationMs?: number; silenceDurationMs?: number },
  ): Promise<string> => {
    if (isStale(runId)) return '';

    const abortController = new AbortController();
    listenAbortRef.current = abortController;
    setActivity('listening');
    setError(null);

    try {
      const recorded = await recordAudioOnce({
        signal: abortController.signal,
        onVolume: setVolumeLevel,
        ...recordOptions,
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
      const trimmed = sanitizeVoiceTranscript(transcript);
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


  const runStep = useCallback(async (step: FlowStep, runId: number) => {
    const lang = toVoiceLanguage();
    const prompts = getPromptSet(lang);
    const currentFlow = useAppStore.getState().flow;
    if (step !== 5) {
      step5MessageShownRef.current = false;
    }

    if (step === 1) {
      if (currentFlow.selectedSpaceId) return;

      await speakAssistant(prompts.step1Greeting, runId, true, 'step1-greeting');
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const transcript = await listenOnce(runId);
        if (isStale(runId)) return;
        if (!transcript) {
          await speakAssistant(prompts.retrySpace, runId, true, 'retry-space');
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

          // Clarification from LLM is dynamic — no audioKey
          await speakAssistant(data.clarificationMessage || prompts.retrySpace, runId);
        } catch {
          await speakAssistant(prompts.retrySpace, runId, true, 'retry-space');
        }
      }
      return;
    }

    if (step === 2) {
      const now = useAppStore.getState().flow;
      const space = spaces.find((item) => item.id === now.selectedSpaceId);
      if (!space || now.selectedPovId) return;

      await speakAssistant(prompts.step2Guidance, runId, true, 'step2-guidance');
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const transcript = await listenOnce(runId);
        if (isStale(runId)) return;
        if (!transcript) {
          await speakAssistant(prompts.retryPov, runId, true, 'retry-pov');
          continue;
        }

        try {
          const data = await agentCall<PovMatcherResult>({
            agentType: 'povMatcher',
            language: lang,
            messages: [{ role: 'user', content: transcript }],
            context: {
              spaceId: space.id,
              povOptions: space.povImages.map((pov) => ({
                id: pov.id,
                label: i18n.t(povLabelKey(pov.id), { defaultValue: pov.label }),
              })),
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
          await speakAssistant(prompts.retryPov, runId, true, 'retry-pov');
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
        await speakAssistant(prompts.step3Guidance, runId, true, 'step3-guidance');
        if (isStale(runId)) return;
        const transcript = await listenOnce(runId, PROMPT_RECORD_OPTIONS);
        if (isStale(runId)) return;

        // Re-check: user may have typed while we were listening
        if (useVoiceStore.getState().userIsTyping) {
          // User started typing — don't overwrite
        } else if (transcript) {
          setPromptText(transcript);
        } else {
          await speakAssistant(prompts.retryPrompt, runId, true, 'retry-prompt');
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
            await speakAssistant(confirmQuestion, runId, true, 'step3-confirm-question');
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
          await speakAssistant(prompts.step3Guidance, runId, true, 'step3-guidance');
          if (isStale(runId)) return;
          const retryTranscript = await listenOnce(runId, PROMPT_RECORD_OPTIONS);
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
      await speakAssistant(prompts.step4Guidance, runId, true, 'step4-guidance');

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
      const hasPersonalInfo =
        updated.participantName.trim() !== '' ||
        updated.participantAge.trim() !== '' ||
        updated.participantGender !== '' ||
        updated.hasChildren !== null ||
        updated.hasPets !== null ||
        updated.hasRestrictedMobility !== null;

      if (hasPersonalInfo && !updated.consentGiven) {
        await speakAssistant(prompts.step4ConsentReminder, runId, true, 'step4-consent');
        return;
      }

      setFlowStep(SUGGEST_STEP_FIVE);
      return;
    }

    if (step === 5) {
      if (!step5MessageShownRef.current) {
        step5MessageShownRef.current = true;
        await speakAssistant(prompts.step5Generating, runId, true, 'step5-generating');
      }
      return;
    }

    if (step === 6) {
      const proposal = useAppStore.getState().flow.currentProposal;
      if (!proposal) return;
      if (step6SummaryForProposalRef.current === proposal.id) return;
      step6SummaryForProposalRef.current = proposal.id;

      const summary = buildResultsSummary(proposal, lang);
      await speakAssistant(summary, runId);
    }
  }, [
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
      // Voice is on by default whenever the suggest flow opens. The user can
      // still turn it off with the toggle; leaving suggest mode disables it.
      setEnabled(true);
    }

    previousModeRef.current = mode;
  }, [clearMessages, mode, setAutoSelectedPovId, setAutoSelectedSpaceId, setEnabled, setError]);

  useEffect(() => {
    if (mode !== 'suggest' && isEnabled) {
      setEnabled(false);
    }
    const active = mode === 'suggest' && isEnabled;
    setIsActive(active);

    if (!active) {
      cancelCurrentIO();
      setActivity('idle');
      setAutoSelectedSpaceId(null);
      setAutoSelectedPovId(null);
      step4ReadyRef.current = false;
    }
  }, [cancelCurrentIO, isEnabled, mode, setActivity, setAutoSelectedPovId, setAutoSelectedSpaceId, setEnabled, setIsActive]);

  useEffect(() => {
    if (mode !== 'suggest' || !isEnabled) return;
    setCollapsed(shouldCollapseTranscript(flow.step));
  }, [flow.step, isEnabled, mode, setCollapsed]);

  useEffect(() => {
    if (mode !== 'suggest' || !isEnabled) return;
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
  }, [cancelCurrentIO, flow.selectedPovId, flow.selectedSpaceId, flow.step, isEnabled, mode]);

  useEffect(() => {
    if (mode !== 'suggest' || !isEnabled || flow.step !== 4 || !step4ReadyRef.current) return;

    const hasPersonalInfo =
      flow.participantName.trim() !== '' ||
      flow.participantAge.trim() !== '' ||
      flow.participantGender !== '' ||
      flow.hasChildren !== null ||
      flow.hasPets !== null ||
      flow.hasRestrictedMobility !== null;
    if (!hasPersonalInfo || flow.consentGiven) {
      step4ReadyRef.current = false;
      setFlowStep(SUGGEST_STEP_FIVE);
    }
  }, [
    flow.consentGiven,
    flow.hasChildren,
    flow.hasPets,
    flow.hasRestrictedMobility,
    flow.participantAge,
    flow.participantGender,
    flow.participantName,
    flow.step,
    isEnabled,
    mode,
    setFlowStep,
  ]);

  // Reset userIsTyping flag when flow step changes
  useEffect(() => {
    useVoiceStore.getState().setUserIsTyping(false);
  }, [flow.step]);

  useEffect(() => {
    if (mode !== 'suggest' || !isEnabled) return;

    runRef.current += 1;
    const runId = runRef.current;

    void runStep(flow.step, runId);

    return () => {
      cancelCurrentIO();
    };
  }, [cancelCurrentIO, flow.step, isEnabled, mode, runStep]);

  useEffect(() => {
    return () => {
      cancelCurrentIO();
      setActivity('idle');
      setIsActive(false);
    };
  }, [cancelCurrentIO, setActivity, setIsActive]);
}


