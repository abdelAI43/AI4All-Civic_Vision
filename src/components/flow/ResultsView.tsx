import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { ImageComparison } from '../proposal/ImageComparison';
import { AgentPanel } from '../agents/AgentPanel';
import { publishProposal } from '../../services/proposals';
import type { FlowStep, Proposal } from '../../types';

/**
 * Step 6 — Results view.
 * Shows the before/after image comparison, prompt text, author info,
 * agent evaluation (radar + cards), and action buttons.
 */
export function ResultsView({ hideFooter = false }: { hideFooter?: boolean }) {
  const { t } = useTranslation();
  const {
    flow,
    resetFlow,
    setMode,
    setFlowStep,
    setPromptText,
    setOriginalPromptText,
    setCurrentProposal,
  } = useAppStore();
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
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

  const ensurePublished = async (): Promise<Proposal | null> => {
    if (!proposal) return null;
    if (!proposal.isDraft) return proposal;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const published = await publishProposal(proposal);
      setCurrentProposal(published);
      return published;
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Could not publish this proposal.');
      return null;
    } finally {
      setIsPublishing(false);
    }
  };

  const handleStartOver = async () => {
    const published = await ensurePublished();
    if (!published) return;
    resetFlow();
    // Re-open the suggest flow immediately
    setMode('suggest');
  };

  const handleClose = async () => {
    const published = await ensurePublished();
    if (!published) return;
    resetFlow();
  };

  const handleRegenerate = () => {
    const suggestedPrompt = proposal.expertSuggestedPrompt?.trim();
    if (!suggestedPrompt) return;
    setOriginalPromptText(proposal.originalPromptText || proposal.promptText);
    setPromptText(suggestedPrompt);
    setCurrentProposal(null);
    setFlowStep(5 as FlowStep);
  };

  return (
    <div className="results-panel">
      {/* Header — Save & Exit is the deliberate way out (publishes what's shown) */}
      <div className="results-panel-header">
        <div className="results-header-left">
          <button
            className="flow-btn flow-btn-primary results-save-exit"
            type="button"
            onClick={() => void handleClose()}
            disabled={isPublishing}
          >
            {isPublishing ? t('flow.step6.saving') : `✓ ${t('flow.step6.saveExit')}`}
          </button>
          <h2 className="results-panel-title">{t('flow.step6.title')}</h2>
        </div>
        {!proposal.isDraft && (
          <span className="results-shared-badge">
            ✓ {t('flow.step6.sharedBadge')}
          </span>
        )}
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

          {proposal.expertSuggestedPrompt && (
            <div className="results-suggested-prompt">
              <div>
                <p className="results-suggested-label">{t('flow.step6.suggestedLabel')}</p>
                <p className="results-suggested-text">{proposal.expertSuggestedPrompt}</p>
              </div>
              <button
                className="flow-btn flow-btn-primary"
                type="button"
                onClick={handleRegenerate}
                disabled={isPublishing}
              >
                {t('flow.step6.regenerate')}
              </button>
            </div>
          )}
        </div>

        {/* Right: agent evaluation */}
        <div className="results-right">
          <AgentPanel feedback={proposal.agentFeedback} />
        </div>
      </div>

      {/* Footer — hidden when parent renders its own */}
      {!hideFooter && (
        <div className="results-footer">
          {publishError && <p className="results-publish-error">{publishError}</p>}
          {/* Escape hatch: only shown if saving failed, so the user is never trapped */}
          {publishError && (
            <button
              className="flow-btn flow-btn-secondary"
              onClick={resetFlow}
              disabled={isPublishing}
            >
              {t('flow.step6.exitWithoutSaving')}
            </button>
          )}
          <button
            className="flow-btn flow-btn-primary"
            onClick={() => void handleStartOver()}
            disabled={isPublishing}
          >
            {isPublishing ? t('flow.step6.saving') : t('flow.step6.startOver')}
          </button>
        </div>
      )}
    </div>
  );
}
