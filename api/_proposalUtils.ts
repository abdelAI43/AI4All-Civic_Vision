export type ParticipantGender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';
export type PromptSource = 'original' | 'expert_suggested';

export interface ParticipantInput {
  participantName?: unknown;
  participantAge?: unknown;
  participantGender?: unknown;
  hasChildren?: unknown;
  hasPets?: unknown;
  hasRestrictedMobility?: unknown;
}

export interface NormalizedParticipantInput {
  participantName: string | null;
  participantAge: number | null;
  participantGender: ParticipantGender | null;
  hasChildren: boolean | null;
  hasPets: boolean | null;
  hasRestrictedMobility: boolean | null;
}

const GENDERS = new Set<ParticipantGender>([
  'woman',
  'man',
  'non_binary',
  'prefer_not_to_say',
]);

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function normalizeAge(value: unknown): number | null {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;
  if (!/^\d{1,2}$/.test(raw)) {
    throw new Error('participant_age_check');
  }
  const age = Number(raw);
  if (!Number.isInteger(age) || age < 1 || age > 99) {
    throw new Error('participant_age_check');
  }
  return age;
}

function normalizeGender(value: unknown): ParticipantGender | null {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;
  if (!GENDERS.has(raw as ParticipantGender)) {
    throw new Error('participant_gender_check');
  }
  return raw as ParticipantGender;
}

export function normalizeParticipantInput(input: ParticipantInput): NormalizedParticipantInput {
  return {
    participantName: normalizeOptionalString(input.participantName),
    participantAge: normalizeAge(input.participantAge),
    participantGender: normalizeGender(input.participantGender),
    hasChildren: normalizeOptionalBoolean(input.hasChildren),
    hasPets: normalizeOptionalBoolean(input.hasPets),
    hasRestrictedMobility: normalizeOptionalBoolean(input.hasRestrictedMobility),
  };
}

export function hasParticipantInfo(input: ParticipantInput | NormalizedParticipantInput): boolean {
  const normalized = 'participantGender' in input && typeof input.participantAge !== 'number'
    ? normalizeParticipantInput(input)
    : input as NormalizedParticipantInput;

  return normalized.participantName !== null ||
    normalized.participantAge !== null ||
    normalized.participantGender !== null ||
    normalized.hasChildren !== null ||
    normalized.hasPets !== null ||
    normalized.hasRestrictedMobility !== null;
}

export function assertConsentForParticipantInfo(
  input: ParticipantInput,
  consentGiven: unknown,
): NormalizedParticipantInput {
  const normalized = normalizeParticipantInput(input);
  if (hasParticipantInfo(normalized) && consentGiven !== true) {
    throw new Error('consent_given is required');
  }
  return normalized;
}
