import type { VoiceLanguage } from './apiClient';

interface PromptSet {
  step1Greeting: string;
  step2Guidance: string;
  step3Guidance: string;
  step3ConfirmPrefix: string;
  step4Guidance: string;
  step4ConsentReminder: string;
  step5Generating: string;
  step6FallbackSummary: string;
  retrySpace: string;
  retryPov: string;
  retryPrompt: string;
}

const PROMPTS: Record<VoiceLanguage, PromptSet> = {
  en: {
    step1Greeting:
      'Hello! Which Barcelona space would you like to reimagine today?',
    step2Guidance:
      'Great! Which viewpoint would you like for your vision?',
    step3Guidance:
      'Wonderful. Now go ahead and describe the change you would love to see here.',
    step3ConfirmPrefix: 'I heard',
    step4Guidance:
      'Almost there! Would you like to share your name and age? Or just say skip.',
    step4ConsentReminder:
      'Whenever you are ready, please tap the consent checkbox just below.',
    step5Generating: 'Wonderful, generating your vision now!',
    step6FallbackSummary: 'Your proposal is ready! Take a look at the expert feedback on screen.',
    retrySpace: 'No worries! Could you say the space name again?',
    retryPov: 'Could you describe the viewpoint again?',
    retryPrompt: 'Could you repeat that for me?',
  },
  ca: {
    step1Greeting:
      'Hola! Quin espai de Barcelona t agradaria reimaginar avui?',
    step2Guidance:
      'Genial! Quin punt de vista prefereixes per a la teva visio?',
    step3Guidance:
      'Perfecte. Ara descriu el canvi que t agradaria veure aqui.',
    step3ConfirmPrefix: 'He entes',
    step4Guidance:
      'Quasi llest! Vols compartir el teu nom i edat? O nomes di ometre.',
    step4ConsentReminder:
      'Quan estiguis a punt, toca la casella de consentiment a baix.',
    step5Generating: 'Genial, estic generant la teva visio!',
    step6FallbackSummary: 'La teva proposta esta llesta! Dona un cop d ull al feedback dels experts.',
    retrySpace: 'No passa res! Podries dir el nom de l espai de nou?',
    retryPov: 'Podries descriure el punt de vista de nou?',
    retryPrompt: 'Podries repetir-ho, si us plau?',
  },
  es: {
    step1Greeting:
      'Hola! Que espacio de Barcelona te gustaria reimaginar hoy?',
    step2Guidance:
      'Genial! Que punto de vista prefieres para tu vision?',
    step3Guidance:
      'Perfecto. Ahora describe el cambio que te gustaria ver aqui.',
    step3ConfirmPrefix: 'Escuche',
    step4Guidance:
      'Ya casi! Te gustaria compartir tu nombre y edad? O simplemente di omitir.',
    step4ConsentReminder:
      'Cuando estes listo, toca la casilla de consentimiento de abajo.',
    step5Generating: 'Genial, generando tu vision ahora!',
    step6FallbackSummary: 'Tu propuesta esta lista! Echa un vistazo a la evaluacion de los expertos.',
    retrySpace: 'No te preocupes! Podrias decir el nombre del espacio de nuevo?',
    retryPov: 'Podrias describir el punto de vista de nuevo?',
    retryPrompt: 'Podrias repetirlo, por favor?',
  },
};

export function getPromptSet(language: VoiceLanguage): PromptSet {
  return PROMPTS[language] ?? PROMPTS.en;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function normalizeSpeechText(input: string): string {
  return input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isAffirmative(input: string, language: VoiceLanguage): boolean {
  const text = normalizeSpeechText(input);
  if (language === 'ca') return includesAny(text, ['si', 'correcte', 'vale', 'd acord']);
  if (language === 'es') return includesAny(text, ['si', 'correcto', 'vale']);
  return includesAny(text, ['yes', 'yeah', 'correct', 'that is right']);
}

export function isNegative(input: string, language: VoiceLanguage): boolean {
  const text = normalizeSpeechText(input);
  if (language === 'ca') return includesAny(text, ['no', 'canvia', 'incorrecte']);
  if (language === 'es') return includesAny(text, ['no', 'cambia', 'incorrecto']);
  return includesAny(text, ['no', 'change it', 'incorrect']);
}