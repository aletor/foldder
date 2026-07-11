import {
  deriveBrandThemeFromDoc,
  googleFontFamiliesFromTypography,
  type BrandThemePolarity,
  type BrandThemeResult,
} from "@/lib/brandkit/brand-theme-color";
import { buildGoogleFontsCssUrl } from "@/lib/brandkit/normalize-font-display-name";
import { extractLogoPreviewUrl } from "@/lib/brandkit/brand-kit-defaults";
import type { EssenceValue, BrandKitDocument, TypographyValue, VoiceValue } from "@/lib/brandkit/brand-kit-types";
import { inferMotionDnaFromText } from "./site-motion-dna";
import type { MotionDna, SiteProject, ThemeState } from "./site-types";
import { getActiveSitePage, updateActiveSitePage } from "./site-project";

export type SiteAdnContext = {
  ready: boolean;
  brandKitNodeId: string | null;
  edgeId: string | null;
  /** Documento BrandKit completo del nodo fuente (para Site y render). */
  document: BrandKitDocument | null;
  logoUrl: string | null;
  brandName: string;
  oneLiner: string;
  brandTheme: BrandThemeResult;
  motionDNA: MotionDna;
  motionDnaSource: string;
  fingerprint: string;
};

const EMPTY_ADN: SiteAdnContext = {
  ready: false,
  brandKitNodeId: null,
  edgeId: null,
  document: null,
  logoUrl: null,
  brandName: "",
  oneLiner: "",
  brandTheme: { ready: false, polarity: "light", vars: {}, fingerprint: "" },
  motionDNA: "soft",
  motionDnaSource: "Predeterminado (sin ADN)",
  fingerprint: "",
};

function voiceText(doc: BrandKitDocument): string {
  const voice = doc.slots.voice?.value as VoiceValue | undefined;
  const parts = [voice?.summary, ...(voice?.descriptors ?? [])].filter(Boolean) as string[];
  return parts.join(" ");
}

function essenceOneLiner(doc: BrandKitDocument): string {
  const essenceSlot = doc.slots.essence;
  const resolved = essenceSlot?.value as EssenceValue | undefined;
  if (resolved) {
    return resolved.headline?.trim() || resolved.summary?.trim() || "";
  }

  const candidates = essenceSlot?.candidates ?? [];
  if (candidates.length === 0) return "";

  const best = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const candidate = best?.value as EssenceValue | undefined;
  return candidate?.headline?.trim() || candidate?.summary?.trim() || "";
}

/** Resuelve el paquete ADN desde un BrandKitDocument (puerto F1). */
export function resolveSiteAdnFromBrandKit(
  doc: BrandKitDocument | null | undefined,
  meta?: { brandKitNodeId?: string | null; edgeId?: string | null },
): SiteAdnContext {
  if (!doc) return { ...EMPTY_ADN, brandKitNodeId: meta?.brandKitNodeId ?? null, edgeId: meta?.edgeId ?? null };

  const brandTheme = deriveBrandThemeFromDoc(doc);
  const metaBase = {
    brandKitNodeId: meta?.brandKitNodeId ?? null,
    edgeId: meta?.edgeId ?? null,
    document: doc,
    logoUrl: extractLogoPreviewUrl(doc),
  };

  if (!brandTheme.ready) {
    return {
      ...EMPTY_ADN,
      ...metaBase,
      brandName: doc.brandName?.value?.trim() || "",
      oneLiner: essenceOneLiner(doc),
    };
  }

  const motion = inferMotionDnaFromText(voiceText(doc));
  const brandName = doc.brandName?.value?.trim() || "Marca";

  return {
    ready: true,
    ...metaBase,
    brandName,
    oneLiner: essenceOneLiner(doc),
    brandTheme,
    motionDNA: motion.motionDNA,
    motionDnaSource: motion.source,
    fingerprint: `${brandTheme.fingerprint}:${doc.compiledHash ?? ""}:${doc.updatedAt}`,
  };
}

export function resolveSitePolarity(theme: ThemeState, adn: SiteAdnContext | null | undefined): BrandThemePolarity {
  if (theme.dials.polarity === "light") return "light";
  if (theme.dials.polarity === "dark") return "dark";
  if (adn?.ready) return adn.brandTheme.polarity;
  return "light";
}

/** Fusiona tema del proyecto con tokens ADN para render/preview. */
export function applySiteAdnToProject(
  project: SiteProject,
  adn: SiteAdnContext | null | undefined,
): SiteProject {
  if (!adn?.ready) {
    return {
      ...project,
      theme: {
        ...project.theme,
        base: "neutral",
        adnRef: undefined,
      },
    };
  }

  const active = getActiveSitePage(project);
  return updateActiveSitePage(
    {
      ...project,
      theme: {
        ...project.theme,
        base: "brandKit",
        adnRef: adn.brandKitNodeId ?? adn.edgeId ?? undefined,
        motionDNA: adn.motionDNA,
      },
    },
    {
      seo: {
        title: active.seo.title.trim() || adn.brandName,
        description: active.seo.description.trim() || adn.oneLiner,
      },
    },
  );
}

export function siteAdnFingerprint(adn: SiteAdnContext | null | undefined): string {
  return adn?.fingerprint ?? "";
}

/** Link de Google Fonts derivado de la tipografía coronada en BrandKit. */
export function siteAdnGoogleFontsHref(adn: SiteAdnContext | null | undefined): string | null {
  if (!adn?.document) return null;
  const typography = adn.document.slots.typography?.value as TypographyValue | undefined;
  const families = googleFontFamiliesFromTypography(typography);
  return buildGoogleFontsCssUrl(families);
}
