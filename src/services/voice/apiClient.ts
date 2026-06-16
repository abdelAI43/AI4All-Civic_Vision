export type VoiceLanguage = 'en' | 'ca' | 'es';
export type VoiceAgentType = 'areaMatcher' | 'povMatcher' | 'responseComposer' | 'inputExtractor';

export interface AreaMatcherResult {
  matchedSpaceId: string | null;
  confidence: number;
  clarificationMessage: string;
}

export interface PovMatcherResult {
  matchedPovId: string | null;
  confidence: number;
  clarificationMessage: string;
}

export interface ResponseComposerResult {
  spokenText: string;
}

export interface InputExtractorResult {
  name: string | null;
  age: number | null;
  skipped: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? `Request failed: ${response.status}`);
  }

  return json.data;
}

export async function transcribeAudio(params: {
  audioBase64: string;
  mimeType: string;
  language: VoiceLanguage;
}): Promise<string> {
  const data = await postJson<{ transcript: string }>('/api/voice/transcribe', params);
  return data.transcript ?? '';
}

export async function generateSpeech(params: {
  text: string;
  language: VoiceLanguage;
  voiceName?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  return postJson<{ audioBase64: string; mimeType: string }>('/api/voice/speak', params);
}

export async function agentCall<T>(params: {
  agentType: VoiceAgentType;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  context?: Record<string, unknown>;
  language: VoiceLanguage;
}): Promise<T> {
  return postJson<T>('/api/voice/agent', params as unknown as Record<string, unknown>);
}
