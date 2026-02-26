import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ca from './locales/ca.json';
import es from './locales/es.json';

const LANG_KEY = 'bcv-lang';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ca: { translation: ca },
      es: { translation: es },
    },
    lng: localStorage.getItem(LANG_KEY) ?? 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANG_KEY, lng);
});

export default i18n;
