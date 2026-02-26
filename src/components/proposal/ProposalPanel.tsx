import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { spaces } from '../../data/spaces';
import { AgentPanel } from '../agents/AgentPanel';
import { ImageComparison } from './ImageComparison';
import './ProposalPanel.css';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Read-only proposal detail shown when clicking a card in the browse list.
 */
export function ProposalPanel() {
  const { t } = useTranslation();
  const { browseProposal, setBrowseProposal } = useAppStore();

  if (!browseProposal) return null;

  const space = spaces.find((s) => s.id === browseProposal.spaceId);

  // Author line
  let authorLine: string;
  if (browseProposal.participantName && browseProposal.participantAge) {
    authorLine = t('proposal.byLine', {
      name: browseProposal.participantName,
      age: browseProposal.participantAge,
    });
  } else if (browseProposal.participantName) {
    authorLine = t('proposal.byName', { name: browseProposal.participantName });
  } else {
    authorLine = t('proposal.anonymous');
  }

  const handleClose = () => {
    // Go back to the list (browseSpaceId stays set)
    setBrowseProposal(null);
  };

  return (
    <div className="proposal-panel-overlay">
      <div className="proposal-panel">
        {/* Left side: Location + Images */}
        <div className="panel-left">
          {/* Location header */}
          <div className="panel-header">
            {space && <div className="location-badge">{space.type}</div>}
            <h2>
              {space
                ? t(`spaces.${space.id}.name`, { defaultValue: space.name })
                : ''}
            </h2>
            {space && (
              <p className="text-secondary text-sm">
                {t(`spaces.${space.id}.neighborhood`, {
                  defaultValue: space.neighborhood,
                })}
              </p>
            )}
          </div>

          {/* User info */}
          <div className="user-info">
            <div className="user-avatar">
              {(browseProposal.participantName ?? t('proposal.anonymous')).charAt(0)}
            </div>
            <div>
              <span className="user-name">{authorLine}</span>
              <p className="proposal-timestamp">
                {formatTimestamp(browseProposal.createdAt)}
              </p>
            </div>
          </div>

          {/* Proposal prompt */}
          <div className="proposal-prompt">
            <span className="prompt-label">{t('proposal.beforeLabel')}</span>
            <p>&ldquo;{browseProposal.promptText}&rdquo;</p>
          </div>

          {/* Image comparison */}
          <ImageComparison
            originalImage={browseProposal.baseImagePath}
            generatedImage={browseProposal.generatedImageUrl}
            locationName={space?.name ?? ''}
          />
        </div>

        {/* Right side: Agent feedback */}
        <div className="panel-right">
          {/* Close button — positioned inside right panel to avoid overlapping score */}
          <div className="panel-right-header">
            <button
              className="panel-close"
              onClick={handleClose}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
          <AgentPanel feedback={browseProposal.agentFeedback} />
        </div>
      </div>
    </div>
  );
}
