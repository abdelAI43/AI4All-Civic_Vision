/**
 * API Client — single gateway to the proxy backend.
 * No API keys in the frontend. All calls go through localhost:3001.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

/* ---- Types for API responses ---- */

export interface TranscriptionResult {
  text: string;
  language: string;
}

export interface LLMResponse {
  content: string;
}

export interface ImageGenResult {
  id: string;
  status: string;
  output?: string | string[];
  error?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/* ---- Speech-to-Text (Whisper) ---- */

export async function transcribeAudio(
  audioBlob: Blob,
  language = 'en',
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  form.append('language', language);

  const res = await fetch(`${API_BASE}/stt`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

/* ---- Text-to-Speech (OpenAI TTS) ---- */

export async function generateSpeech(
  text: string,
  voice: 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer' = 'nova',
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'TTS failed' }));
    throw new Error(err.error);
  }
  return res.blob();
}

/* ---- LLM Chat Completion ---- */

export async function chatCompletion(
  messages: ChatMessage[],
  responseFormat?: { type: string },
  temperature = 0.7,
): Promise<string> {
  const res = await fetch(`${API_BASE}/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, responseFormat, temperature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'LLM request failed' }));
    throw new Error(err.error);
  }
  const data: LLMResponse = await res.json();
  return data.content;
}

/* ---- Image Generation (Replicate / NanoBanana) ---- */

export async function generateImage(
  prompt: string,
  sourceImageUrl: string,
  sourceImagePath?: string,
): Promise<string> {
  // Start generation (server uses Prefer: wait, so may return result directly)
  const startRes = await fetch(`${API_BASE}/image/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sourceImageUrl, sourceImagePath }),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({ error: 'Image generation failed' }));
    throw new Error(err.error);
  }
  const data: ImageGenResult = await startRes.json();

  // If Prefer: wait returned a completed result, extract output directly
  if (data.status === 'succeeded' && data.output) {
    // NanoBanana output can be a string URL or array of URLs
    const output = data.output;
    if (typeof output === 'string') return output;
    if (Array.isArray(output) && output[0]) return output[0];
  }

  // Otherwise poll until complete
  const id = data.id;
  const maxAttempts = 60; // ~90 seconds at 1.5s interval
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1500));

    const statusRes = await fetch(`${API_BASE}/image/status/${id}`);
    if (!statusRes.ok) continue;

    const result: ImageGenResult = await statusRes.json();

    if (result.status === 'succeeded' && result.output) {
      const output = result.output;
      if (typeof output === 'string') return output;
      if (Array.isArray(output) && output[0]) return output[0];
    }
    if (result.status === 'failed') {
      throw new Error(result.error || 'Image generation failed');
    }
  }

  throw new Error('Image generation timed out');
}
