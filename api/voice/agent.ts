import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '../_types';

type AgentType = 'areaMatcher' | 'povMatcher' | 'responseComposer' | 'inputExtractor';

type NormalizedMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type PovOption = {
  id: string;
  label: string;
};

const SPACE_IDS = [
  'placa-catalunya',
  'la-rambla',
  'passeig-de-gracia',
  'barceloneta-beach',
  'park-guell',
  'mnac-esplanade',
] as const;

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  ca: 'Catalan',
  es: 'Spanish',
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeMessages(raw: unknown): NormalizedMessage[] {
  if (!Array.isArray(raw)) return [];

  const normalized: NormalizedMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const roleRaw = (item as { role?: unknown }).role;
    const contentRaw = (item as { content?: unknown }).content;
    if (typeof contentRaw !== 'string' || !contentRaw.trim()) continue;

    const role =
      roleRaw === 'assistant' || roleRaw === 'system' || roleRaw === 'user'
        ? roleRaw
        : 'user';

    normalized.push({ role, content: contentRaw.trim() });
  }

  return normalized;
}

function extractLatestUserMessage(messages: NormalizedMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return messages.length > 0 ? messages[messages.length - 1].content : '';
}

function parseJson(text: string | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeAreaResult(parsed: Record<string, unknown>) {
  const matchedSpaceId =
    typeof parsed.matchedSpaceId === 'string' &&
    SPACE_IDS.includes(parsed.matchedSpaceId as (typeof SPACE_IDS)[number])
      ? parsed.matchedSpaceId
      : null;

  return {
    matchedSpaceId,
    confidence: clamp01(Number(parsed.confidence ?? 0)),
    clarificationMessage:
      typeof parsed.clarificationMessage === 'string' && parsed.clarificationMessage.trim()
        ? parsed.clarificationMessage.trim()
        : 'Could you repeat the place name?',
  };
}

function normalizePovResult(parsed: Record<string, unknown>, options: PovOption[]) {
  const optionIds = new Set(options.map((opt) => opt.id));
  const matchedPovId =
    typeof parsed.matchedPovId === 'string' && optionIds.has(parsed.matchedPovId)
      ? parsed.matchedPovId
      : null;

  return {
    matchedPovId,
    confidence: clamp01(Number(parsed.confidence ?? 0)),
    clarificationMessage:
      typeof parsed.clarificationMessage === 'string' && parsed.clarificationMessage.trim()
        ? parsed.clarificationMessage.trim()
        : 'Could you describe the viewpoint again?',
  };
}

function normalizeComposerResult(parsed: Record<string, unknown>) {
  const spokenText =
    typeof parsed.spokenText === 'string' && parsed.spokenText.trim()
      ? parsed.spokenText.trim()
      : 'Great, let us continue.';

  return { spokenText: spokenText.slice(0, 320) };
}

function normalizeExtractorResult(parsed: Record<string, unknown>) {
  const nameRaw = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const ageRaw = Number(parsed.age);

  return {
    name: nameRaw ? nameRaw.slice(0, 60) : null,
    age: Number.isFinite(ageRaw) && ageRaw >= 1 && ageRaw <= 99 ? Math.round(ageRaw) : null,
    skipped: Boolean(parsed.skipped),
  };
}

function normalizePovOptions(raw: unknown): PovOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id = (item as { id?: unknown }).id;
      const label = (item as { label?: unknown }).label;
      if (typeof id !== 'string' || typeof label !== 'string') return null;
      return { id, label };
    })
    .filter((item): item is PovOption => item !== null);
}
function buildAreaPrompt(userText: string, language: string): { system: string; user: string } {
  return {
    system:
      'You match informal spoken references to one of these 6 Barcelona spaces: ' +
      `${SPACE_IDS.join(', ')}. ` +
      'Output JSON only: {"matchedSpaceId": string|null, "confidence": number, "clarificationMessage": string}.',
    user:
      `Language: ${LANGUAGE_NAME[language] ?? LANGUAGE_NAME.en}\n` +
      `Spoken user text: "${userText}"\n` +
      'Find the best space id match. If unsure, return null with a short clarification question.',
  };
}

function buildPovPrompt(
  userText: string,
  language: string,
  options: PovOption[],
): { system: string; user: string } {
  return {
    system:
      'You match spoken viewpoint descriptions to one POV id from provided options. ' +
      'Output JSON only: {"matchedPovId": string|null, "confidence": number, "clarificationMessage": string}.',
    user:
      `Language: ${LANGUAGE_NAME[language] ?? LANGUAGE_NAME.en}\n` +
      `POV options:\n${options.map((opt) => `- ${opt.id}: ${opt.label}`).join('\n')}\n` +
      `Spoken user text: "${userText}"\n` +
      'Select the best POV id. If no reliable match, return null and ask a concise clarification question.',
  };
}

function buildComposerPrompt(
  userText: string,
  language: string,
  context: Record<string, unknown>,
): { system: string; user: string } {
  const scenario = typeof context.scenario === 'string' ? context.scenario : 'generic';
  return {
    system:
      'You generate concise spoken responses for a Barcelona civic booth. ' +
      'Max 2 short sentences. Warm and clear tone. No markdown. ' +
      'Output JSON only: {"spokenText": string}.',
    user:
      `Language: ${LANGUAGE_NAME[language] ?? LANGUAGE_NAME.en}\n` +
      `Scenario: ${scenario}\n` +
      `Context JSON: ${JSON.stringify(context)}\n` +
      `Latest user message: "${userText}"`,
  };
}

function buildExtractorPrompt(userText: string, language: string): { system: string; user: string } {
  return {
    system:
      'Extract participant name and age from speech. ' +
      'If user skips (e.g. "no thanks"), set skipped=true and name/age as null. ' +
      'Output JSON only: {"name": string|null, "age": number|null, "skipped": boolean}.',
    user:
      `Language: ${LANGUAGE_NAME[language] ?? LANGUAGE_NAME.en}\n` +
      `Spoken user text: "${userText}"`,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { agentType, messages, context, language } = req.body ?? {};
  const typedAgent = agentType as AgentType;
  const lang = typeof language === 'string' ? language : 'en';

  if (!typedAgent || !['areaMatcher', 'povMatcher', 'responseComposer', 'inputExtractor'].includes(typedAgent)) {
    return res.status(400).json({ success: false, error: 'Invalid or missing agentType' });
  }

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GOOGLE_GEMINI_API_KEY not configured' });
  }

  const normalizedMessages = normalizeMessages(messages);
  const userText = extractLatestUserMessage(normalizedMessages);
  if (!userText) {
    return res.status(400).json({ success: false, error: 'No user message found in messages' });
  }

  const contextObj = context && typeof context === 'object'
    ? (context as Record<string, unknown>)
    : {};

  let systemPrompt = '';
  let userPrompt = '';
  let povOptions: PovOption[] = [];

  switch (typedAgent) {
    case 'areaMatcher': {
      const prompt = buildAreaPrompt(userText, lang);
      systemPrompt = prompt.system;
      userPrompt = prompt.user;
      break;
    }
    case 'povMatcher': {
      povOptions = normalizePovOptions(contextObj.povOptions);
      if (povOptions.length === 0) {
        return res.status(400).json({ success: false, error: 'povMatcher requires context.povOptions' });
      }
      const prompt = buildPovPrompt(userText, lang, povOptions);
      systemPrompt = prompt.system;
      userPrompt = prompt.user;
      break;
    }
    case 'responseComposer': {
      const prompt = buildComposerPrompt(userText, lang, contextObj);
      systemPrompt = prompt.system;
      userPrompt = prompt.user;
      break;
    }
    case 'inputExtractor': {
      const prompt = buildExtractorPrompt(userText, lang);
      systemPrompt = prompt.system;
      userPrompt = prompt.user;
      break;
    }
    default: {
      return res.status(400).json({ success: false, error: 'Unsupported agentType' });
    }
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const parsed = parseJson(response.text);

    switch (typedAgent) {
      case 'areaMatcher':
        return res.status(200).json({ success: true, data: normalizeAreaResult(parsed) });
      case 'povMatcher':
        return res.status(200).json({ success: true, data: normalizePovResult(parsed, povOptions) });
      case 'responseComposer':
        return res.status(200).json({ success: true, data: normalizeComposerResult(parsed) });
      case 'inputExtractor':
        return res.status(200).json({ success: true, data: normalizeExtractorResult(parsed) });
      default:
        return res.status(400).json({ success: false, error: 'Unsupported agentType' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ success: false, error: `Voice agent call failed: ${message}` });
  }
}
