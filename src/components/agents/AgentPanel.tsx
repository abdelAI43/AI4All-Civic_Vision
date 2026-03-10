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

/** Custom SVG tick for the radar chart — wraps 2-word names to two lines
 *  and pushes the topmost label further away from the chart. */
function RadarTick(props: {
  x: number;
  y: number;
  cy: number;
  payload: { value: string };
  textAnchor: string;
}) {
  const { x, y, cy, payload, textAnchor } = props;
  const words = payload.value.split(' ');
  const line1 = words[0] ?? '';
  const line2 = words.slice(1).join(' ');

  // Extra upward nudge for the label sitting above the chart centre
  const isTop = y < cy - 10;
  const yBase = y + (isTop ? -10 : 0);

  return (
    <text
      x={x}
      y={yBase}
      textAnchor={textAnchor}
      fill={theme.colors.textSecondary}
      fontSize={10}
      fontFamily={theme.fonts.primary}
    >
      <tspan x={x} dy="-7">{line1}</tspan>
      {line2 && <tspan x={x} dy="14">{line2}</tspan>}
    </text>
  );
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
        <ResponsiveContainer width="100%" height={250}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="60%">
            <PolarGrid stroke={theme.radar.gridStroke} strokeOpacity={0.3} />
            <PolarAngleAxis
              dataKey="agent"
              tick={(props) => <RadarTick {...(props as Parameters<typeof RadarTick>[0])} />}
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
