import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { SpaceSelector } from './SpaceSelector';
import { POVSelector } from './POVSelector';
import { PromptStep } from './PromptStep';
import { ConfirmStep } from './ConfirmStep';
import { GeneratingScreen } from './GeneratingScreen';
import { ResultsView } from './ResultsView';
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

/** Can the user proceed from the current step? */
function useCanProceed(): boolean {
  const { flow } = useAppStore();
  switch (flow.step) {
    case 1: return flow.selectedSpaceId !== null;
    case 2: return flow.selectedPovId !== null;
    case 3: return flow.promptText.trim().length > 0;
    case 4: {
      const hasPersonalInfo = (flow.participantName?.trim() || '') !== '' ||
                              (flow.participantAge?.trim() || '') !== '';
      return hasPersonalInfo ? flow.consentGiven : true;
    }
    default: return false;
  }
}

/** Map step → extra panel class for sizing */
function panelSizeClass(step: FlowStep): string {
  if (step <= 2) return 'flow-panel-wide';
  if (step <= 4) return 'flow-panel-narrow';
  if (step === 5) return 'flow-panel-generating flow-panel-fullscreen';
  return 'flow-panel-results flow-panel-fullscreen';
}

export function SuggestFlow() {
  const { t } = useTranslation();
  const { mode, flow, setFlowStep, resetFlow } = useAppStore();
  const canProceed = useCanProceed();

  // Escape key: go back one step, or close if at step 1
  useEffect(() => {
    if (mode !== 'suggest') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (flow.step === 1) {
          resetFlow();
        } else if (flow.step <= 4) {
          setFlowStep((flow.step - 1) as FlowStep);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, flow.step, resetFlow, setFlowStep]);

  if (mode !== 'suggest') return null;

  const handleNext = () => {
    if (flow.step < 5) {
      setFlowStep((flow.step + 1) as FlowStep);
    }
  };

  const handleBack = () => {
    if (flow.step > 1) {
      setFlowStep((flow.step - 1) as FlowStep);
    }
  };

  const handleSubmit = () => {
    // In Phase 1 this goes straight to the mock generating screen
    setFlowStep(5);
  };

  // Steps 5 & 6 are fullscreen — they manage their own layout
  if (flow.step === 5) {
    return (
      <div className="flow-backdrop" role="dialog" aria-modal="true">
        <div className={`flow-panel ${panelSizeClass(5)}`}>
          <GeneratingScreen />
        </div>
      </div>
    );
  }

  if (flow.step === 6) {
    return (
      <div className="flow-backdrop" role="dialog" aria-modal="true">
        <div className={`flow-panel ${panelSizeClass(6)}`}>
          <ResultsView />
        </div>
      </div>
    );
  }

  // Steps 1–4: standard panel layout with header, scrollable content, footer
  return (
    <div className="flow-backdrop" role="dialog" aria-modal="true">
      <div className={`flow-panel ${panelSizeClass(flow.step)}`}>
        {/* Header */}
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
              ✕
            </button>
          </div>

          {/* Progress dots */}
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

        {/* Scrollable content */}
        <div className="flow-panel-content">
          {flow.step === 1 && <SpaceSelector />}
          {flow.step === 2 && <POVSelector />}
          {flow.step === 3 && <PromptStep />}
          {flow.step === 4 && <ConfirmStep />}
        </div>

        {/* Footer */}
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
      </div>
    </div>
  );
}
