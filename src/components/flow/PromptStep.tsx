import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { useVoiceInput } from '../../hooks/voice';

const MAX_CHARS = 500;
const NEAR_LIMIT = 400;

/* Basic client-side content blocklist — Layer 1 guardrail */
const BLOCKED_TERMS = [
  'violence', 'violent', 'weapon', 'gun', 'bomb', 'kill', 'murder', 'dead',
  'nude', 'naked', 'sexual', 'porn', 'xxx', 'racist', 'racism', 'nazi',
  'hate', 'terror', 'terrorist',
];

function hasBlockedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_TERMS.some((term) => lower.includes(term));
}

export function PromptStep() {
  const { t } = useTranslation();
  const { flow, setPromptText, setPromptRejectionReason } = useAppStore();
  const { isListening, isSupported, transcript, start, stop } = useVoiceInput();
  const [error, setError] = useState('');

  const space = spaces.find((s) => s.id === flow.selectedSpaceId);
  const pov = space?.povImages.find((p) => p.id === flow.selectedPovId);

  /* Append voice transcript to existing text */
  useEffect(() => {
    if (transcript) {
      setPromptText(transcript);
    }
  }, [transcript, setPromptText]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length > MAX_CHARS) return;
    setPromptText(val);
    if (error && !hasBlockedContent(val)) setError('');
    // Dismiss the rejection banner as soon as the user edits their prompt
    if (flow.promptRejectionReason) setPromptRejectionReason(null);
  };

  const handleBlur = () => {
    if (flow.promptText && hasBlockedContent(flow.promptText)) {
      setError(t('flow.step3.errorBlocked'));
    }
  };

  const toggleMic = () => {
    if (isListening) {
      stop();
    } else {
      setPromptText('');
      start();
    }
  };

  const charCount = flow.promptText.length;
  const charClass =
    charCount >= MAX_CHARS
      ? 'at-limit'
      : charCount >= NEAR_LIMIT
      ? 'near-limit'
      : '';

  return (
    <>
      {/* Rejection banner — shown when the AI validator sent the user back */}
      {flow.promptRejectionReason && (
        <div className="prompt-rejection-banner" role="alert">
          <div className="prompt-rejection-icon">⚠️</div>
          <div className="prompt-rejection-body">
            <p className="prompt-rejection-title">
              {t('flow.step3.rejectionTitle', { defaultValue: 'Your proposal needs revision' })}
            </p>
            <p className="prompt-rejection-reason">{flow.promptRejectionReason}</p>
            <p className="prompt-rejection-hint">
              {t('flow.step3.rejectionHint', { defaultValue: 'Please edit your text below and try again.' })}
            </p>
          </div>
        </div>
      )}

      {/* Space + POV preview — full-width hero image */}
      {space && pov && (
        <div className="prompt-preview">
          <div className="prompt-preview-img-wrap">
            <img
              className="prompt-preview-img"
              src={pov.path}
              alt={pov.label}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.4'; }}
            />
            <div className="prompt-preview-overlay">
              <div className="location-badge">{space.type}</div>
              <h4>{t(`spaces.${space.id}.name`, { defaultValue: space.name })}</h4>
              <p>{pov.label}</p>
            </div>
          </div>
        </div>
      )}

      {/* Textarea + mic */}
      <div className="prompt-textarea-wrapper">
        <textarea
          className={`prompt-textarea${error ? ' has-error' : ''}`}
          value={flow.promptText}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={t('flow.step3.placeholder')}
          rows={6}
          aria-label={t('flow.step3.title')}
          disabled={isListening}
        />

        {isSupported && (
          <button
            className={`prompt-mic-btn${isListening ? ' listening' : ''}`}
            onClick={toggleMic}
            aria-label={isListening ? t('common.close') : t('flow.step3.micHint')}
            title={isListening ? 'Stop recording' : t('flow.step3.micHint')}
          >
            {isListening ? '⏹' : '🎙'}
          </button>
        )}
      </div>

      {/* Character counter */}
      <div className={`prompt-char-row ${charClass}`}>
        <span>
          {isListening && (
            <span style={{ color: 'var(--color-red)', marginRight: 'var(--space-2)' }}>
              ● Recording…
            </span>
          )}
          {!isSupported && (
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {t('errors.voiceNotSupported')}
            </span>
          )}
        </span>
        <span>
          {t('flow.step3.charCount', {
            current: charCount,
            max: MAX_CHARS,
          })}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="prompt-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
