// Simple i18n utility for multi-language support
// Stores language preference in localStorage

type TranslationKey = string;
type Translations = Record<string, Record<TranslationKey, string>>;

let currentLanguage: string = "en";
let translations: Translations = {};

// Load translations
export function loadTranslations(translationsData: Translations) {
  translations = translationsData;
}

// Get current language from localStorage or default to 'en'
export function getCurrentLanguage(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("crm_language");
    if (stored && (stored === "en" || stored === "ka")) {
      currentLanguage = stored;
    }
  }
  return currentLanguage;
}

// Set current language
export function setLanguage(lang: "en" | "ka") {
  currentLanguage = lang;
  if (typeof window !== "undefined") {
    localStorage.setItem("crm_language", lang);
  }
}

// Translate a key
export function t(key: TranslationKey, fallback?: string): string {
  const lang = getCurrentLanguage();
  const translation = translations[lang]?.[key] || translations["en"]?.[key] || fallback || key;
  return translation;
}

// Get all translations for current language
export function getTranslations(): Record<TranslationKey, string> {
  const lang = getCurrentLanguage();
  return translations[lang] || translations["en"] || {};
}
