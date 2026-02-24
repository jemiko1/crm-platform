"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "@/lib/api";
import enTranslations from "@/locales/en.json";
import kaTranslations from "@/locales/ka.json";

type Language = "en" | "ka";

type I18nContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (typeof value === "string") {
      result[fullKey] = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(
        result,
        flattenObject(value as Record<string, unknown>, fullKey),
      );
    }
  }
  return result;
}

const staticEn = flattenObject(enTranslations as Record<string, unknown>);
const staticKa = flattenObject(kaTranslations as Record<string, unknown>);

function getStoredLanguage(): Language {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("crm_language");
    if (stored === "en" || stored === "ka") return stored;
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start with "en" so server and client render the same HTML (avoids hydration mismatch).
  // The stored language is applied in a useEffect after hydration.
  const [language, setLanguageState] = useState<Language>("en");
  const [translations, setTranslations] = useState<
    Record<Language, Record<string, string>>
  >({ en: staticEn, ka: staticKa });

  useEffect(() => {
    const stored = getStoredLanguage();
    if (stored !== "en") {
      setLanguageState(stored);
    }
  }, []);

  useEffect(() => {
    async function loadFromApi() {
      try {
        const res = await fetch(`${API_BASE}/v1/translations/map`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: { en: Record<string, string>; ka: Record<string, string> } =
          await res.json();
        if (data.en && Object.keys(data.en).length > 0) {
          setTranslations((prev) => ({
            en: { ...prev.en, ...data.en },
            ka: { ...prev.ka, ...data.ka },
          }));
        }
      } catch {
        // API unavailable -- keep using static translations
      }
    }
    loadFromApi();
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("crm_language", lang);
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return (
        translations[language]?.[key] ??
        translations["en"]?.[key] ??
        fallback ??
        key
      );
    },
    [language, translations],
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18nContext(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18nContext must be used within an I18nProvider");
  }
  return ctx;
}
