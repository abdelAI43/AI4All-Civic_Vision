/* -----------------------------------------------------------------------
   POST /api/generate/image
   Body: {
     spaceId: string,
     spaceName: string,
     povId: string,
     povLabel: string,
     baseImagePath: string,   // e.g. "/images/placa-catalunya/pedestrian.jpg"
     promptText: string,
   }
   Returns: { success: true, data: { imageDataUrl: string } }

   Calls Nano Banana Pro (gemini-3-pro-image-preview) with the base POV photo
   + a server-side wrapped prompt. Returns base64 data URL.
   Image is stored to Supabase Storage in /api/proposals/create — not here.
   ----------------------------------------------------------------------- */
import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '../_types';

/** POV id → perspective modifier appended to generation prompt */
const POV_MODIFIERS: Record<string, string> = {
  pedestrian: 'from street level as a pedestrian',
  'bottom-up': 'from a low angle looking upward',
  aerial: "from an aerial bird's-eye perspective",
  cyclist: 'from street level as a cyclist',
  rooftop: 'from a rooftop vantage point',
  waterfront: 'from the waterfront looking inland',
};

function buildWrappedPrompt(spaceName: string, povId: string, userPrompt: string): string {
  const povModifier = POV_MODIFIERS[povId] ?? 'from this viewpoint';
  return (
    `Photorealistic urban planning visualization for ${spaceName}, Barcelona. ` +
    `Proposed civic change: ${userPrompt}. ` +
    `Perspective: ${povModifier}. ` +
    `Style: family-friendly, daytime, architectural rendering, photorealistic. ` +
    `Keep all existing surroundings intact; only modify what is described.`
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { spaceId, spaceName, povId, baseImagePath, promptText } = req.body ?? {};

  if (!spaceId || !spaceName || !povId || !baseImagePath || !promptText) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: spaceId, spaceName, povId, baseImagePath, promptText',
    });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GOOGLE_GEMINI_API_KEY not configured' });
  }

  // Fetch the base image from the app's own static assets.
  // APP_URL must be set to the deployment origin (e.g. https://your-app.vercel.app)
  // For local dev: APP_URL=http://localhost:5173
  const appUrl = process.env.APP_URL ?? '';
  if (!appUrl) {
    return res.status(500).json({ success: false, error: 'APP_URL not configured' });
  }

  try {
    // 1. Fetch the base POV image (encodeURI handles spaces/accented chars in filenames)
    const imageUrl = encodeURI(`${appUrl}${String(baseImagePath)}`);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return res.status(400).json({
        success: false,
        error: `Could not load base image from ${imageUrl} (${imageResponse.status})`,
      });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const mimeType = imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // 2. Build the server-side wrapped prompt (user text never sent raw)
    const wrappedPrompt = buildWrappedPrompt(
      String(spaceName),
      String(povId),
      String(promptText),
    );

    // 3. Call Nano Banana Pro (gemini-3-pro-image-preview)
    const ai = new GoogleGenAI({ apiKey });

    // MODEL: use gemini-2.5-flash-image for testing; swap to gemini-3-pro-image-preview for production
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          role: 'user',
          parts: [
            { text: wrappedPrompt },
            { inlineData: { mimeType, data: base64Image } },
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
    });

    // 4. Extract the generated image from the response
    const candidate = response.candidates?.[0];
    if (!candidate) {
      return res.status(500).json({ success: false, error: 'No image generated — empty response' });
    }

    let generatedBase64: string | null = null;
    let generatedMime = 'image/png';

    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        generatedBase64 = part.inlineData.data;
        generatedMime = part.inlineData.mimeType ?? 'image/png';
        break;
      }
    }

    if (!generatedBase64) {
      const textParts = candidate.content?.parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join(' ');
      return res.status(500).json({
        success: false,
        error: `Image generation produced no image. Model said: ${textParts ?? 'nothing'}`,
      });
    }

    const imageDataUrl = `data:${generatedMime};base64,${generatedBase64}`;
    return res.status(200).json({ success: true, data: { imageDataUrl } });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ success: false, error: `Image generation failed: ${message}` });
  }
}
