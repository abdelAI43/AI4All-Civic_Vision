import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { fetchVoteCandidates, submitProposalVote } from '../../services/proposals';
import type { AgentFeedback, Proposal } from '../../types';
import { ImageComparison } from '../proposal/ImageComparison';

function averageScore(feedback: AgentFeedback[]): string {
  if (feedback.length === 0) return '0.0';
  return (feedback.reduce((sum, item) => sum + item.score, 0) / feedback.length).toFixed(1);
}

function MiniRadar({ feedback }: { feedback: AgentFeedback[] }) {
  const safeFeedback = feedback.length > 0 ? feedback.slice(0, 5) : [
    { agentId: 'a', name: 'Reg.', icon: '', score: 3, feedback: '' },
    { agentId: 'b', name: 'Safety', icon: '', score: 3, feedback: '' },
    { agentId: 'c', name: 'Social', icon: '', score: 3, feedback: '' },
    { agentId: 'd', name: 'Heritage', icon: '', score: 3, feedback: '' },
    { agentId: 'e', name: 'Mobility', icon: '', score: 3, feedback: '' },
  ];
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 62;
  const angles = safeFeedback.map((_, i) => ((2 * Math.PI) / safeFeedback.length) * i - Math.PI / 2);
  const grid = angles.map((a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`).join(' ');
  const points = safeFeedback
    .map((agent, i) => {
      const scoreRadius = (agent.score / 5) * r;
      return `${cx + scoreRadius * Math.cos(angles[i])},${cy + scoreRadius * Math.sin(angles[i])}`;
    })
    .join(' ');

  return (
    <svg className="generation-vote-radar" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <polygon points={grid} fill="none" stroke="var(--color-neutral)" strokeWidth="2" opacity="0.45" />
      <polygon points={points} fill="var(--color-accent)" fillOpacity="0.28" stroke="var(--color-accent)" strokeWidth="3" />
    </svg>
  );
}

export function GenerationVotingPanel() {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<Proposal[]>([]);
  const [current, setCurrent] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const space = useMemo(
    () => spaces.find((item) => item.id === current?.spaceId),
    [current?.spaceId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchVoteCandidates(6)
      .then((items) => {
        if (cancelled) return;
        setQueue(items.slice(1));
        setCurrent(items[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const advance = async () => {
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      return;
    }
    const items = await fetchVoteCandidates(6);
    setQueue(items.slice(1));
    setCurrent(items[0] ?? null);
  };

  const handleVote = async (score: number) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await submitProposalVote(current.id, score);
      await advance();
    } catch {
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !current) return null;

  return (
    <section className="generation-vote-panel" aria-label={t('voting.ariaPanel')}>
      <div className="generation-vote-media">
        <ImageComparison
          originalImage={current.baseImagePath}
          generatedImage={current.generatedImageUrl}
          locationName={space?.name ?? ''}
        />
        <div className="generation-vote-band">
          <p className="generation-vote-question">
            {t('voting.question')}
          </p>
          <div className="generation-vote-controls">
            <button className="generation-vote-skip" onClick={handleSkip} disabled={submitting}>
              {t('voting.skip')}
            </button>
            <div className="generation-vote-stars" aria-label={t('voting.ariaStars')}>
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  className="generation-vote-star"
                  onClick={() => void handleVote(score)}
                  disabled={submitting}
                  aria-label={t('voting.starLabel', { score })}
                >
                  ☆
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <aside className="generation-vote-details">
        <p className="generation-vote-location">{space?.name ?? current.spaceId}</p>
        <h3 className="generation-vote-title">{current.promptText}</h3>
        <div className="generation-vote-score-row">
          <span className="generation-vote-score">{t('voting.expertScore', { score: averageScore(current.agentFeedback) })}</span>
          <span className="generation-vote-note">{t('voting.summaryNote')}</span>
        </div>
        <p className="generation-vote-copy">
          {t('voting.helper')}
        </p>
        <div className="generation-vote-radar-box">
          <MiniRadar feedback={current.agentFeedback} />
        </div>
      </aside>
    </section>
  );
}
