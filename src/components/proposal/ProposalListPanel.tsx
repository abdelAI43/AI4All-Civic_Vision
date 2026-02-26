import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { spaces } from '../../data/spaces';
import { supabase } from '../../lib/supabase';
import type { AgentFeedback, Proposal } from '../../types';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreColor(score: number): string {
  if (score >= 4) return 'var(--color-green)';
  if (score >= 3) return 'var(--color-amber)';
  return 'var(--color-red)';
}

/** Tiny inline SVG radar — no Recharts, just 5-axis polygon */
function MiniRadar({ feedback }: { feedback: AgentFeedback[] }) {
  const size = 68;
  const cx = size / 2;
  const cy = size / 2;
  const r = 26;

  const angles = feedback.map((_, i) => ((2 * Math.PI) / 5) * i - Math.PI / 2);
  const gridPts = angles
    .map((a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
    .join(' ');
  const dataPts = feedback
    .map((f, i) => {
      const s = (f.score / 5) * r;
      return `${cx + s * Math.cos(angles[i])},${cy + s * Math.sin(angles[i])}`;
    })
    .join(' ');

  return (
    <svg
      className="browse-card-radar"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <polygon
        points={gridPts}
        fill="none"
        stroke="var(--color-neutral)"
        strokeWidth="1"
        opacity="0.35"
      />
      <polygon
        points={dataPts}
        fill="var(--color-accent)"
        fillOpacity="0.25"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ProposalCard({ proposal, onClick }: { proposal: Proposal; onClick: () => void }) {
  const { t } = useTranslation();

  const authorLine = proposal.participantName
    ? proposal.participantAge
      ? `${proposal.participantName}, ${proposal.participantAge}`
      : proposal.participantName
    : t('proposal.anonymous');

  const promptExcerpt =
    proposal.promptText.length > 80
      ? proposal.promptText.slice(0, 80).trimEnd() + '…'
      : proposal.promptText;

  return (
    <button className="browse-card" onClick={onClick} type="button">
      <div className="browse-card-image-wrap">
        <img
          className="browse-card-image"
          src={proposal.generatedImageUrl || proposal.baseImagePath}
          alt={proposal.promptText.slice(0, 60)}
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
        />
      </div>
      <div className="browse-card-info">
        <div className="browse-card-top-row">
          <span className="browse-card-author">{authorLine}</span>
          <span
            className="browse-card-score"
            style={{ background: scoreColor(proposal.avgAgentScore) }}
          >
            {proposal.avgAgentScore.toFixed(1)}
          </span>
        </div>
        <p className="browse-card-prompt">&ldquo;{promptExcerpt}&rdquo;</p>
        <p className="browse-card-timestamp">{formatTimestamp(proposal.createdAt)}</p>
      </div>
      <MiniRadar feedback={proposal.agentFeedback} />
    </button>
  );
}

/** Map a raw Supabase proposals row (with nested agent_evaluations) to Proposal */
function rowToProposal(row: Record<string, unknown>): Proposal {
  const evals = (row.agent_evaluations as Record<string, unknown>[] | null) ?? [];
  return {
    id: row.id as string,
    spaceId: row.space_id as string,
    povId: row.pov_id as string,
    promptText: row.prompt_text as string,
    language: row.language as 'en' | 'ca' | 'es',
    baseImagePath: row.base_image_path as string,
    generatedImageUrl: row.generated_image_url as string,
    avgAgentScore: parseFloat(String(row.avg_agent_score ?? 0)),
    agentFeedback: evals.map((e) => ({
      agentId: e.agent_id as string,
      name: e.agent_name as string,
      icon: e.agent_icon as string,
      score: e.score as number,
      feedback: e.feedback as string,
    })),
    participantName: (row.participant_name as string | null) ?? undefined,
    participantAge: (row.participant_age as number | null) ?? undefined,
    consentGiven: row.consent_given as boolean,
    status: row.status as Proposal['status'],
    createdAt: row.created_at as string,
  };
}

/**
 * Scrollable panel listing all proposals for the selected space.
 * Fetches live from Supabase (anon key — only consented+complete proposals).
 */
export function ProposalListPanel() {
  const { t } = useTranslation();
  const { browseSpaceId, setBrowseSpaceId, setBrowseProposal } = useAppStore();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  // Track which spaceId the current proposals belong to — derived loading flag
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = loadedFor !== browseSpaceId;

  useEffect(() => {
    if (!browseSpaceId) return;

    let cancelled = false;

    supabase
      .from('proposals')
      .select('*, agent_evaluations(agent_id, agent_name, agent_icon, score, feedback)')
      .eq('space_id', browseSpaceId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setProposals(data ? data.map((row) => rowToProposal(row as Record<string, unknown>)) : []);
        setLoadedFor(browseSpaceId);
      });

    return () => { cancelled = true; };
  }, [browseSpaceId]);

  if (!browseSpaceId) return null;

  const space = spaces.find((s) => s.id === browseSpaceId);
  if (!space) return null;

  return (
    <div className="browse-list-overlay">
      <div className="browse-list-panel">
        {/* Header */}
        <div className="browse-list-header">
          <div>
            <div className="location-badge">{space.type}</div>
            <h2 className="browse-list-title">
              {t(`spaces.${space.id}.name`, { defaultValue: space.name })}
            </h2>
            <p className="browse-list-subtitle">
              {t(`spaces.${space.id}.neighborhood`, { defaultValue: space.neighborhood })}
            </p>
          </div>
          <button
            className="flow-close-btn"
            onClick={() => setBrowseSpaceId(null)}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Scrollable cards */}
        <div className="browse-list-body">
          {loading ? (
            <p className="browse-list-empty">…</p>
          ) : proposals.length === 0 ? (
            <p className="browse-list-empty">{t('map.browseHint')}</p>
          ) : (
            proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onClick={() => setBrowseProposal(p)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
