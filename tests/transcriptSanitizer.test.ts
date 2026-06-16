import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeVoiceTranscript } from '../src/services/voice/transcriptSanitizer.ts';

test('removes SRT and WebVTT timestamp noise from transcripts', () => {
  const cleaned = sanitizeVoiceTranscript(`
WEBVTT
00:00:00.000 --> 00:00:02.000
Add shaded benches to the avenue.
00:00:02,000 --> 00:00:03,000
`);

  assert.equal(cleaned, 'Add shaded benches to the avenue.');
});

test('rejects timestamp-only transcripts', () => {
  assert.equal(sanitizeVoiceTranscript('00:00:00,000 --> 00:00:01,200\n00:00:02'), '');
});

test('rejects low-signal captions that are mostly numbers and punctuation', () => {
  assert.equal(sanitizeVoiceTranscript('1 2 3 00:00:00 / / /'), '');
});

test('keeps the words when a timestamp is inline with speech', () => {
  // ASR models frequently prefix the spoken words with a timestamp on the
  // same line. The words must survive — only the timestamp is noise.
  assert.equal(
    sanitizeVoiceTranscript('00:03 add more trees and benches'),
    'add more trees and benches',
  );
  assert.equal(
    sanitizeVoiceTranscript('[00:00:00] More shade please'),
    '[ ] More shade please',
  );
});

test('keeps a normal spoken sentence untouched', () => {
  assert.equal(
    sanitizeVoiceTranscript('I want a green promenade with cafe terraces'),
    'I want a green promenade with cafe terraces',
  );
});
