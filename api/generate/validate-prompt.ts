/* -----------------------------------------------------------------------
   POST /api/generate/validate-prompt
   Body: { promptText: string, spaceId: string, language: string }
   Returns: { success: true, data: { approved: boolean, reason: string } }

   Layer 2 guardrail — Gemini Flash text call.
   Checks: (a) safe for all ages, (b) physically plausible in urban space,
           (c) non-violent/offensive, (d) contextually relevant to Barcelona.
   ----------------------------------------------------------------------- */
import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '../_types';

const SYSTEM_INSTRUCTION = `You are a content moderator for a Barcelona civic participation platform at a public conference booth.
Evaluate whether the user's urban planning proposal meets ALL of the following criteria:
1. Safe and appropriate for all ages (no violence, nudity, weapons, hate speech)
2. Physically plausible in a real urban public space (no physically impossible or absurd proposals)
3. Contextually relevant to urban planning or public space improvement in Barcelona
4. Not offensive, discriminatory, or politically extremist

Respond ONLY with a valid JSON object. No markdown, no code blocks, no extra text.
Format: {"approved": true/false, "reason": "one concise sentence explaining the decision"}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { promptText, spaceId } = req.body ?? {};

  if (!promptText || !spaceId) {
    return res.status(400).json({ success: false, error: 'Missing promptText or spaceId' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GOOGLE_GEMINI_API_KEY not configured' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const userMessage = `Space: ${String(spaceId)}
Proposal: "${String(promptText)}"

Is this proposal appropriate for a Barcelona civic platform?`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const text = response.text ?? '';
    let parsed: { approved: boolean; reason: string };

    try {
      parsed = JSON.parse(text) as { approved: boolean; reason: string };
    } catch {
      // Fallback if model didn't return pure JSON
      const approved = text.toLowerCase().includes('"approved": true') ||
        text.toLowerCase().includes('"approved":true');
      parsed = { approved, reason: 'Validation completed.' };
    }

    return res.status(200).json({ success: true, data: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ success: false, error: `Gemini validation failed: ${message}` });
  }
}
