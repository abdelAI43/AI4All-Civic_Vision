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
      'Welcome to Barcelona Civic Vision. Choose a place to reimagine by tapping a card or saying the space name.',
    step2Guidance:
      'Great choice. Now choose a viewpoint by tapping a photo or describing the angle you prefer.',
    step3Guidance:
      'Now describe the change you would like to see in this space.',
    step3ConfirmPrefix: 'I heard',
    step4Guidance:
      'Before we generate your vision, you can optionally share your name and age, or say no thanks to skip.',
    step4ConsentReminder:
      'If you entered personal details, please tap the consent checkbox so I can continue.',
    step5Generating: 'Generating your vision now. Please wait a moment.',
    step6FallbackSummary: 'Your proposal is ready. You can now review the expert feedback on screen.',
    retrySpace: 'I did not catch the place clearly. Please say the space name again.',
    retryPov: 'I did not catch the viewpoint clearly. Please describe the angle again.',
    retryPrompt: 'I did not catch that clearly. Please repeat your proposal.',
  },
  ca: {
    step1Greeting:
      'Benvingut a Barcelona Civic Vision. Tria un espai tocant una targeta o dient el nom del lloc.',
    step2Guidance:
      'Molt bona tria. Ara tria un punt de vista tocant una foto o descrivint l angle que prefereixes.',
    step3Guidance:
      'Ara descriu el canvi que t agradaria veure en aquest espai.',
    step3ConfirmPrefix: 'He entes',
    step4Guidance:
      'Abans de generar la teva visio, pots compartir opcionalment nom i edat, o dir no gracies per ometre.',
    step4ConsentReminder:
      'Si has introduit dades personals, toca la casella de consentiment per continuar.',
    step5Generating: 'Estic generant la teva visio. Espera un moment.',
    step6FallbackSummary: 'La teva proposta esta llesta. Pots revisar el feedback dels experts a la pantalla.',
    retrySpace: 'No he entes be el lloc. Digues el nom de l espai una altra vegada.',
    retryPov: 'No he entes be el punt de vista. Descriu l angle una altra vegada.',
    retryPrompt: 'No ho he entes be. Repeteix la teva proposta, si us plau.',
  },
  es: {
    step1Greeting:
      'Bienvenido a Barcelona Civic Vision. Elige un espacio tocando una tarjeta o diciendo el nombre del lugar.',
    step2Guidance:
      'Buena eleccion. Ahora elige un punto de vista tocando una foto o describiendo el angulo que prefieres.',
    step3Guidance:
      'Ahora describe el cambio que te gustaria ver en este espacio.',
    step3ConfirmPrefix: 'He escuchado',
    step4Guidance:
      'Antes de generar tu vision, puedes compartir opcionalmente nombre y edad, o decir no gracias para omitir.',
    step4ConsentReminder:
      'Si has introducido datos personales, toca la casilla de consentimiento para continuar.',
    step5Generating: 'Generando tu vision ahora. Espera un momento.',
    step6FallbackSummary: 'Tu propuesta esta lista. Ya puedes revisar la evaluacion en pantalla.',
    retrySpace: 'No entendi bien el lugar. Di de nuevo el nombre del espacio.',
    retryPov: 'No entendi bien el punto de vista. Describe de nuevo el angulo.',
    retryPrompt: 'No te entendi bien. Repite tu propuesta, por favor.',
  },
};

export function getPromptSet(language: VoiceLanguage): PromptSet {
  return PROMPTS[language] ?? PROMPTS.en;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

export function isAffirmative(input: string, language: VoiceLanguage): boolean {
  const text = input.toLowerCase();
  if (language === 'ca') return includesAny(text, ['si', 'correcte', 'vale', 'd acord']);
  if (language === 'es') return includesAny(text, ['si', 'sí', 'correcto', 'vale']);
  return includesAny(text, ['yes', 'yeah', 'correct', 'that is right']);
}

export function isNegative(input: string, language: VoiceLanguage): boolean {
  const text = input.toLowerCase();
  if (language === 'ca') return includesAny(text, ['no', 'canvia', 'incorrecte']);
  if (language === 'es') return includesAny(text, ['no', 'cambia', 'incorrecto']);
  return includesAny(text, ['no', 'change it', 'incorrect']);
}
