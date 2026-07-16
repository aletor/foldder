/**
 * Render HTML del libro de estilo BrandKit — layout mosaic editorial (frameless, full-bleed).
 */

import type { Genome, Trait } from "../model/trait";
import type { ClaimValue, ImageDnaValue, LogoValue, TypographyValue } from "../model/trait-values";
import type { ImageCategory } from "../model/trait-ids";
import type {
  BrandKitDocument,
  EssenceValue,
  GalleryValue,
  PaletteValue,
  VoiceValue,
  VisualWorldValue,
} from "../brand-kit-types";
import { buildBookView, type FaceState, type BrandKitBookView, type MultiItem, type TraitSlot } from "./book-view";
import { buildBrandKitBookDerivations } from "./book-derivations";
import {
  embedImageUrlsForStyleGuide,
  resolveEmbeddedUrl,
} from "./style-guide-assets";
import { specimenFontStack, typographyWeightCss } from "../specimen/typography-specimen";
import { nameColor } from "../name-color";
import { formatCmyk, formatRgb, hexToRgb, readableTextOn, rgbToCmyk } from "@/app/spaces/brandKit/face-utils";
import {
  BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS,
  type BrandKitStyleGuideExportMode,
  resolveBrandKitStyleGuideSoloValidado,
} from "./style-guide-export-types";
import { buildStyleGuideChapterPlan } from "../brand-kit-presentation-export";
import {
  presentationSectionsCss,
  renderStyleGuideApplicationsSection,
  renderStyleGuideClosingPage,
  renderStyleGuideStationerySection,
  renderStyleGuideTableOfContents,
} from "./style-guide-presentation-sections";
import {
  categoryMeta,
  GALLERY_CATEGORY_ORDER,
  type GalleryGenerateCategory,
} from "../brand-kit-gallery-plan";

export type BrandKitStyleGuideDocument = {
  html: string;
  completenessPercent: number;
  generatedAt: string;
  exportMode: BrandKitStyleGuideExportMode;
  soloValidado: boolean;
};

const ALPHABET_LINE =
  "Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz";
const NUMERIC_LINE = "0123456789";

const VISUAL_CATEGORY_LABEL_ES: Record<ImageCategory, string> = {
  people: "Personas & mood",
  objects: "Objetos",
  textures: "Texturas",
  environments: "Entorno",
  protagonists: "Protagonista",
  general: "General",
};

const PALETTE_ROLE_LABEL_ES: Record<string, string> = {
  primary: "Principal",
  secondary: "Secundaria",
  accent: "Acento",
  background: "Fondo",
  text: "Texto",
  neutral: "Neutro",
};

type StyleGuideRichCopy = {
  voiceSummary: string;
  essenceSummary: string;
  essenceHeadline: string;
  visualWorldSummary: string;
  galleryTone: string;
  categoryBriefs: Array<{ category: GalleryGenerateCategory; label: string; description: string }>;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return esc(s);
}

function statusBadge(state: FaceState, soloValidado: boolean): string {
  if (soloValidado || state === "crowned") return "";
  if (state === "proposed") return `<span class="sg-badge">propuesto</span>`;
  return "";
}

function includeSlot<T>(slot: TraitSlot<T>, soloValidado: boolean): boolean {
  if (slot.state === "ghost") return false;
  if (soloValidado) return slot.state === "crowned";
  return true;
}

function includeMultiItem<T>(item: MultiItem<T>, soloValidado: boolean): boolean {
  if (soloValidado) return item.crowned;
  return true;
}

function primaryColorHex(view: BrandKitBookView, soloValidado: boolean): string {
  const primary = view.palette.find((p) => p.role === "primary");
  if (primary && includeSlot(primary.slot, soloValidado) && primary.slot.value?.hex) {
    return primary.slot.value.hex;
  }
  for (const { slot } of view.palette) {
    if (includeSlot(slot, soloValidado) && slot.value?.hex) return slot.value.hex;
  }
  return "#1a1b1e";
}

function surfacePageHex(view: BrandKitBookView, soloValidado: boolean): string {
  const bg = view.palette.find((p) => p.role === "background");
  if (bg && includeSlot(bg.slot, soloValidado) && bg.slot.value?.hex) return bg.slot.value.hex;
  return "#f6f5f2";
}

function accentColorHex(view: BrandKitBookView, soloValidado: boolean): string {
  const accent = view.palette.find((p) => p.role === "accent");
  if (accent && includeSlot(accent.slot, soloValidado) && accent.slot.value?.hex) return accent.slot.value.hex;
  return primaryColorHex(view, soloValidado);
}

function coverTextColor(hex: string): string {
  return readableTextOn(hex) === "#ffffff" ? "#ffffff" : "#1a1a1a";
}

function extractRichCopy(doc: BrandKitDocument | undefined): StyleGuideRichCopy {
  const voice = doc?.slots.voice?.value as VoiceValue | undefined;
  const essence = doc?.slots.essence?.value as EssenceValue | undefined;
  const visual = doc?.slots.visualWorld?.value as VisualWorldValue | undefined;
  const gallery = doc?.slots.gallery?.value as GalleryValue | undefined;

  const categoryBriefs = GALLERY_CATEGORY_ORDER.map((category) => {
    const brief = gallery?.categoryBriefs?.find((entry) => entry.category === category);
    const meta = categoryMeta(category);
    return {
      category,
      label: meta.label,
      description: brief?.description?.trim() || meta.hint,
    };
  }).filter((entry) => entry.description);

  return {
    voiceSummary: voice?.summary?.trim() ?? "",
    essenceSummary: essence?.summary?.trim() ?? "",
    essenceHeadline: essence?.headline?.trim() ?? "",
    visualWorldSummary: visual?.summary?.trim() ?? "",
    galleryTone: gallery?.styleToneExplanation?.trim() ?? "",
    categoryBriefs,
  };
}

function typographyStylesheets(view: BrandKitBookView, soloValidado: boolean, forPdf: boolean): string {
  if (forPdf) return "";
  const urls = new Set<string>();
  for (const slot of [view.typography.primary, view.typography.secondary]) {
    if (!includeSlot(slot, soloValidado) || !slot.value?.specimenCssUrl) continue;
    urls.add(slot.value.specimenCssUrl);
  }
  return [...urls].map((url) => `<link rel="stylesheet" href="${escAttr(url)}"/>`).join("\n");
}

function typographyInlineFontFaces(view: BrandKitBookView, soloValidado: boolean): string {
  const rules: string[] = [];
  for (const slot of [view.typography.primary, view.typography.secondary]) {
    if (!includeSlot(slot, soloValidado) || !slot.value?.specimenFontFaces) continue;
    const family = slot.value.family.replace(/'/g, "\\'");
    for (const [weight, dataUrl] of Object.entries(slot.value.specimenFontFaces)) {
      const css = typographyWeightCss(weight);
      const style = css.fontStyle ?? "normal";
      const format = dataUrl.includes("font/ttf") ? "truetype" : dataUrl.includes("font/otf") ? "opentype" : "woff2";
      rules.push(
        `@font-face{font-family:'${family}';src:url('${dataUrl}') format('${format}');font-weight:${css.fontWeight};font-style:${style};font-display:swap;}`,
      );
    }
  }
  return rules.join("\n");
}

function renderMosaicCss(surfaces: {
  primary: string;
  page: string;
  raised: string;
  accent: string;
  onPrimary: string;
}): string {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    :root {
      --sg-gap: 8px;
      --sg-pad: 36px;
      --sg-primary: ${surfaces.primary};
      --sg-page: ${surfaces.page};
      --sg-raised: ${surfaces.raised};
      --sg-accent: ${surfaces.accent};
      --sg-on-primary: ${surfaces.onPrimary};
      --sg-ink: #1a1a1a;
      --sg-ink-soft: rgba(26, 26, 26, 0.62);
      --sg-font: system-ui, -apple-system, sans-serif;
    }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: var(--sg-font);
      color: var(--sg-ink);
      background: var(--sg-page);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sg-bands {
      display: flex;
      flex-direction: column;
      gap: var(--sg-gap);
      padding: var(--sg-gap);
      min-height: 100vh;
    }
    .sg-band {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: var(--sg-gap);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sg-cell {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding: var(--sg-pad);
      border-radius: 0;
    }
    .sg-cell--5 { grid-column: span 5; }
    .sg-cell--7 { grid-column: span 7; }
    .sg-cell--12 { grid-column: span 12; }
    .sg-surface-primary { background: var(--sg-primary); color: var(--sg-on-primary); }
    .sg-surface-raised { background: var(--sg-raised); color: var(--sg-ink); }
    .sg-surface-page { background: var(--sg-page); color: var(--sg-ink); }
    .sg-surface-accent {
      background: color-mix(in srgb, var(--sg-accent) 12%, var(--sg-raised));
      color: var(--sg-ink);
    }
    .sg-chapter {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin: 0 0 18px;
      opacity: 0.72;
    }
    .sg-surface-primary .sg-chapter { color: inherit; opacity: 0.88; }
    .sg-badge {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 8px;
      font-size: 9px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.2);
    }
    .sg-prose {
      font-size: 14px;
      line-height: 1.62;
      max-width: 48ch;
      margin: 0;
    }
    .sg-prose--wide { max-width: 62ch; }
    .sg-headline {
      font-size: clamp(28px, 4vw, 44px);
      font-weight: 500;
      line-height: 1.05;
      letter-spacing: -0.02em;
      margin: 0 0 12px;
    }
    .sg-subhead {
      font-size: 17px;
      font-style: italic;
      line-height: 1.45;
      margin: 0;
      opacity: 0.82;
      max-width: 42ch;
    }
    .sg-meta {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.7;
      margin: 0 0 8px;
    }
    .sg-cover {
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 52vh;
      gap: 18px;
    }
    .sg-cover__logo { max-height: 120px; max-width: min(220px, 60%); object-fit: contain; }
    .sg-logo-pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--sg-gap);
      flex: 1;
      min-height: 200px;
    }
    .sg-logo-plinth {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px;
      min-height: 180px;
    }
    .sg-logo-plinth--light { background: var(--sg-raised); }
    .sg-logo-plinth--dark { background: #111827; }
    .sg-logo-plinth img { max-height: 96px; max-width: 90%; object-fit: contain; }
    .sg-logo-plinth__label {
      position: absolute;
      top: 16px;
      left: 16px;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.55;
    }
    .sg-logo-plinth-wrap { position: relative; flex: 1; display: flex; flex-direction: column; }
    .sg-palette-row {
      display: flex;
      gap: 2px;
      flex: 1;
      min-height: 200px;
      align-items: stretch;
    }
    .sg-palette-card {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 14px 12px;
    }
    .sg-palette-card--primary { flex: 1.18 1 0; }
    .sg-palette-card__badge {
      display: inline-block;
      margin-bottom: 6px;
      padding: 2px 6px;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.2);
    }
    .sg-palette-card__name {
      font-size: 14px;
      font-weight: 500;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .sg-palette-card__role {
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.78;
      margin-top: 2px;
    }
    .sg-palette-card__hex {
      font-size: 11px;
      font-family: ui-monospace, monospace;
      margin-top: 6px;
      opacity: 0.9;
    }
    .sg-palette-card__line {
      font-size: 10px;
      margin-top: 3px;
      opacity: 0.82;
    }
    .sg-palette-card__tag {
      display: inline-block;
      min-width: 2.4em;
      font-size: 8px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.65;
      margin-right: 6px;
    }
    .sg-palette-proportions { margin-top: 20px; }
    .sg-palette-proportions__bar {
      display: flex;
      height: 10px;
      overflow: hidden;
      background: rgba(26, 26, 26, 0.06);
    }
    .sg-palette-proportions__legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      margin-top: 10px;
      font-size: 10px;
      color: var(--sg-ink-soft);
    }
    .sg-type-strip { display: flex; flex-direction: column; gap: 22px; flex: 1; }
    .sg-type-col__label {
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--sg-ink-soft);
      margin-bottom: 4px;
    }
    .sg-type-col__family { font-size: 15px; font-weight: 500; margin-bottom: 4px; }
    .sg-type-col__meta { font-size: 11px; color: var(--sg-ink-soft); }
    .sg-type-display {
      font-size: clamp(32px, 5vw, 52px);
      line-height: 1.04;
      margin: 14px 0 10px;
      letter-spacing: -0.02em;
    }
    .sg-type-alphabet {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      letter-spacing: 0.04em;
      color: var(--sg-ink-soft);
      word-break: break-all;
    }
    .sg-type-weight {
      border-top: 1px solid rgba(26, 26, 26, 0.1);
      padding-top: 12px;
      margin-top: 12px;
    }
    .sg-type-weight__label { font-size: 10px; color: var(--sg-ink-soft); margin-bottom: 6px; }
    .sg-type-weight__sample { font-size: 22px; line-height: 1.3; }
    .sg-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .sg-chip {
      padding: 6px 14px;
      font-size: 13px;
      background: rgba(26, 26, 26, 0.06);
    }
    .sg-surface-primary .sg-chip { background: rgba(255, 255, 255, 0.14); }
    .sg-claims { margin: 12px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }
    .sg-claim-forbidden { text-decoration: line-through; color: var(--sg-ink-soft); }
    .sg-gallery-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sg-gap);
      margin-top: 8px;
    }
    .sg-gallery-card {
      display: flex;
      flex-direction: column;
      background: var(--sg-raised);
      min-height: 0;
    }
    .sg-gallery-card img {
      width: 100%;
      aspect-ratio: 4/3;
      object-fit: cover;
      display: block;
    }
    .sg-gallery-card__body { padding: 12px 14px 16px; }
    .sg-gallery-card__title {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin: 0 0 6px;
    }
    .sg-gallery-card__desc {
      font-size: 12px;
      line-height: 1.45;
      margin: 0;
      color: var(--sg-ink-soft);
    }
    .sg-gallery-placeholder {
      aspect-ratio: 4/3;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(26, 26, 26, 0.06);
      color: var(--sg-ink-soft);
      font-size: 12px;
    }
    .sg-dna-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sg-gap);
      margin-top: 8px;
    }
    .sg-dna-card {
      padding: 18px 20px;
      background: var(--sg-raised);
    }
    .sg-dna-card__title {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin: 0 0 8px;
    }
    .sg-note { font-size: 11px; color: var(--sg-ink-soft); margin-top: 12px; }
    .sg-sources { font-size: 13px; line-height: 1.5; padding-left: 18px; margin: 0; }
  `;
}

function renderPaletteCards(
  view: BrandKitBookView,
  soloValidado: boolean,
  paletteFromDoc?: PaletteValue,
): string {
  const colors = view.palette
    .filter(({ slot }) => includeSlot(slot, soloValidado))
    .map(({ role, slot }) => ({
      role,
      hex: slot.value?.hex,
      usageWeight: paletteFromDoc?.colors.find((c) => c.role === role)?.usageWeight,
    }))
    .filter((entry): entry is typeof entry & { hex: string } => typeof entry.hex === "string" && entry.hex.length > 0);

  if (!colors.length) return `<p class="sg-prose">Sin paleta definida</p>`;

  const cards = colors
    .map(({ role, hex }) => {
      const normalized = hex.startsWith("#") ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
      const rgb = hexToRgb(normalized);
      const cmyk = rgb ? rgbToCmyk(rgb) : null;
      const textColor = readableTextOn(normalized);
      const featured = role === "primary";
      return `<div class="sg-palette-card${featured ? " sg-palette-card--primary" : ""}" style="background:${esc(normalized)};color:${textColor}">
        ${featured ? `<span class="sg-palette-card__badge">Principal</span>` : ""}
        <span class="sg-palette-card__name">${esc(nameColor(normalized))}</span>
        <span class="sg-palette-card__role">${esc(PALETTE_ROLE_LABEL_ES[role] ?? role)}</span>
        <span class="sg-palette-card__hex">${esc(normalized)}</span>
        <span class="sg-palette-card__line"><span class="sg-palette-card__tag">rgb</span>${rgb ? esc(formatRgb(rgb)) : "—"}</span>
        <span class="sg-palette-card__line"><span class="sg-palette-card__tag">cmyk</span>${cmyk ? esc(formatCmyk(cmyk)) : "—"}</span>
      </div>`;
    })
    .join("");

  const weights = colors.map((c) => c.usageWeight ?? (c.role === "primary" ? 40 : 12));
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const bar = colors
    .map((c, i) => {
      const pct = Math.max(4, Math.round((weights[i] / total) * 100));
      return `<span class="sg-palette-proportions__segment" style="flex:${pct};background:${esc(c.hex)}"></span>`;
    })
    .join("");
  const legend = colors
    .map((c) => `<span>${esc(PALETTE_ROLE_LABEL_ES[c.role] ?? c.role)}</span>`)
    .join("");

  return `<div class="sg-palette-row">${cards}</div>
    <div class="sg-palette-proportions">
      <div class="sg-palette-proportions__bar">${bar}</div>
      <div class="sg-palette-proportions__legend">${legend}</div>
    </div>`;
}

function renderTypography(
  view: BrandKitBookView,
  soloValidado: boolean,
  rich: StyleGuideRichCopy,
): string {
  const blocks: string[] = [];
  const specimenText = rich.essenceHeadline || rich.essenceSummary || "Marca con carácter";

  const renderTypo = (label: string, slot: TraitSlot<TypographyValue>) => {
    if (!includeSlot(slot, soloValidado) || !slot.value) return;
    const v = slot.value;
    const stack = specimenFontStack(v);
    const weights =
      v.embedStatus === "embedded_extracted" && v.extractedWeights?.length
        ? v.extractedWeights
        : v.specimenAvailable
          ? v.weights.length
            ? v.weights
            : ["Regular"]
          : v.weights.length
            ? v.weights
            : ["Regular"];
    const weightBlocks = weights
      .map(
        (weight) =>
          `<div class="sg-type-weight"><p class="sg-type-weight__label">${esc(weight)}</p><p class="sg-type-weight__sample" style="font-family:${escAttr(stack)}">${esc("Aa Bb Cc · 0123456789")}</p></div>`,
      )
      .join("");
    blocks.push(
      `<div class="sg-type-col">
        <p class="sg-type-col__label">${esc(label)} ${statusBadge(slot.state, soloValidado)}</p>
        <p class="sg-type-col__family" style="font-family:${escAttr(stack)}">${esc(v.family)}</p>
        <p class="sg-type-col__meta">${esc(weights.join(" · "))}</p>
        <p class="sg-type-display" style="font-family:${escAttr(stack)}">${esc(specimenText)}</p>
        <div class="sg-type-alphabet" style="font-family:${escAttr(stack)}"><span>${ALPHABET_LINE}</span><span>${NUMERIC_LINE}</span></div>
        ${weightBlocks}
      </div>`,
    );
  };

  renderTypo("Principal", view.typography.primary);
  renderTypo("Secundaria", view.typography.secondary);

  return blocks.length
    ? `<div class="sg-type-strip">${blocks.join("")}</div>`
    : `<p class="sg-prose">Sin tipografía definida</p>`;
}

function renderVoiceEssence(
  view: BrandKitBookView,
  soloValidado: boolean,
  rich: StyleGuideRichCopy,
): string {
  const parts: string[] = [];

  if (rich.essenceHeadline || (includeSlot(view.voice.tagline, soloValidado) && view.voice.tagline.value)) {
    const text = rich.essenceHeadline || view.voice.tagline.value?.text || "";
    parts.push(
      `<p class="sg-headline">${esc(text)} ${statusBadge(view.voice.tagline.state, soloValidado)}</p>`,
    );
  }
  if (rich.essenceSummary) {
    parts.push(`<p class="sg-prose sg-prose--wide">${esc(rich.essenceSummary)}</p>`);
  }

  if (rich.voiceSummary) {
    parts.push(`<h3 class="sg-chapter" style="margin-top:24px">Voz</h3><p class="sg-prose">${esc(rich.voiceSummary)}</p>`);
  }

  const tones = view.voice.tone.items.filter((i) => includeMultiItem(i, soloValidado));
  if (tones.length) {
    parts.push(
      `<h3 class="sg-chapter" style="margin-top:20px">Tono</h3><div class="sg-chips">${tones
        .map((t) => `<span class="sg-chip">${esc(t.value.text)}</span>`)
        .join("")}</div>`,
    );
  }

  const absolutes = view.voice.claimsAbsolute.items.filter((i) => includeMultiItem(i, soloValidado));
  if (absolutes.length) {
    parts.push(`<h3 class="sg-chapter" style="margin-top:20px">Esencia</h3><ul class="sg-claims">${absolutes.map((c) => `<li>${esc(c.value.text)}</li>`).join("")}</ul>`);
  }

  const forbidden = view.voice.claimsForbidden.items.filter((i) => includeMultiItem(i, soloValidado));
  if (forbidden.length) {
    parts.push(
      `<h3 class="sg-chapter" style="margin-top:16px">Evitar</h3><ul class="sg-claims">${forbidden
        .map((c) => {
          const v = c.value as ClaimValue;
          return `<li class="sg-claim-forbidden">${esc(v.text)}</li>`;
        })
        .join("")}</ul>`,
    );
  }

  return parts.join("") || `<p class="sg-prose">Sin voz definida</p>`;
}

function renderVisualDna(rich: StyleGuideRichCopy): string {
  const cards = rich.categoryBriefs
    .map(
      (brief) =>
        `<article class="sg-dna-card"><h4 class="sg-dna-card__title">${esc(brief.label)}</h4><p class="sg-prose">${esc(brief.description)}</p></article>`,
    )
    .join("");
  const summary = rich.visualWorldSummary
    ? `<p class="sg-prose sg-prose--wide" style="margin-bottom:16px">${esc(rich.visualWorldSummary)}</p>`
    : "";
  const tone = rich.galleryTone ? `<p class="sg-note">${esc(rich.galleryTone)}</p>` : "";
  return `${summary}<div class="sg-dna-grid">${cards || `<article class="sg-dna-card"><p class="sg-prose">Sin briefs de imagen analizados.</p></article>`}</div>${tone}`;
}

function renderGallery(
  view: BrandKitBookView,
  soloValidado: boolean,
  embedded: Map<string, string>,
  rich: StyleGuideRichCopy,
): string {
  const cards: string[] = [];
  const briefByCategory = new Map(rich.categoryBriefs.map((b) => [b.category, b.description]));

  for (const { category, slot } of view.visualUniverse) {
    for (const item of slot.items.filter((i) => includeMultiItem(i, soloValidado))) {
      const dna = item.value as ImageDnaValue;
      const raw = item.derived?.generatedImageUrl ?? dna.referenceImageUrl;
      if (!raw) continue;
      const img = resolveEmbeddedUrl(raw, embedded);
      const galleryCategory = Object.entries({
        people: "people_mood",
        environments: "places",
        objects: "objects",
        textures: "textures",
        general: "general",
      }).find(([imageCat]) => imageCat === category)?.[1] as GalleryGenerateCategory | undefined;
      const label = VISUAL_CATEGORY_LABEL_ES[category] ?? category;
      const desc =
        (galleryCategory ? briefByCategory.get(galleryCategory) : undefined) ||
        dna.axes.tratamiento ||
        dna.axes.sujeto ||
        "";
      const imgBlock = img
        ? `<img src="${escAttr(img)}" alt=""/>`
        : `<div class="sg-gallery-placeholder">Sin imagen</div>`;
      cards.push(
        `<article class="sg-gallery-card">${imgBlock}<div class="sg-gallery-card__body"><h4 class="sg-gallery-card__title">${esc(label)}</h4><p class="sg-gallery-card__desc">${esc(String(desc))}</p></div></article>`,
      );
    }
  }

  return cards.length
    ? `<div class="sg-gallery-grid">${cards.join("")}</div>`
    : `<p class="sg-prose">Sin imágenes generadas. Usa la galería del estudio para crear referencias visuales.</p>`;
}

function collectLogoCandidates(genome: Genome, soloValidado: boolean): Array<{
  logo: LogoValue;
  vectorUrl?: string;
  rasterImageUrl?: string;
}> {
  const trait = genome.traits["logo.primary"] as Trait<LogoValue> | undefined;
  if (!trait) return [];
  return trait.candidates
    .filter((c) => c.status !== "archived")
    .filter((c) => !soloValidado || trait.crownedIds.includes(c.id))
    .map((c) => ({
      logo: c.value,
      vectorUrl: c.derived?.vectorUrl,
      rasterImageUrl: c.derived?.rasterImageUrl,
    }));
}

function resolveLogoSrc(
  logo: LogoValue,
  vectorUrl: string | undefined,
  embedded: Map<string, string>,
): string | null {
  const raw = vectorUrl?.trim() || logo.imageUrl;
  return resolveEmbeddedUrl(raw, embedded);
}

function isVectorUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith("data:image/svg+xml") || u.endsWith(".svg") || u.includes("image/svg+xml");
}

function renderLogoSection(
  view: BrandKitBookView,
  genome: Genome,
  soloValidado: boolean,
  embedded: Map<string, string>,
): string {
  const logos = collectLogoCandidates(genome, soloValidado);
  const positive =
    logos.find((l) => l.logo.variant === "positive") ??
    (includeSlot(view.logo.primary, soloValidado) && view.logo.primary.value
      ? { logo: view.logo.primary.value, vectorUrl: undefined, rasterImageUrl: undefined }
      : undefined);
  const negative = logos.find((l) => l.logo.variant === "negative");

  if (!positive?.logo.imageUrl && !negative?.logo.imageUrl) {
    return includeSlot(view.logo.primary, soloValidado)
      ? `<p class="sg-prose">Sin logo</p>`
      : `<p class="sg-prose">Sin logo confirmado</p>`;
  }

  const vectorCandidate = positive?.vectorUrl || (isVectorUrl(positive?.logo.imageUrl ?? "") ? positive?.logo.imageUrl : null);
  const rasterCandidate =
    positive?.rasterImageUrl ||
    (positive?.logo.imageUrl && !isVectorUrl(positive.logo.imageUrl) ? positive.logo.imageUrl : null) ||
    positive?.logo.imageUrl;

  const rasterSrc = rasterCandidate ? resolveEmbeddedUrl(rasterCandidate, embedded) : null;
  const vectorSrc = vectorCandidate ? resolveEmbeddedUrl(vectorCandidate, embedded) : null;

  const rasterBlock = rasterSrc
    ? `<div class="sg-logo-plinth-wrap"><span class="sg-logo-plinth__label">Imagen</span><div class="sg-logo-plinth sg-logo-plinth--light"><img src="${escAttr(rasterSrc)}" alt="Logo raster"/></div></div>`
    : `<div class="sg-logo-plinth-wrap"><span class="sg-logo-plinth__label">Imagen</span><div class="sg-logo-plinth sg-logo-plinth--light"><span class="sg-note">Sin raster</span></div></div>`;

  const vectorBlock = vectorSrc
    ? `<div class="sg-logo-plinth-wrap"><span class="sg-logo-plinth__label">Vectorial</span><div class="sg-logo-plinth sg-logo-plinth--light"><img src="${escAttr(vectorSrc)}" alt="Logo vectorial"/></div></div>`
    : `<div class="sg-logo-plinth-wrap"><span class="sg-logo-plinth__label">Vectorial</span><div class="sg-logo-plinth sg-logo-plinth--light"><span class="sg-note">Vectoriza el logo en el estudio</span></div></div>`;

  const negativeBlock =
    negative?.logo.imageUrl && resolveLogoSrc(negative.logo, negative.vectorUrl, embedded)
      ? `<div class="sg-logo-plinth-wrap" style="margin-top:8px"><span class="sg-logo-plinth__label">Negativo</span><div class="sg-logo-plinth sg-logo-plinth--dark"><img src="${escAttr(resolveLogoSrc(negative.logo, negative.vectorUrl, embedded)!)}" alt="Logo negativo"/></div></div>`
      : "";

  return `<div class="sg-logo-pair">${rasterBlock}${vectorBlock}</div>${negativeBlock}`;
}

function renderSources(genome: Genome, soloValidado: boolean): string {
  if (soloValidado || !genome.sources.length) return "";
  const items = genome.sources
    .map((s) => {
      const kind = s.kind === "url" ? "web" : s.kind;
      const loc = s.locator ? ` · ${esc(s.locator)}` : "";
      return `<li><strong>${esc(s.label)}</strong> · ${esc(kind)}${loc}</li>`;
    })
    .join("");
  return `<section class="sg-band"><div class="sg-cell sg-cell--12 sg-surface-page"><p class="sg-chapter">Fuentes</p><ul class="sg-sources">${items}</ul></div></section>`;
}

function collectImageUrls(view: BrandKitBookView, genome: Genome, soloValidado: boolean): string[] {
  const urls: string[] = [];
  for (const entry of collectLogoCandidates(genome, soloValidado)) {
    if (entry.vectorUrl) urls.push(entry.vectorUrl);
    if (entry.rasterImageUrl) urls.push(entry.rasterImageUrl);
    if (entry.logo.imageUrl) urls.push(entry.logo.imageUrl);
  }
  for (const { slot } of view.visualUniverse) {
    for (const item of slot.items.filter((i) => includeMultiItem(i, soloValidado))) {
      const dna = item.value as ImageDnaValue;
      const raw = item.derived?.generatedImageUrl ?? dna.referenceImageUrl;
      if (raw) urls.push(raw);
    }
  }
  return urls;
}

export async function renderBrandKitStyleGuide(
  genome: Genome,
  options: {
    exportMode?: BrandKitStyleGuideExportMode;
    projectName?: string;
    generatedAt?: string;
    forPdf?: boolean;
    sourceDocument?: BrandKitDocument;
  } = {},
): Promise<BrandKitStyleGuideDocument> {
  const exportMode: BrandKitStyleGuideExportMode = options.exportMode === "cliente" ? "cliente" : "operativo";
  const soloValidado = resolveBrandKitStyleGuideSoloValidado(exportMode);
  const forPdf = options.forPdf === true;
  const view = buildBookView(genome);
  const rich = extractRichCopy(options.sourceDocument);
  const paletteDoc = options.sourceDocument?.slots.palette?.value as PaletteValue | undefined;
  const embedded = await embedImageUrlsForStyleGuide(collectImageUrls(view, genome, soloValidado));

  const primaryHex = primaryColorHex(view, soloValidado);
  const pageHex = surfacePageHex(view, soloValidado);
  const accentHex = accentColorHex(view, soloValidado);
  const onPrimary = coverTextColor(primaryHex);

  const crownedPositive = collectLogoCandidates(genome, soloValidado).find((l) => l.logo.variant === "positive");
  const coverLogo = resolveLogoSrc(
    view.logo.primary.value ?? crownedPositive?.logo ?? { imageUrl: "", variant: "positive" },
    crownedPositive?.vectorUrl,
    embedded,
  );

  const derivations = buildBrandKitBookDerivations(view, {
    soloValidado,
    logoImageUrl: coverLogo,
  });

  const projectName = options.projectName?.trim() || options.sourceDocument?.brandName?.value?.trim() || "BrandKit";
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const modeLabel = BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS[exportMode];
  const typoSheets = typographyStylesheets(view, soloValidado, forPdf);
  const typoFaces = typographyInlineFontFaces(view, soloValidado);

  const coverHeadline = rich.essenceHeadline || view.voice.tagline.value?.text || rich.essenceSummary;
  const sourceDoc = options.sourceDocument;
  const chapterPlan = sourceDoc ? buildStyleGuideChapterPlan(sourceDoc, soloValidado) : null;
  const chapterIncluded = (id: string) => !chapterPlan || chapterPlan.find((c) => c.id === id)?.included !== false;

  const logoPaletteBand =
    chapterIncluded("logo") || chapterIncluded("palette")
      ? `<section class="sg-band sg-band--page" id="sg-chapter-logo">
    ${chapterIncluded("logo") ? `<div class="sg-cell sg-cell--7 sg-surface-raised">
      <p class="sg-chapter">Logo</p>
      ${renderLogoSection(view, genome, soloValidado, embedded)}
      ${derivations.logoSafeAreaSvg ? `<div style="margin-top:20px">${derivations.logoSafeAreaSvg}</div>` : ""}
    </div>` : ""}
    ${chapterIncluded("palette") ? `<div class="sg-cell sg-cell--${chapterIncluded("logo") ? "5" : "12"} sg-surface-page">
      <p class="sg-chapter">Paleta</p>
      ${renderPaletteCards(view, soloValidado, paletteDoc)}
    </div>` : ""}
  </section>`
      : "";

  const typographyBand = chapterIncluded("typography")
    ? `<section class="sg-band sg-band--page" id="sg-chapter-typography">
    <div class="sg-cell sg-cell--12 sg-surface-raised">
      <p class="sg-chapter">Tipografía</p>
      ${renderTypography(view, soloValidado, rich)}
    </div>
  </section>`
    : "";

  const voiceVisualBand =
    chapterIncluded("voice") || chapterIncluded("visual")
      ? `<section class="sg-band sg-band--page" id="sg-chapter-voice">
    ${chapterIncluded("voice") ? `<div class="sg-cell sg-cell--5 sg-surface-accent">
      <p class="sg-chapter">Voz & esencia</p>
      ${renderVoiceEssence(view, soloValidado, rich)}
    </div>` : ""}
    ${chapterIncluded("visual") ? `<div class="sg-cell sg-cell--${chapterIncluded("voice") ? "7" : "12"} sg-surface-raised">
      <p class="sg-chapter">Mundo visual</p>
      ${renderVisualDna(rich)}
    </div>` : ""}
  </section>`
      : "";

  const galleryBand = chapterIncluded("gallery")
    ? `<section class="sg-band sg-band--page" id="sg-chapter-gallery">
    <div class="sg-cell sg-cell--12 sg-surface-page">
      <p class="sg-chapter">Biblioteca visual</p>
      ${renderGallery(view, soloValidado, embedded, rich)}
    </div>
  </section>`
    : "";

  const toc = chapterPlan ? renderStyleGuideTableOfContents(chapterPlan) : "";
  const applications =
    sourceDoc && chapterIncluded("applications")
      ? renderStyleGuideApplicationsSection(sourceDoc, soloValidado, embedded)
      : "";
  const stationery =
    sourceDoc && chapterIncluded("stationery")
      ? renderStyleGuideStationerySection(sourceDoc, soloValidado, embedded)
      : "";
  const closing = renderStyleGuideClosingPage(
    projectName,
    generatedAt,
    soloValidado ? "versión final" : modeLabel,
  );
  const sourcesAppendix = renderSources(genome, soloValidado).replace(
    'class="sg-band"',
    'class="sg-band sg-appendix"',
  );

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>${esc(projectName)} — libro de estilo</title>
${typoSheets}
<style>${renderMosaicCss({
    primary: primaryHex,
    page: pageHex,
    raised: "#ffffff",
    accent: accentHex,
    onPrimary,
  })}${presentationSectionsCss()}${typoFaces ? `\n${typoFaces}` : ""}</style></head><body>
<div class="sg-bands">
  <section class="sg-band sg-band--page" id="sg-chapter-cover">
    <div class="sg-cell sg-cell--12 sg-surface-primary sg-cover">
      ${coverLogo ? `<img class="sg-cover__logo" src="${escAttr(coverLogo)}" alt=""/>` : ""}
      <p class="sg-meta">libro de estilo · ${esc(new Date(generatedAt).toLocaleDateString("es-ES"))} · ${esc(soloValidado ? "versión final" : modeLabel)}</p>
      <h1 class="sg-headline">${esc(projectName)}</h1>
      ${coverHeadline ? `<p class="sg-subhead">${esc(coverHeadline)}</p>` : ""}
    </div>
  </section>

  ${toc}
  ${logoPaletteBand}
  ${typographyBand}
  ${voiceVisualBand}
  ${galleryBand}
  ${applications}
  ${stationery}
  ${closing}
</div>
${sourcesAppendix}
</body></html>`;

  return { html, completenessPercent: view.completenessPercent, generatedAt, exportMode, soloValidado };
}

export function brandKitStyleGuideFilename(
  projectName: string | undefined,
  generatedAt: string,
  exportMode: BrandKitStyleGuideExportMode = "operativo",
): string {
  const slug = (projectName ?? "brandKit").replace(/\W+/g, "-").toLowerCase();
  const date = generatedAt.slice(0, 10);
  const suffix = exportMode === "cliente" ? "final" : "borrador";
  return `${slug}-libro-${suffix}-${date}.pdf`;
}

/** Fallback cliente: descarga HTML cuando Chromium no está disponible. */
export async function downloadBrandKitStyleGuideHtml(
  genome: Genome,
  projectName?: string,
  exportMode?: BrandKitStyleGuideExportMode,
  sourceDocument?: BrandKitDocument,
): Promise<void> {
  const doc = await renderBrandKitStyleGuide(genome, { projectName, exportMode, sourceDocument });
  const blob = new Blob([doc.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(projectName ?? "brandKit").replace(/\W+/g, "-").toLowerCase()}-libro.html`;
  a.click();
  URL.revokeObjectURL(url);
}
