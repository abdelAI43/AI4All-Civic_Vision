import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { VoiceIndicator } from '../voice/VoiceIndicator';

const MAX_CHARS = 500;
const NEAR_LIMIT = 400;

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
  const voiceError = useVoiceStore((state) => state.error);
  const setUserIsTyping = useVoiceStore((state) => state.setUserIsTyping);
  const [error, setError] = useState('');

  const space = spaces.find((s) => s.id === flow.selectedSpaceId);
  const pov = space?.povImages.find((p) => p.id === flow.selectedPovId);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length > MAX_CHARS) return;
    setUserIsTyping(true);
    setPromptText(val);
    if (error && !hasBlockedContent(val)) setError('');
    if (flow.promptRejectionReason) setPromptRejectionReason(null);
  };

  const handleBlur = () => {
    if (flow.promptText && hasBlockedContent(flow.promptText)) {
      setError(t('flow.step3.errorBlocked'));
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
      {flow.promptRejectionReason && (
        <div className="prompt-rejection-banner" role="alert">
          <div className="prompt-rejection-icon">!</div>
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

      <div className="prompt-textarea-wrapper">
        <textarea
          className={`prompt-textarea${error ? ' has-error' : ''}`}
          value={flow.promptText}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={t('flow.step3.placeholder')}
          rows={6}
          aria-label={t('flow.step3.title')}
        />
      </div>

      <div className={`prompt-char-row ${charClass}`}>
        <VoiceIndicator />
        <span>
          {t('flow.step3.charCount', {
            current: charCount,
            max: MAX_CHARS,
          })}
        </span>
      </div>

      {voiceError && (
        <div className="prompt-voice-hint" role="status">
          {voiceError}
        </div>
      )}

      {error && (
        <div className="prompt-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

