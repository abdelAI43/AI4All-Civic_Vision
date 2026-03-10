import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../store/useVoiceStore';

export function VoiceIndicator() {
  const { t } = useTranslation();
  const { activity, volumeLevel } = useVoiceStore();

  const isListening = activity === 'listening';
  const isThinking = activity === 'thinking';
  const isSpeaking = activity === 'speaking';

  const bars = useMemo(() => {
    const level = Math.max(0.1, volumeLevel);
    return [0.35, 0.6, 0.45].map((factor, index) => ({
      key: index,
      scale: Math.max(0.25, Math.min(1, level * (1 + factor))),
    }));
  }, [volumeLevel]);

  if (!isListening && !isThinking && !isSpeaking) return null;

  return (
    <div className="voice-inline-indicator" aria-live="polite">
      <span className={`voice-inline-icon${isListening ? ' listening' : ''}`} aria-hidden="true">
        ??
      </span>
      <span className="voice-inline-label">
        {isListening && t('voice.listening', { defaultValue: 'Listening' })}
        {isThinking && t('voice.thinking', { defaultValue: 'Thinking' })}
        {isSpeaking && t('voice.speaking', { defaultValue: 'Speaking' })}
      </span>
      {isListening && (
        <span className="voice-inline-bars" aria-hidden="true">
          {bars.map((bar) => (
            <span
              key={bar.key}
              className="voice-inline-bar"
              style={{ transform: `scaleY(${bar.scale})` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
