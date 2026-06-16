/**
 * Quick test for Gemini 2.5 Flash Image (text-and-image-to-image).
 * Usage:
 *   npx tsx scripts/test-image-gen.ts
 *
 * Reads: public/images/placa-catalunya/pedestrian.jpg
 * Writes: scripts/test-output.png
 */
import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌  GOOGLE_GEMINI_API_KEY not set in environment.');
  console.error('    Run:  $env:GOOGLE_GEMINI_API_KEY="AIza..." then retry.');
  process.exit(1);
}

const INPUT_IMAGE  = path.join('public', 'images', 'placa-catalunya', 'pedestrian.jpg');
const OUTPUT_IMAGE = path.join('scripts', 'test-output.png');

const PROMPT =
  'Photorealistic urban planning visualization for Plaça Catalunya, Barcelona. ' +
  'Proposed civic change: add a large central fountain with surrounding seating and shade trees. ' +
  'Perspective: from street level as a pedestrian. ' +
  'Style: family-friendly, daytime, architectural rendering, photorealistic. ' +
  'Keep all existing surroundings intact; only modify what is described.';

async function main() {
  console.log('📸  Reading base image:', INPUT_IMAGE);
  const imageBuffer = fs.readFileSync(INPUT_IMAGE);
  const base64Image = imageBuffer.toString('base64');

  console.log('🚀  Calling gemini-2.5-flash-image…');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        ],
      },
    ],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  });

  const candidate = response.candidates?.[0];
  if (!candidate) {
    console.error('❌  No candidate in response:', JSON.stringify(response, null, 2));
    process.exit(1);
  }

  let saved = false;
  for (const part of candidate.content?.parts ?? []) {
    if (part.text) {
      console.log('💬  Model text:', part.text.slice(0, 200));
    }
    if (part.inlineData?.data) {
      const buffer = Buffer.from(part.inlineData.data, 'base64');
      fs.writeFileSync(OUTPUT_IMAGE, buffer);
      console.log('✅  Image saved to:', OUTPUT_IMAGE, `(${(buffer.length / 1024).toFixed(1)} KB)`);
      saved = true;
    }
  }

  if (!saved) {
    console.error('❌  Response contained no image data.');
    console.error('    Parts:', JSON.stringify(candidate.content?.parts?.map(p => ({ hasText: !!p.text, hasImage: !!p.inlineData })), null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌  Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
