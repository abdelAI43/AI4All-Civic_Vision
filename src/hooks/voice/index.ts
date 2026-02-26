/**
 * Voice input public API — import from here, not from sub-files.
 *
 * To swap in your teammate's implementation:
 *   1. Drop their hook file into this folder
 *   2. Change the import below to point to their file
 *   3. Make sure it still returns `UseVoiceInputResult`
 */
export type { UseVoiceInputResult } from './types';
export { useVoiceInput } from './useVoiceInput';
