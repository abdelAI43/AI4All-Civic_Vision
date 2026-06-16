import assert from 'node:assert/strict';
import test from 'node:test';

import { hasParticipantInfo, normalizeParticipantInput } from '../api/_proposalUtils.ts';

test('participant info requires consent when any optional demographic field is answered', () => {
  assert.equal(hasParticipantInfo({ hasChildren: false }), true);
  assert.equal(hasParticipantInfo({ hasPets: false }), true);
  assert.equal(hasParticipantInfo({ hasRestrictedMobility: false }), true);
  assert.equal(hasParticipantInfo({ participantGender: 'prefer_not_to_say' }), true);
});

test('empty participant fields remain unanswered instead of becoming false', () => {
  const normalized = normalizeParticipantInput({
    participantName: '   ',
    participantAge: '',
    participantGender: '',
    hasChildren: undefined,
    hasPets: null,
    hasRestrictedMobility: undefined,
  });

  assert.deepEqual(normalized, {
    participantName: null,
    participantAge: null,
    participantGender: null,
    hasChildren: null,
    hasPets: null,
    hasRestrictedMobility: null,
  });
});

test('participant age only accepts whole numbers from 1 to 99', () => {
  assert.equal(normalizeParticipantInput({ participantAge: '28' }).participantAge, 28);
  assert.throws(() => normalizeParticipantInput({ participantAge: '1e2' }), /participant_age_check/);
  assert.throws(() => normalizeParticipantInput({ participantAge: '0' }), /participant_age_check/);
  assert.throws(() => normalizeParticipantInput({ participantAge: '120' }), /participant_age_check/);
});
