"use client";

import { useEffect, useState } from "react";
import { loadTranslations, getCurrentLanguage, setLanguage, t, type TranslationKey } from "@/lib/i18n";
import enTranslations from "@/locales/en.json";
import kaTranslations from "@/locales/ka.json";

// Load translations on module load
loadTranslations({
  en: enTranslations,
  ka: kaTranslations,
});

export function useI18n() {
  const [lang, setLangState] = useState<"en" | "ka">(getCurrentLanguage() as "en" | "ka");

  useEffect(() => {
    // Sync with localStorage changes
    const handleStorageChange = () => {
      setLangState(getCurrentLanguage() as "en" | "ka");
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const changeLanguage = (newLang: "en" | "ka") => {
    setLanguage(newLang);
    setLangState(newLang);
  };

  return {
    t: (key: TranslationKey, fallback?: string) => t(key, fallback),
    language: lang,
    setLanguage: changeLanguage,
  };
}

// Helper function to get nested translation
export function getNestedTranslation(
  translations: any,
  path: string,
  fallback?: string,
): string {
  const keys = path.split(".");
  let value: any = translations;

  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = value[key];
    } else {
      return fallback || path;
    }
  }

  return typeof value === "string" ? value : fallback || path;
}
