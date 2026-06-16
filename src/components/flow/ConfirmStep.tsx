import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { VoiceIndicator } from '../voice/VoiceIndicator';

export function ConfirmStep() {
  const { t } = useTranslation();
  const {
    flow,
    setParticipantName,
    setParticipantAge,
    setConsentGiven,
  } = useAppStore();
  const setUserIsTyping = useVoiceStore((state) => state.setUserIsTyping);

  const [ageError, setAgeError] = useState('');

  const space = spaces.find((s) => s.id === flow.selectedSpaceId);
  const pov = space?.povImages.find((p) => p.id === flow.selectedPovId);

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUserIsTyping(true);
    setParticipantAge(val);
    if (val !== '' && (parseInt(val, 10) > 99 || parseInt(val, 10) < 1)) {
      setAgeError(t('flow.step4.ageError', { defaultValue: 'Please enter an age between 1 and 99.' }));
    } else {
      setAgeError('');
    }
  };

  return (
    <div className="confirm-form">
      {space && pov && (
        <div className="confirm-summary">
          <img
            className="confirm-summary-img"
            src={pov.path}
            alt={pov.label}
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.4'; }}
          />
          <div>
            <p className="confirm-summary-meta">
              {t(`spaces.${space.id}.name`, { defaultValue: space.name })} � {pov.label}
            </p>
            <p className="confirm-prompt-text">�{flow.promptText}�</p>
          </div>
        </div>
      )}

      <VoiceIndicator />

      <div className="confirm-row">
        <div className="form-field">
          <label className="form-label" htmlFor="participant-name">
            {t('flow.step4.nameLabel')}
            <span className="form-label-optional">{t('flow.step4.nameOptional')}</span>
          </label>
          <input
            id="participant-name"
            type="text"
            className="form-input"
            placeholder={t('flow.step4.namePlaceholder')}
            value={flow.participantName}
            onChange={(e) => { setUserIsTyping(true); setParticipantName(e.target.value); }}
            maxLength={60}
            autoComplete="given-name"
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="participant-age">
            {t('flow.step4.ageLabel')}
            <span className="form-label-optional">{t('flow.step4.ageOptional')}</span>
          </label>
          <input
            id="participant-age"
            type="number"
            className={`form-input${ageError ? ' has-error' : ''}`}
            placeholder={t('flow.step4.agePlaceholder')}
            value={flow.participantAge}
            onChange={handleAgeChange}
            min={1}
            max={99}
          />
          {ageError && (
            <p className="form-field-error">{ageError}</p>
          )}
        </div>
      </div>

      {((flow.participantName?.trim() || '') !== '' ||
        (flow.participantAge?.trim() || '') !== '') && (
        <div className={`consent-area${flow.consentGiven ? ' checked' : ''}`}>
          <label className="consent-checkbox-row">
            <input
              className="consent-checkbox"
              type="checkbox"
              checked={flow.consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              aria-required="true"
            />
            <span className="consent-label">{t('flow.step4.consentLabel')}</span>
          </label>
          <p className="privacy-note">{t('flow.step4.privacyNote')}</p>
        </div>
      )}
    </div>
  );
}
