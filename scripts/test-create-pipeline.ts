/**
 * Full pipeline test: validate → generate image → upload to Supabase → insert DB row.
 * Usage: npx tsx scripts/test-create-pipeline.ts
 *
 * Simulates what POST /api/proposals/create does end-to-end.
 * Reads env from .env file via dotenv-style manual parse (no dotenv dep needed).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// ── Load .env manually ────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env');
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

// ── Config ────────────────────────────────────────────────────────────────────
const GEMINI_KEY    = process.env.GOOGLE_GEMINI_API_KEY!;
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INPUT_IMAGE   = path.join('public', 'images', 'placa-catalunya', 'pedestrian.jpg');
const PROMPT        = 'Add a large circular fountain with seating and shade trees around it';
const SPACE_NAME    = 'Plaça Catalunya';
const POV_ID        = 'pedestrian';

if (!GEMINI_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing env vars. Check .env file.');
  process.exit(1);
}

async function main() {
  console.log('─────────────────────────────────────────');
  console.log('Barcelona Civic Vision — Pipeline Test');
  console.log('─────────────────────────────────────────\n');

  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Step 1: Prompt validation
  console.log('1/4  Validating prompt with Gemini Flash…');
  const valResp = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Space: placa-catalunya\nProposal: "${PROMPT}"\nIs this appropriate for a Barcelona civic platform?`,
    config: {
      systemInstruction:
        'Content moderator for Barcelona civic platform. Reply JSON only: {"approved":true/false,"reason":"one sentence"}',
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });
  const valText = valResp.text ?? '{}';
  console.log('     Validation response:', valText.trim());

  // Step 2: Image generation
  console.log('\n2/4  Generating image with Gemini 2.5 Flash Image…');
  const imgBuffer = fs.readFileSync(INPUT_IMAGE);
  const base64    = imgBuffer.toString('base64');
  const wrapped   = `Photorealistic urban planning visualization for ${SPACE_NAME}, Barcelona. Proposed civic change: ${PROMPT}. Perspective: from street level as a pedestrian. Style: family-friendly, daytime, architectural rendering, photorealistic.`;

  const genResp = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ role: 'user', parts: [
      { text: wrapped },
      { inlineData: { mimeType: 'image/jpeg', data: base64 } },
    ]}],
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const imagePart = genResp.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    console.error('❌  No image in response');
    process.exit(1);
  }
  const genBase64 = imagePart.inlineData.data;
  const genMime   = imagePart.inlineData.mimeType ?? 'image/png';
  const localOut  = path.join('scripts', 'test-output.png');
  fs.writeFileSync(localOut, Buffer.from(genBase64, 'base64'));
  console.log(`     Image saved locally: ${localOut}`);

  // Step 3: Upload to Supabase Storage
  console.log('\n3/4  Uploading to Supabase Storage…');
  const proposalId = randomUUID();
  const ext        = genMime === 'image/png' ? 'png' : 'jpg';
  const fileName   = `${proposalId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('generated-images')
    .upload(fileName, Buffer.from(genBase64, 'base64'), { contentType: genMime });

  if (uploadErr) {
    console.error('❌  Storage upload failed:', uploadErr.message);
    process.exit(1);
  }

  const { data: urlData } = supabase.storage.from('generated-images').getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;
  console.log('     Public URL:', publicUrl);

  // Step 4: Insert to DB
  console.log('\n4/4  Inserting proposal row to Supabase…');
  const { data: row, error: insertErr } = await supabase
    .from('proposals')
    .insert({
      id:                  proposalId,
      space_id:            'placa-catalunya',
      pov_id:              POV_ID,
      prompt_text:         PROMPT,
      language:            'en',
      base_image_path:     '/images/placa-catalunya/pedestrian.jpg',
      generated_image_url: publicUrl,
      avg_agent_score:     3.8,
      participant_name:    'Test User',
      participant_age:     30,
      consent_given:       true,
      status:              'complete',
    })
    .select('id, space_id, status, created_at')
    .single();

  if (insertErr) {
    console.error('❌  DB insert failed:', insertErr.message);
    process.exit(1);
  }

  console.log('\n─────────────────────────────────────────');
  console.log('✅  PIPELINE SUCCESS');
  console.log('     Proposal ID:', row?.id);
  console.log('     Space:      ', row?.space_id);
  console.log('     Status:     ', row?.status);
  console.log('     Created:    ', row?.created_at);
  console.log('     Image URL:  ', publicUrl);
  console.log('─────────────────────────────────────────');
}

main().catch((err) => {
  console.error('\n❌  Pipeline error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
