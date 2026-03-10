import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '../_types';

interface TranscribeResponse {
  transcript: string;
}

function parseTranscript(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as Partial<TranscribeResponse>;
    if (typeof parsed.transcript === 'string') {
      return parsed.transcript.trim();
    }
  } catch {
    // If model does not return strict JSON, use plain text fallback.
  }
  return raw.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { audioBase64, mimeType, language } = req.body ?? {};
  if (!audioBase64 || !mimeType) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: audioBase64, mimeType',
    });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GOOGLE_GEMINI_API_KEY not configured' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const lang = typeof language === 'string' ? language : 'en';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                `Transcribe this speech to text in language "${lang}". ` +
                'Return JSON only: {"transcript":"..."}',
            },
            {
              inlineData: {
                mimeType: String(mimeType),
                data: String(audioBase64),
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
    });

    const rawText = response.text ?? '';
    const transcript = parseTranscript(rawText);
    console.log('[transcribe] Raw response:', JSON.stringify(rawText).slice(0, 200));
    console.log('[transcribe] Parsed transcript:', JSON.stringify(transcript));
    return res.status(200).json({ success: true, data: { transcript } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[transcribe] STT error:', message);
    return res.status(500).json({ success: false, error: `Transcription failed: ${message}` });
  }
}
