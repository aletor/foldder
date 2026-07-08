import type { RefCategory } from "./types";
import { BRANDKIT_REF_CATEGORIES } from "./types";

/** Mapa elemento Brand Board → rutas lógicas en `ProjectAssetsMetadata`. */
export const BRANDKIT_ELEMENT_REGISTRY = {
  "logo.primary": { path: "brand.logoPositive", label: "Logo principal" },
  "logo.primaryVector": { path: "brand.logoPrimaryVector", label: "Logo vector SVG" },
  "logo.alt": { path: "brand.logoNegative", label: "Logo alternativo" },
  "logo.safeArea": { path: "brand.logoSafeArea", label: "Área de seguridad logo" },
  "logo.minSize": { path: "brand.logoMinSize", label: "Tamaño mínimo logo" },
  "logo.misuses": { path: "brand.logoMisuses", label: "Usos incorrectos logo" },
  "palette.colorPrimary": { path: "brand.colorPrimary", label: "Color primario" },
  "palette.colorSecondary": { path: "brand.colorSecondary", label: "Color secundario" },
  "palette.colorAccent": { path: "brand.colorAccent", label: "Color acento" },
  "messages.tagline": { path: "knowledge.corporateContext", label: "Mensaje principal" },
  "tone": { path: "strategy.languageTraits", label: "Tono de marca" },
  "typography.primary": { path: "strategy.typography.primary", label: "Tipografía principal" },
  "typography.secondary": { path: "strategy.typography.secondary", label: "Tipografía secundaria" },
  "typography.scale": { path: "strategy.typography.scale", label: "Escala tipográfica" },
  "voice.examples": { path: "strategy.voiceExamples", label: "Ejemplos de voz" },
} as const satisfies Record<string, { path: string; label: string }>;

export type RegisteredElementKey = keyof typeof BRANDKIT_ELEMENT_REGISTRY;

export function referenceRuleElementKey(category: RefCategory): string {
  return `references.${category}.rule`;
}

export function referenceItemElementKey(category: RefCategory, itemId: string): string {
  return `references.${category}.item.${itemId}`;
}

export function paletteRoleElementKey(colorId: string): string {
  return `palette.${colorId}.role`;
}

export function messageKeyElementKey(messageId: string): string {
  return `messages.key.${messageId}`;
}

export function logoCandidateElementKey(candidateId: string): string {
  return `logo.candidate.${candidateId}`;
}

export function listReferenceRuleKeys(): string[] {
  return BRANDKIT_REF_CATEGORIES.map(referenceRuleElementKey);
}

export function isRegisteredElementKey(key: string): key is RegisteredElementKey {
  return key in BRANDKIT_ELEMENT_REGISTRY;
}
