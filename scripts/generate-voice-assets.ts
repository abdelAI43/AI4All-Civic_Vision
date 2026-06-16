/**
 * One-time script: generates static WAV files for all fixed TTS prompts.
 *
 * Usage:
 *   npm run generate-voice
 *
 * Reads GOOGLE_GEMINI_API_KEY from .env, calls Gemini TTS for each prompt
 * in EN / CA / ES, converts PCM16 to WAV, and writes to public/audio/{lang}/{key}.wav.
 *
 * Re-run whenever prompts in this file are changed.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

// ── Load .env ────────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const envPath = resolve(root, '.env');

try {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
} catch {
  console.error('No .env file found — set GOOGLE_GEMINI_API_KEY manually');
  process.exit(1);
}

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_GEMINI_API_KEY not set');
  process.exit(1);
}

// ── Prompts to generate ──────────────────────────────────────────────────────

interface PromptEntry {
  key: string;
  en: string;
  ca: string;
  es: string;
}

const PROMPTS: PromptEntry[] = [
  {
    key: 'step1-greeting',
    en: 'Hello! Which Barcelona space would you like to reimagine today?',
    ca: 'Hola! Quin espai de Barcelona t agradaria reimaginar avui?',
    es: 'Hola! Que espacio de Barcelona te gustaria reimaginar hoy?',
  },
  {
    key: 'step2-guidance',
    en: 'Great! Which viewpoint would you like for your vision?',
    ca: 'Genial! Quin punt de vista prefereixes per a la teva visio?',
    es: 'Genial! Que punto de vista prefieres para tu vision?',
  },
  {
    key: 'step3-guidance',
    en: 'Wonderful. Now go ahead and describe the change you would love to see here.',
    ca: 'Perfecte. Ara descriu el canvi que t agradaria veure aqui.',
    es: 'Perfecto. Ahora describe el cambio que te gustaria ver aqui.',
  },
  {
    key: 'step3-confirm-question',
    en: 'Does that sound right, or would you like to change it?',
    ca: 'Esta be o vols canviar-ho?',
    es: 'Esta bien o quieres cambiarlo?',
  },
  {
    key: 'step4-guidance',
    en: 'Almost there! Would you like to share your name and age? Or just say skip.',
    ca: 'Quasi llest! Vols compartir el teu nom i edat? O nomes di ometre.',
    es: 'Ya casi! Te gustaria compartir tu nombre y edad? O simplemente di omitir.',
  },
  {
    key: 'step4-consent',
    en: 'Whenever you are ready, please tap the consent checkbox just below.',
    ca: 'Quan estiguis a punt, toca la casella de consentiment a baix.',
    es: 'Cuando estes listo, toca la casilla de consentimiento de abajo.',
  },
  {
    key: 'step5-generating',
    en: 'Wonderful, generating your vision now!',
    ca: 'Genial, estic generant la teva visio!',
    es: 'Genial, generando tu vision ahora!',
  },
  {
    key: 'retry-space',
    en: 'No worries! Could you say the space name again?',
    ca: 'No passa res! Podries dir el nom de l espai de nou?',
    es: 'No te preocupes! Podrias decir el nombre del espacio de nuevo?',
  },
  {
    key: 'retry-pov',
    en: 'Could you describe the viewpoint again?',
    ca: 'Podries descriure el punt de vista de nou?',
    es: 'Podrias describir el punto de vista de nuevo?',
  },
  {
    key: 'retry-prompt',
    en: 'Could you repeat that for me?',
    ca: 'Podries repetir-ho, si us plau?',
    es: 'Podrias repetirlo, por favor?',
  },
];

const LANGUAGES = ['en', 'ca', 'es'] as const;

const LANG_NAME: Record<string, string> = {
  en: 'English',
  ca: 'Catalan',
  es: 'Spanish',
};

// ── Audio helpers ────────────────────────────────────────────────────────────

function parseSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i);
  if (!match) return 24000;
  const parsed = parseInt(match[1], 10);
  return Number.isNaN(parsed) ? 24000 : parsed;
}

function pcm16ToWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, 44);

  return wav;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function generateOne(
  ai: GoogleGenAI,
  text: string,
  lang: string,
): Promise<Buffer> {
  const langName = LANG_NAME[lang] ?? 'English';

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [
      {
        parts: [
          {
            text: `Say the following in ${langName}, in a warm and friendly tone: ${text}`,
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);

  if (!audioPart?.inlineData?.data) {
    throw new Error(`No audio returned for: "${text.slice(0, 40)}..."`);
  }

  const rawBase64 = audioPart.inlineData.data;
  const mimeType = audioPart.inlineData.mimeType ?? 'audio/L16;rate=24000';
  const pcmBuffer = Buffer.from(rawBase64, 'base64');

  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes('audio/l16') || lowerMime.includes('pcm')) {
    return pcm16ToWav(pcmBuffer, parseSampleRate(mimeType));
  }

  // If it's already WAV/MP3/etc., return as-is
  return pcmBuffer;
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: apiKey! });
  const outDir = resolve(root, 'public/audio');

  const total = PROMPTS.length * LANGUAGES.length;
  let done = 0;

  for (const lang of LANGUAGES) {
    const langDir = resolve(outDir, lang);
    if (!existsSync(langDir)) {
      mkdirSync(langDir, { recursive: true });
    }

    for (const prompt of PROMPTS) {
      const text = prompt[lang];
      const outPath = resolve(langDir, `${prompt.key}.wav`);

      done += 1;
      process.stdout.write(`[${done}/${total}] ${lang}/${prompt.key} ... `);

      try {
        const wavBuffer = await generateOne(ai, text, lang);
        writeFileSync(outPath, wavBuffer);
        console.log(`OK (${(wavBuffer.length / 1024).toFixed(0)} KB)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED: ${msg}`);
      }

      // Small delay to avoid rate limits (TTS has a 10 RPM free-tier limit)
      await new Promise((r) => setTimeout(r, 7000));
    }
  }

  console.log(`\nDone! Audio files saved to: public/audio/`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
