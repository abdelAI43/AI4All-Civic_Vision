// Matches an SRT/WebVTT timestamp token anywhere in a line (global), e.g.
// "00:03", "00:00:02,000", or a full "00:00:00.000 --> 00:00:02.000" cue.
// Used to STRIP the timestamp while preserving any spoken words on the same line.
const TIMESTAMP_TOKEN =
  /\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?(?:\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?)?/g;

export function sanitizeVoiceTranscript(input: string): string {
  const compact = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.toUpperCase() !== 'WEBVTT')
    .filter((line) => !/^\d+$/.test(line))          // SRT cue numbers
    .map((line) => line.replace(TIMESTAMP_TOKEN, ' ')) // strip timestamps, keep words
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!compact) return '';

  const letters = compact.match(/\p{L}/gu)?.length ?? 0;
  const signalRatio = letters / compact.length;
  if (letters < 3 || signalRatio < 0.35) return '';

  return compact;
}
