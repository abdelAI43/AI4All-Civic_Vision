/**
 * WaveformVisualizer — shows audio input level as animated bars.
 * Pure visual feedback for the user that their voice is being captured.
 */

import { useMemo } from 'react';
import './WaveformVisualizer.css';

interface Props {
  volumeLevel: number; // 0-1
  barCount?: number;
}

export function WaveformVisualizer({ volumeLevel, barCount = 24 }: Props) {
  // Generate random offset multipliers once (stable across renders)
  const offsets = useMemo(
    () => Array.from({ length: barCount }, () => 0.3 + Math.random() * 0.7),
    [barCount],
  );

  return (
    <div className="waveform" role="img" aria-label="Audio waveform visualization">
      {offsets.map((offset, i) => {
        // Create a wave pattern: center bars are taller, edges shorter
        const centerFactor = 1 - Math.abs((i - barCount / 2) / (barCount / 2));
        const height = Math.max(4, volumeLevel * 80 * offset * (0.3 + centerFactor * 0.7));

        return (
          <div
            key={i}
            className="waveform-bar"
            style={{
              height: `${height}px`,
              animationDelay: `${i * 30}ms`,
            }}
          />
        );
      })}
      <span className="waveform-label">Listening...</span>
    </div>
  );
}
