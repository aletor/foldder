import type { ButtonContent, Locale, TextContent } from "./site-types";

export function resolveTextValue(
  content: TextContent,
  locale: string,
  fallbackLocale = "es",
): string {
  const localized = content.localeValues?.[locale]?.trim();
  if (localized) return localized;
  const fallback = content.localeValues?.[fallbackLocale]?.trim();
  if (fallback) return fallback;
  return content.value.trim();
}

export function resolveButtonLabel(
  content: ButtonContent,
  locale: string,
  fallbackLocale = "es",
): string {
  const localized = content.localeLabels?.[locale]?.trim();
  if (localized) return localized;
  const fallback = content.localeLabels?.[fallbackLocale]?.trim();
  if (fallback) return fallback;
  return content.label.trim() || "Acción";
}

export function patchTextLocaleValue(
  content: TextContent,
  locale: Locale,
  value: string,
): TextContent {
  const localeValues = { ...(content.localeValues ?? {}) };
  if (value.trim()) localeValues[locale] = value.trim();
  else delete localeValues[locale];
  const next: TextContent = {
    ...content,
    localeValues: Object.keys(localeValues).length ? localeValues : undefined,
  };
  if (locale === "es" || !content.value.trim()) {
    next.value = value.trim() || content.value;
  }
  return next;
}

export function patchButtonLocaleLabel(
  content: ButtonContent,
  locale: Locale,
  label: string,
): ButtonContent {
  const localeLabels = { ...(content.localeLabels ?? {}) };
  if (label.trim()) localeLabels[locale] = label.trim();
  else delete localeLabels[locale];
  return {
    ...content,
    localeLabels: Object.keys(localeLabels).length ? localeLabels : undefined,
    label: locale === "es" || !content.label.trim() ? label.trim() || content.label : content.label,
  };
}
