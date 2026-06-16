import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { VoiceIndicator } from '../voice/VoiceIndicator';
import type { ParticipantGender } from '../../types';

const GENDER_OPTIONS: { value: ParticipantGender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

function BooleanChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <div className="form-field">
      <span className="form-label">{label}</span>
      <div className="choice-toggle-group" role="group" aria-label={label}>
        <button
          type="button"
          className={`choice-toggle${value === true ? ' selected' : ''}`}
          onClick={() => onChange(value === true ? null : true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={`choice-toggle${value === false ? ' selected' : ''}`}
          onClick={() => onChange(value === false ? null : false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

export function ConfirmStep() {
  const { t } = useTranslation();
  const {
    flow,
    setParticipantName,
    setParticipantAge,
    setParticipantGender,
    setHasChildren,
    setHasPets,
    setHasRestrictedMobility,
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
    if (val !== '' && !/^\d{1,2}$/.test(val)) {
      setAgeError(t('flow.step4.ageError', { defaultValue: 'Please enter an age between 1 and 99.' }));
      return;
    }
    const age = val ? Number(val) : null;
    if (age !== null && (age > 99 || age < 1)) {
      setAgeError(t('flow.step4.ageError', { defaultValue: 'Please enter an age between 1 and 99.' }));
    } else {
      setAgeError('');
    }
  };

  const hasParticipantInfo =
    (flow.participantName?.trim() || '') !== '' ||
    (flow.participantAge?.trim() || '') !== '' ||
    flow.participantGender !== '' ||
    flow.hasChildren !== null ||
    flow.hasPets !== null ||
    flow.hasRestrictedMobility !== null;

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
              {t(`spaces.${space.id}.name`, { defaultValue: space.name })} - {pov.label}
            </p>
            <p className="confirm-prompt-text">"{flow.promptText}"</p>
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

      <div className="confirm-demographics">
        <div className="form-field">
          <label className="form-label" htmlFor="participant-gender">
            Gender
            <span className="form-label-optional">{t('flow.step4.nameOptional')}</span>
          </label>
          <select
            id="participant-gender"
            className="form-input"
            value={flow.participantGender}
            onChange={(e) => {
              setUserIsTyping(true);
              setParticipantGender(e.target.value as ParticipantGender | '');
            }}
          >
            <option value="">Select one</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <BooleanChoice
          label="Do you have children?"
          value={flow.hasChildren}
          onChange={(value) => {
            setUserIsTyping(true);
            setHasChildren(value);
          }}
        />
        <BooleanChoice
          label="Do you have pets?"
          value={flow.hasPets}
          onChange={(value) => {
            setUserIsTyping(true);
            setHasPets(value);
          }}
        />
        <BooleanChoice
          label="Do you use a wheelchair or have restricted mobility?"
          value={flow.hasRestrictedMobility}
          onChange={(value) => {
            setUserIsTyping(true);
            setHasRestrictedMobility(value);
          }}
        />
      </div>

      {hasParticipantInfo && (
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
