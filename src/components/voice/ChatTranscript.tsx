import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../store/useVoiceStore';

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatTranscript() {
  const { t } = useTranslation();
  const {
    isActive,
    messages,
    activity,
    isCollapsed,
    toggleCollapsed,
  } = useVoiceStore();

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isCollapsed) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isCollapsed, messages.length, activity]);

  const hasMessages = messages.length > 0;
  const isThinking = activity === 'thinking';
  const isListening = activity === 'listening';

  const transcriptTitle = useMemo(
    () => t('voice.transcriptTitle', { defaultValue: 'Voice Transcript' }),
    [t],
  );

  if (!isActive) return null;

  return (
    <div className={`voice-transcript${isCollapsed ? ' voice-transcript--collapsed' : ''}`}>
      <button
        className="voice-transcript-toggle"
        onClick={toggleCollapsed}
        aria-expanded={!isCollapsed}
      >
        {isCollapsed
          ? t('voice.openTranscript', { defaultValue: 'Open Transcript' })
          : t('voice.closeTranscript', { defaultValue: 'Hide Transcript' })}
      </button>

      {!isCollapsed && (
        <div className="voice-transcript-body">
          <div className="voice-transcript-header">
            <span className="voice-transcript-title">{transcriptTitle}</span>
            {isListening && (
              <span className="voice-listening-indicator">
                <span className="voice-listening-dot" />
                {t('voice.listening', { defaultValue: 'Listening' })}
              </span>
            )}
          </div>

          <div className="voice-transcript-messages">
            {!hasMessages && (
              <p className="voice-transcript-empty">
                {t('voice.waiting', { defaultValue: 'Voice assistant is ready.' })}
              </p>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`voice-message voice-message--${message.role === 'assistant' ? 'assistant' : 'user'}`}
              >
                <div className="voice-message-text">{message.text}</div>
                <div className="voice-message-time">{formatTime(message.createdAt)}</div>
              </div>
            ))}

            {isThinking && (
              <div className="voice-message voice-message--assistant">
                <div className="voice-typing-indicator" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
        </div>
      )}
    </div>
  );
}

