import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import type { AgentFeedback } from '../../types';
import { useTranslation } from 'react-i18next';
import { AgentCard } from './AgentCard';
import { theme } from '../../styles/theme';
import './AgentPanel.css';

interface Props {
  feedback: AgentFeedback[];
}

export function AgentPanel({ feedback }: Props) {
  const { t } = useTranslation();

  // Prepare radar chart data
  const radarData = feedback.map((f) => ({
    agent: f.name,
    score: f.score,
    fullMark: 5,
  }));

  // Calculate average score
  const avgScore = (feedback.reduce((sum, f) => sum + f.score, 0) / feedback.length).toFixed(1);

  return (
    <div className="agent-panel">
      <div className="agent-panel-header">
        <h3>{t('agents.title')}</h3>
        <div className="avg-score">
          <span className="avg-score-value">{avgScore}</span>
          <span className="avg-score-label">/ 5</span>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="radar-chart-wrapper">
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke={theme.radar.gridStroke} strokeOpacity={0.3} />
            <PolarAngleAxis
              dataKey="agent"
              tick={{
                fontSize: 11,
                fill: theme.colors.textSecondary,
                fontFamily: theme.fonts.primary,
              }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tickCount={6}
              tick={{ fontSize: 9, fill: theme.colors.neutral }}
              axisLine={false}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke={theme.radar.stroke}
              fill={theme.radar.fill}
              fillOpacity={theme.radar.fillOpacity}
              strokeWidth={theme.radar.strokeWidth}
              dot={{
                r: 3,
                fill: theme.radar.fill,
                stroke: theme.colors.white,
                strokeWidth: 1,
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Agent cards */}
      <div className="agent-cards">
        {feedback.map((agent) => (
          <AgentCard key={agent.agentId} agent={agent} />
        ))}
      </div>
    </div>
  );
}
