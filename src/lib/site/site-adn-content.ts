import { extractLogoPreviewUrl } from "@/lib/brandkit/brand-kit-defaults";
import type { VoiceValue } from "@/lib/brandkit/brand-kit-types";
import type { Block, MediaContent, SiteProject, TextContent } from "./site-types";
import type { SiteAdnContext } from "./site-adn";
import { getActiveSitePage, updateActiveSitePage } from "./site-project";

/** Textos de fábrica — solo se reemplazan si el valor sigue siendo placeholder. */
export const SITE_FACTORY_PLACEHOLDERS = {
  heroH1: "Tu marca, en una página",
  heroBody: "Compila tu ADN en web. Conecta BrandKit o escribe aquí.",
  manifestoH2: "Manifiesto",
  manifestoBody: "Escribe aquí la esencia de la marca en tres frases claras.",
  voiceH2: "Voz",
  voiceQuote: "La voz de marca aparecerá aquí.",
  ctaH2: "Contacto",
  footerCaption: "© Marca · Foldder Site",
} as const;

function isPlaceholder(value: string, placeholder: string): boolean {
  return !value.trim() || value.trim() === placeholder;
}

function patchTextBlock(block: Block, value: string, placeholder: string): Block {
  if (block.type !== "text") return block;
  const content = block.content as TextContent;
  if (!isPlaceholder(content.value, placeholder)) return block;
  return { ...block, source: { kind: "manual", ref: "brandKit" }, content: { ...content, value } };
}

function patchFirstEmptyMediaBlock(section: Block, url: string): Block {
  let changed = false;
  const walk = (block: Block): Block => {
    if (changed) return block;
    if (block.type === "media") {
      const content = block.content as MediaContent;
      if (!content.src?.trim()) {
        changed = true;
        return {
          ...block,
          source: { kind: "manual", ref: "brandKit" },
          content: { ...content, src: url },
        };
      }
    }
    if (block.children?.length) {
      const children = block.children.map(walk);
      if (children.some((child, index) => child !== block.children![index])) {
        return { ...block, children };
      }
    }
    return block;
  };
  return walk(section);
}

function voiceQuoteFromAdn(adn: SiteAdnContext): string {
  const voice = adn.document?.slots.voice?.value as VoiceValue | undefined;
  const parts = [voice?.summary, ...(voice?.descriptors ?? [])].filter(Boolean) as string[];
  return parts.slice(0, 2).join(" · ") || adn.oneLiner;
}

/** Rellena bloques vacíos o con copy de fábrica desde BrandKit (no pisa ediciones). */
export function applyBrandKitContentToProject(project: SiteProject, adn: SiteAdnContext | null): SiteProject {
  if (!adn?.ready) return project;
  const logoUrl = adn.logoUrl ?? (adn.document ? extractLogoPreviewUrl(adn.document) : null);
  const brandName = adn.brandName.trim();
  const oneLiner = adn.oneLiner.trim();
  const voiceQuote = voiceQuoteFromAdn(adn);

  const active = getActiveSitePage(project);
  const sections = active.sections.map((section) => {
    let next = section;

    if (section.type === "text") {
      const root = section.content as TextContent;
      if (root.role === "h1" && brandName) {
        next = patchTextBlock(next, brandName, SITE_FACTORY_PLACEHOLDERS.heroH1);
      } else if (root.role === "h2" && root.value === SITE_FACTORY_PLACEHOLDERS.manifestoH2 && brandName) {
        next = patchTextBlock(next, brandName, SITE_FACTORY_PLACEHOLDERS.manifestoH2);
      } else if (root.role === "caption") {
        next = patchTextBlock(
          next,
          `© ${brandName || "Marca"} · Foldder Site`,
          SITE_FACTORY_PLACEHOLDERS.footerCaption,
        );
      }
    }

    if (section.children?.length) {
      const children = section.children.map((child) => {
        if (child.type !== "text") return child;
        const content = child.content as TextContent;
        if (content.role === "body" && oneLiner) {
          return patchTextBlock(child, oneLiner, SITE_FACTORY_PLACEHOLDERS.heroBody) as Block;
        }
        if (content.role === "body" && content.value === SITE_FACTORY_PLACEHOLDERS.manifestoBody && oneLiner) {
          return patchTextBlock(child, oneLiner, SITE_FACTORY_PLACEHOLDERS.manifestoBody) as Block;
        }
        if (content.role === "quote" && voiceQuote) {
          return patchTextBlock(child, voiceQuote, SITE_FACTORY_PLACEHOLDERS.voiceQuote) as Block;
        }
        return child;
      });
      next = { ...next, children };
    }

    if (logoUrl) {
      next = patchFirstEmptyMediaBlock(next, logoUrl);
    }

    return next;
  });

  return updateActiveSitePage(project, { sections });
}
