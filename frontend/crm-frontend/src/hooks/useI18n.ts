"use client";

import { useI18nContext } from "@/contexts/i18n-context";

export function useI18n() {
  return useI18nContext();
}

export function getNestedTranslation(
  translations: Record<string, unknown>,
  path: string,
  fallback?: string,
): string {
  const keys = path.split(".");
  let value: unknown = translations;

  for (const key of keys) {
    if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return fallback || path;
    }
  }

  return typeof value === "string" ? value : fallback || path;
}
