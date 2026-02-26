/**
 * Stable interface for voice input.
 * This type must NOT change — both the current implementation and
 * your teammate's replacement must return this shape.
 */
export interface UseVoiceInputResult {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}
