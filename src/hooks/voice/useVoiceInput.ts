/**
 * TEMPORARY IMPLEMENTATION — Browser-native Web Speech API.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TEAMMATE: This file will be replaced by your chatbot module.   │
 * │  Your hook must return `UseVoiceInputResult` (see types.ts).    │
 * │  Do not change src/hooks/voice/index.ts or types.ts.           │
 * │  Only replace this file with your implementation.              │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import i18n from '../../i18n';
import type { UseVoiceInputResult } from './types';

const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  ca: 'ca-ES',
  es: 'es-ES',
};

export function useVoiceInput(): UseVoiceInputResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isSupported = useMemo(() => {
    const SR =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ??
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;
    return !!SR;
  }, []);

  const start = useCallback(() => {
    const SR =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ??
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;
    if (!SR) return;

    setError(null);
    setTranscript('');

    const recognition = new SR();
    recognition.lang = LANG_MAP[i18n.language] ?? 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      setTranscript(text);
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(e.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTranscript('');
    setError(null);
  }, [stop]);

  return { isListening, isSupported, transcript, start, stop, reset, error };
}
