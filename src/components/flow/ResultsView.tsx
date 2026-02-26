import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { ImageComparison } from '../proposal/ImageComparison';
import { AgentPanel } from '../agents/AgentPanel';

/**
 * Step 6 — Results view.
 * Shows the before/after image comparison, prompt text, author info,
 * agent evaluation (radar + cards), and action buttons.
 */
export function ResultsView() {
  const { t } = useTranslation();
  const { flow, resetFlow, setMode } = useAppStore();
  const proposal = flow.currentProposal;

  const space = spaces.find((s) => s.id === flow.selectedSpaceId);

  if (!proposal) return null;

  // Author line
  let authorLine: string;
  if (proposal.participantName && proposal.participantAge) {
    authorLine = t('proposal.byLine', {
      name: proposal.participantName,
      age: proposal.participantAge,
    });
  } else if (proposal.participantName) {
    authorLine = t('proposal.byName', { name: proposal.participantName });
  } else {
    authorLine = t('proposal.anonymous');
  }

  const handleStartOver = () => {
    resetFlow();
    // Re-open the suggest flow immediately
    setMode('suggest');
  };

  const handleClose = () => {
    resetFlow();
  };

  return (
    <div className="results-panel">
      {/* Header */}
      <div className="results-panel-header">
        <h2 className="results-panel-title">{t('flow.step6.title')}</h2>
        <span className="results-shared-badge">
          ✓ {t('flow.step6.sharedBadge')}
        </span>
      </div>

      {/* Body: two-column grid */}
      <div className="results-body">
        {/* Left: image + prompt */}
        <div className="results-left">
          <ImageComparison
            originalImage={proposal.baseImagePath}
            generatedImage={proposal.generatedImageUrl}
            locationName={space?.name ?? ''}
          />

          <div className="results-prompt-box">
            <p className="results-prompt-label">
              {space
                ? t(`spaces.${space.id}.name`, { defaultValue: space.name })
                : ''}
            </p>
            <p className="results-prompt-text">
              &ldquo;{proposal.promptText}&rdquo;
            </p>
            <p className="results-author">{authorLine}</p>
          </div>
        </div>

        {/* Right: agent evaluation */}
        <div className="results-right">
          <AgentPanel feedback={proposal.agentFeedback} />
        </div>
      </div>

      {/* Footer */}
      <div className="results-footer">
        <button className="flow-btn flow-btn-secondary" onClick={handleClose}>
          {t('flow.step6.closeBtn')}
        </button>
        <button className="flow-btn flow-btn-primary" onClick={handleStartOver}>
          {t('flow.step6.startOver')}
        </button>
      </div>
    </div>
  );
}
