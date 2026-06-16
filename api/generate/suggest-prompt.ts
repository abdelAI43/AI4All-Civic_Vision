import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '../_types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { originalPromptText, currentPromptText, spaceName, agentFeedback, language } = req.body ?? {};
  const current = typeof currentPromptText === 'string' ? currentPromptText.trim() : '';
  if (!current) {
    return res.status(400).json({ success: false, error: 'currentPromptText is required' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GOOGLE_GEMINI_API_KEY not configured' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        `Location: ${String(spaceName || 'Barcelona')}\n` +
        `Language: ${String(language || 'en')}\n` +
        `Original proposal: "${String(originalPromptText || current)}"\n` +
        `Current proposal: "${current}"\n` +
        `Agent feedback JSON: ${JSON.stringify(Array.isArray(agentFeedback) ? agentFeedback : [])}\n\n` +
        'Write one improved image-generation prompt for this civic proposal. Keep the citizen intention and respond to the expert feedback.',
      config: {
        systemInstruction:
          'Return JSON only: {"suggestedPromptText":"one clear improved proposal, max 70 words"}',
        responseMimeType: 'application/json',
        temperature: 0.35,
      },
    });

    const parsed = JSON.parse(response.text ?? '{}') as { suggestedPromptText?: string };
    const suggestedPromptText = parsed.suggestedPromptText?.trim();
    if (!suggestedPromptText) {
      return res.status(500).json({ success: false, error: 'No suggested prompt returned' });
    }

    return res.status(200).json({
      success: true,
      data: { suggestedPromptText: suggestedPromptText.slice(0, 700) },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Suggested prompt generation failed: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
}
