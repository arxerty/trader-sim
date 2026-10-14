import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ru from './locales/ru.json';
import es from './locales/es.json';
import zh from './locales/zh.json';
import uk from './locales/uk.json';
import de from './locales/de.json';

/** To add a language: create locales/<code>.json, import it here and add it to SUPPORTED_LANGUAGES. */
export const SUPPORTED_LANGUAGES = ['en', 'ru', 'es', 'zh', 'uk', 'de'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: LanguageCode = 'en';
export const LANGUAGE_STORAGE_KEY = 'trader-sim:lang';

export const resources = {
  en: { translation: en },
  ru: { translation: ru },
  es: { translation: es },
  zh: { translation: zh },
  uk: { translation: uk },
  de: { translation: de },
} as const;

export function isSupportedLanguage(value: string): value is LanguageCode {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Resolves "ru-RU" → "ru", unknown → fallback. */
export function resolveLanguage(value: string | undefined): LanguageCode {
  const base = (value ?? '').toLowerCase().split('-')[0] ?? '';
  return isSupportedLanguage(base) ? base : FALLBACK_LANGUAGE;
}

export function initI18n(forcedLanguage?: LanguageCode) {
  if (i18n.isInitialized) {
    if (forcedLanguage) void i18n.changeLanguage(forcedLanguage);
    return i18n;
  }
  const instance = forcedLanguage ? i18n : i18n.use(LanguageDetector);
  void instance.use(initReactI18next).init({
    resources,
    lng: forcedLanguage,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    returnNull: false,
    showSupportNotice: false,
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  });

  const syncHtmlLang = (lng: string) => {
    if (typeof document !== 'undefined') document.documentElement.lang = resolveLanguage(lng);
  };
  syncHtmlLang(i18n.language);
  i18n.on('languageChanged', syncHtmlLang);
  return i18n;
}

export default i18n;
