import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { SpaceSelector } from './SpaceSelector';
import { POVSelector } from './POVSelector';
import { PromptStep } from './PromptStep';
import { ConfirmStep } from './ConfirmStep';
import { GeneratingScreen } from './GeneratingScreen';
import { ResultsView } from './ResultsView';
import { ChatTranscript } from '../voice/ChatTranscript';
import { useVoiceFlow } from '../../hooks/useVoiceFlow';
import type { FlowStep } from '../../types';

const STEP_TITLES: Record<number, string> = {
  1: 'flow.step1.title',
  2: 'flow.step2.title',
  3: 'flow.step3.title',
  4: 'flow.step4.title',
};

const STEP_SUBTITLES: Record<number, string> = {
  1: 'flow.step1.subtitle',
  2: 'flow.step2.subtitle',
  3: 'flow.step3.subtitle',
  4: 'flow.step4.subtitle',
};

function useCanProceed(): boolean {
  const { flow } = useAppStore();
  switch (flow.step) {
    case 1: return flow.selectedSpaceId !== null;
    case 2: return flow.selectedPovId !== null;
    case 3: return flow.promptText.trim().length > 0;
    case 4: {
      if (flow.participantAge.trim()) {
        const age = parseInt(flow.participantAge, 10);
        if (Number.isNaN(age) || age < 1 || age > 99) return false;
      }
      const hasPersonalInfo = (flow.participantName?.trim() || '') !== '' ||
                              (flow.participantAge?.trim() || '') !== '';
      return hasPersonalInfo ? flow.consentGiven : true;
    }
    default: return false;
  }
}

function panelSizeClass(step: FlowStep): string {
  if (step <= 2) return 'flow-panel-wide';
  if (step <= 4) return 'flow-panel-narrow';
  if (step === 5) return 'flow-panel-generating flow-panel-fullscreen';
  return 'flow-panel-results flow-panel-fullscreen';
}

export function SuggestFlow() {
  const { t } = useTranslation();
  const { mode, flow, setFlowStep, resetFlow, setSelectedSpace, setSelectedPov, setMode } = useAppStore();
  const canProceed = useCanProceed();

  useVoiceFlow();

  useEffect(() => {
    if (mode !== 'suggest') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (flow.step === 5) {
          // Don't close during generation
          return;
        }
        if (flow.step === 1 || flow.step === 6) {
          resetFlow();
        } else if (flow.step <= 4) {
          if (flow.step === 2) setSelectedSpace(null);
          else if (flow.step === 3) setSelectedPov(null);
          setFlowStep((flow.step - 1) as FlowStep);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, flow.step, resetFlow, setFlowStep, setSelectedSpace, setSelectedPov]);

  // Close when clicking the backdrop (not the panel itself)
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && flow.step !== 5) {
      resetFlow();
    }
  }, [flow.step, resetFlow]);

  if (mode !== 'suggest') return null;

  const handleNext = () => {
    if (flow.step < 5) {
      setFlowStep((flow.step + 1) as FlowStep);
    }
  };

  const handleBack = () => {
    if (flow.step === 2) {
      // Clear space (and POV) so the user can re-pick without auto-advance
      setSelectedSpace(null);
    } else if (flow.step === 3) {
      // Clear POV so the user can re-pick
      setSelectedPov(null);
    }
    if (flow.step > 1) {
      setFlowStep((flow.step - 1) as FlowStep);
    }
  };

  const handleSubmit = () => {
    setFlowStep(5);
  };

  if (flow.step === 5) {
    return (
      <div className="flow-backdrop" role="dialog" aria-modal="true" onClick={handleBackdropClick}>
        <div className={`flow-panel ${panelSizeClass(5)}`}>
          <div className="flow-panel-full-content">
            <GeneratingScreen />
          </div>
          <ChatTranscript />
        </div>
      </div>
    );
  }

  if (flow.step === 6) {
    const handleClose = () => resetFlow();
    const handleStartOver = () => { resetFlow(); setMode('suggest'); };

    return (
      <div className="flow-backdrop" role="dialog" aria-modal="true" onClick={handleBackdropClick}>
        <div className={`flow-panel ${panelSizeClass(6)}`}>
          <div className="flow-panel-full-content">
            <ResultsView hideFooter />
          </div>
          <ChatTranscript />
          <div className="results-footer">
            <button className="flow-btn flow-btn-secondary" onClick={handleClose}>
              {t('flow.step6.closeBtn')}
            </button>
            <button className="flow-btn flow-btn-primary" onClick={handleStartOver}>
              {t('flow.step6.startOver')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-backdrop" role="dialog" aria-modal="true">
      <div className={`flow-panel ${panelSizeClass(flow.step)}`}>
        <div className="flow-panel-header">
          <div className="flow-panel-header-row">
            <div>
              <h2 className="flow-panel-title">{t(STEP_TITLES[flow.step])}</h2>
              <p className="flow-panel-subtitle">{t(STEP_SUBTITLES[flow.step])}</p>
            </div>
            <button
              className="flow-close-btn"
              onClick={resetFlow}
              aria-label={t('common.close')}
            >
              x
            </button>
          </div>

          <div className="flow-progress" aria-hidden="true">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`flow-progress-dot${
                  s === flow.step ? ' active' : s < flow.step ? ' done' : ''
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flow-panel-content">
          {flow.step === 1 && <SpaceSelector />}
          {flow.step === 2 && <POVSelector />}
          {flow.step === 3 && <PromptStep />}
          {flow.step === 4 && <ConfirmStep />}
        </div>

        <div className="flow-panel-footer">
          {flow.step > 1 && (
            <button className="flow-btn flow-btn-secondary" onClick={handleBack}>
              {t('common.back')}
            </button>
          )}

          {flow.step < 4 ? (
            <button
              className="flow-btn flow-btn-primary"
              onClick={handleNext}
              disabled={!canProceed}
            >
              {t('common.continue')}
            </button>
          ) : (
            <button
              className="flow-btn flow-btn-primary"
              onClick={handleSubmit}
              disabled={!canProceed}
            >
              {t('flow.step4.submitBtn')}
            </button>
          )}
        </div>

        <ChatTranscript />
      </div>
    </div>
  );
}
