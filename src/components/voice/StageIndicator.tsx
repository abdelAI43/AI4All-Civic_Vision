/**
 * StageIndicator — shows conversation progress as a horizontal step bar.
 */

import type { ConversationStage } from '../../services/conversation/types';
import './StageIndicator.css';

interface Props {
  stage: ConversationStage;
}

const STAGES: { key: ConversationStage[]; label: string }[] = [
  { key: ['welcome', 'area_select'], label: 'Choose Area' },
  { key: ['area_confirm', 'proposal_input'], label: 'Describe Vision' },
  { key: ['proposal_confirm', 'generating'], label: 'Confirm' },
  { key: ['result'], label: 'Result' },
];

function getStageIndex(stage: ConversationStage): number {
  return STAGES.findIndex((s) => s.key.includes(stage));
}

export function StageIndicator({ stage }: Props) {
  if (stage === 'idle' || stage === 'error') return null;

  const currentIndex = getStageIndex(stage);

  return (
    <div className="stage-indicator">
      {STAGES.map((s, i) => (
        <div
          key={s.label}
          className={`stage-step ${i < currentIndex ? 'completed' : ''} ${i === currentIndex ? 'active' : ''}`}
        >
          <div className="stage-dot" />
          <span className="stage-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
