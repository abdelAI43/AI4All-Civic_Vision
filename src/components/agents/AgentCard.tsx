import type { AgentFeedback } from '../../types';
import './AgentCard.css';

interface Props {
  agent: AgentFeedback;
}

function getScoreColor(score: number): string {
  if (score >= 4) return 'var(--color-green)';
  if (score >= 3) return 'var(--color-amber)';
  return 'var(--color-red)';
}

function getScoreDots(score: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <div
      key={i}
      className={`score-dot ${i < score ? 'active' : ''}`}
      style={i < score ? { backgroundColor: getScoreColor(score) } : undefined}
    />
  ));
}

export function AgentCard({ agent }: Props) {
  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <span className="agent-icon">{agent.icon}</span>
        <span className="agent-name">{agent.name}</span>
        <div className="score-dots">{getScoreDots(agent.score)}</div>
      </div>
      <p className="agent-feedback">{agent.feedback}</p>
      {agent.risks && agent.risks.length > 0 && (
        <div className="agent-section">
          <span className="agent-section-label">Risks</span>
          <ul className="agent-list agent-risks">
            {agent.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {agent.recommendations && agent.recommendations.length > 0 && (
        <div className="agent-section">
          <span className="agent-section-label">Recommendations</span>
          <ul className="agent-list">
            {agent.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {agent.references && agent.references.length > 0 && (
        <div className="agent-section">
          <span className="agent-section-label">Sources</span>
          <ul className="agent-list agent-references">
            {agent.references.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
