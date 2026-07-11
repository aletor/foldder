/**
 * Render HTML del libro de estilo BrandKit (full-bleed, capítulos con derivados).
 */

import type { Genome, Trait } from "../model/trait";
import type { ClaimValue, ImageDnaValue, LogoValue, TypographyValue } from "../model/trait-values";
import type { ImageCategory } from "../model/trait-ids";
import { buildBookView, type FaceState, type BrandKitBookView, type MultiItem, type TraitSlot } from "./book-view";
import { buildBrandKitBookDerivations, formatColorSpecRow } from "./book-derivations";
import {
  embedImageUrlsForStyleGuide,
  resolveEmbeddedUrl,
} from "./style-guide-assets";
import { specimenFontStack, typographyWeightCss } from "../specimen/typography-specimen";
import {
  BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS,
  type BrandKitStyleGuideExportMode,
  resolveBrandKitStyleGuideSoloValidado,
} from "./style-guide-export-types";

export type BrandKitStyleGuideDocument = {
  html: string;
  completenessPercent: number;
  generatedAt: string;
  exportMode: BrandKitStyleGuideExportMode;
  soloValidado: boolean;
};

const VISUAL_CATEGORY_LABEL_ES: Record<ImageCategory, string> = {
  people: "personas",
  objects: "objetos",
  textures: "texturas",
  environments: "entornos",
  protagonists: "protagonista",
  general: "general",
};

const AXIS_LABEL_ES: Record<string, string> = {
  sujeto: "sujeto",
  edad: "edad",
  entorno: "entorno",
  accion: "acción",
  encuadre: "encuadre",
  paleta: "paleta",
  tratamiento: "tratamiento",
};

const PALETTE_ROLE_LABEL_ES: Record<string, string> = {
  primary: "primario",
  secondary: "secundario",
  accent: "acento",
  background: "fondo",
  text: "soporte",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return esc(s);
}

function statusBadge(state: FaceState, soloValidado: boolean): string {
  if (soloValidado || state === "crowned") return "";
  if (state === "proposed") return `<span class="badge badge-proposed">propuesto</span>`;
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

function coverTextColor(hex: string): string {
  const rgb = hex.replace("#", "");
  if (rgb.length !== 6) return "#ffffff";
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#1a1b1e" : "#ffffff";
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

function typographyStatusNote(value: TypographyValue): string {
  if (value.embedStatus === "identified_only") {
    return `<p class="note">${esc(value.family)} · identificada en documento de marca — binario no disponible${value.weights.length ? ` · pesos detectados: ${esc(value.weights.join(", "))}` : ""}</p>`;
  }
  if (value.specimenLicense) {
    return `<p class="note">${esc(value.specimenLicense)}</p>`;
  }
  return "";
}

function renderCss(primaryHex: string, coverFg: string): string {
  const primaryFamily = "var(--brand-font, system-ui, -apple-system, sans-serif)";
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    :root { --brand-primary: ${primaryHex}; --brand-font: system-ui, -apple-system, sans-serif; }
    body { margin: 0; font-family: ${primaryFamily}; color: #1a1b1e; background: #fff; }
    .page { min-height: 100vh; padding: 48px 56px; page-break-after: always; }
    .cover {
      background: ${primaryHex}; color: ${coverFg};
      display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
      gap: 24px;
    }
    .cover-logo { max-height: 140px; max-width: 70%; object-fit: contain; }
    .cover-meta { opacity: 0.82; font-size: 0.85rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .cover h1 { font-size: 2.75rem; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
    .cover p { margin: 0; opacity: 0.9; }
    h2 { font-size: 1.5rem; margin: 0 0 24px; text-transform: lowercase; letter-spacing: 0.08em; color: var(--brand-primary); }
    h3 { font-size: 0.85rem; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.12em; color: #666; }
    .badge { font-size: 0.65rem; padding: 2px 8px; border-radius: 999px; margin-left: 8px; vertical-align: middle; }
    .badge-proposed { background: #fff3cd; color: #856404; }
    .palette-row { display: flex; gap: 0; margin: 16px 0; border-radius: 12px; overflow: hidden; }
    .swatch { flex: 1; min-height: 120px; padding: 14px; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; }
    .swatch-role { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.85; }
    .swatch code { font-size: 0.72rem; opacity: 0.95; }
    .spec-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 12px 0; }
    .spec-table th, .spec-table td { border-bottom: 1px solid #e5e5e5; padding: 8px 10px; text-align: left; }
    .claim-forbidden { text-decoration: line-through; color: #666; }
    .claim-why { font-size: 0.85rem; color: #888; font-style: italic; }
    .visual-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .visual-card { border-radius: 12px; overflow: hidden; background: #f7f7f7; }
    .visual-card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
    .visual-card .visual-body { padding: 12px 14px 16px; }
    .visual-card ul { font-size: 0.8rem; color: #555; padding-left: 16px; margin: 8px 0 0; }
    .ref-placeholder { aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; background: #ececec; color: #888; font-size: 0.85rem; }
    .sources li { margin: 4px 0; font-size: 0.9rem; }
    .note { font-size: 0.8rem; color: #888; }
    .tone-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .tone-chip { background: #f3f3f3; padding: 6px 14px; border-radius: 999px; font-size: 0.9rem; }
    .tagline { font-size: 2rem; font-weight: 700; line-height: 1.2; margin: 16px 0; }
    .logo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 16px 0; }
    .logo-card { border-radius: 12px; padding: 28px; display: flex; align-items: center; justify-content: center; min-height: 160px; }
    .logo-card img { max-height: 100px; max-width: 100%; object-fit: contain; }
    .logo-card--light { background: #f5f5f5; }
    .logo-card--dark { background: #111827; }
    .specimen-display { font-size: 2.5rem; line-height: 1.05; margin: 8px 0 16px; }
    .specimen-weight { border-top: 1px solid #e8e8e8; padding-top: 12px; margin-top: 12px; }
    .specimen-sample { font-size: 1.35rem; line-height: 1.35; margin-top: 6px; }
  `;
}

function renderPalette(view: BrandKitBookView, soloValidado: boolean): string {
  const swatches = view.palette
    .filter(({ slot }) => includeSlot(slot, soloValidado))
    .map(({ role, slot }) => {
      const hex = slot.value?.hex;
      if (!hex) return "";
      const name = slot.value?.name ?? PALETTE_ROLE_LABEL_ES[role] ?? role;
      const fg = hex.toLowerCase() === "#ffffff" || hex.toLowerCase() === "#fff" ? "#1a1b1e" : "#fff";
      return `<div class="swatch" style="background:${esc(hex)};color:${fg}">
        <span class="swatch-role">${esc(PALETTE_ROLE_LABEL_ES[role] ?? role)} ${statusBadge(slot.state, soloValidado)}</span>
        <strong>${esc(name)}</strong>
        <code>${esc(hex.toUpperCase())}</code>
      </div>`;
    })
    .join("");
  return swatches ? `<div class="palette-row">${swatches}</div>` : "<p>Sin paleta</p>";
}

function renderColorSystem(derivations: ReturnType<typeof buildBrandKitBookDerivations>): string {
  if (!derivations.palette.length) return "<p>Sin colores para derivar especificaciones.</p>";
  const rows = derivations.palette
    .map(
      (c) =>
        `<tr><td>${esc(c.name ?? c.role)}</td><td>${esc(c.hex.toUpperCase())}</td><td>${esc(formatColorSpecRow(c))}</td></tr>`,
    )
    .join("");
  const wcag = derivations.wcagMatrix.length
    ? `<h3>Contraste (WCAG)</h3><table class="spec-table"><thead><tr><th>Par</th><th>Ratio</th><th>AA</th></tr></thead><tbody>${derivations.wcagMatrix
        .map(
          (p) =>
            `<tr><td>${esc(p.foregroundHex)} / ${esc(p.backgroundHex)}</td><td>${p.ratio.toFixed(2)}:1</td><td>${p.aaNormal ? "AA" : "—"}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";
  return `<table class="spec-table"><thead><tr><th>Rol</th><th>HEX</th><th>RGB · CMYK</th></tr></thead><tbody>${rows}</tbody></table>${wcag}<p class="note">* CMYK aproximado para referencia impresa.</p>`;
}

function renderTypography(
  view: BrandKitBookView,
  derivations: ReturnType<typeof buildBrandKitBookDerivations>,
  soloValidado: boolean,
): string {
  const blocks: string[] = [];
  const renderTypo = (label: string, slot: TraitSlot<TypographyValue>) => {
    if (!includeSlot(slot, soloValidado) || !slot.value) return;
    const v = slot.value;
    const stack = specimenFontStack(v);
    const statusNote = typographyStatusNote(v);
    const renderWeights =
      v.embedStatus === "embedded_extracted" && v.extractedWeights?.length
        ? v.extractedWeights
        : v.embedStatus === "identified_only"
          ? []
          : v.specimenAvailable
            ? v.weights.length
              ? v.weights
              : ["Regular"]
            : [];
    const weights = renderWeights
      .map(
        (weight) =>
          `<div class="specimen-weight"><p class="note">${esc(weight)}</p><p class="specimen-sample" style="font-family:${escAttr(stack)}">${esc("Aa Bb Cc · 0123456789")}</p></div>`,
      )
      .join("");
    blocks.push(
      `<h3>${esc(label)} ${statusBadge(slot.state, soloValidado)}</h3>
       <div style="font-family:${escAttr(stack)}">
         <p class="specimen-display">${esc(v.family)}</p>
         <p>Pesos: ${esc(v.weights.join(", ") || "Regular")}</p>
         ${weights}
       </div>${statusNote}`,
    );
  };
  renderTypo("Principal", view.typography.primary);
  renderTypo("Secundaria", view.typography.secondary);

  if (derivations.typographicScale.length) {
    const rows = derivations.typographicScale
      .map((s) => `<tr><td>${esc(s.token)}</td><td>${s.sizePx}px</td><td>${s.lineHeightPx}px</td></tr>`)
      .join("");
    blocks.push(
      `<h3>Jerarquía tipográfica</h3><table class="spec-table"><thead><tr><th>Token</th><th>Tamaño</th><th>Interlineado</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }
  return blocks.join("") || "<p>Sin tipografía</p>";
}

function renderVoice(view: BrandKitBookView, soloValidado: boolean): string {
  const parts: string[] = [];
  if (includeSlot(view.voice.tagline, soloValidado) && view.voice.tagline.value) {
    parts.push(
      `<p class="tagline">${esc(view.voice.tagline.value.text)} ${statusBadge(view.voice.tagline.state, soloValidado)}</p>`,
    );
  }
  const tones = view.voice.tone.items.filter((i) => includeMultiItem(i, soloValidado));
  if (tones.length) {
    parts.push(
      `<h3>Tono</h3><div class="tone-chips">${tones.map((t) => `<span class="tone-chip">${esc(t.value.text)}${t.crowned || soloValidado ? "" : " · propuesto"}</span>`).join("")}</div>`,
    );
  }
  const absolutes = view.voice.claimsAbsolute.items.filter((i) => includeMultiItem(i, soloValidado));
  if (absolutes.length) {
    parts.push(`<h3>Claims permitidos</h3><ul>${absolutes.map((c) => `<li>${esc(c.value.text)}</li>`).join("")}</ul>`);
  }
  const forbidden = view.voice.claimsForbidden.items.filter((i) => includeMultiItem(i, soloValidado));
  if (forbidden.length) {
    parts.push(
      `<h3>Claims prohibidos</h3><ul>${forbidden
        .map((c) => {
          const v = c.value as ClaimValue;
          const why = v.why ? `<span class="claim-why"> — ${esc(v.why)}</span>` : "";
          return `<li class="claim-forbidden">${esc(v.text)}${why}</li>`;
        })
        .join("")}</ul>`,
    );
  }
  return parts.join("") || "<p>Sin voz definida</p>";
}

function renderVisual(view: BrandKitBookView, soloValidado: boolean, embedded: Map<string, string>): string {
  const cards: string[] = [];
  for (const { category, slot } of view.visualUniverse) {
    for (const item of slot.items.filter((i) => includeMultiItem(i, soloValidado))) {
      const dna = item.value as ImageDnaValue;
      const raw = item.derived?.generatedImageUrl ?? dna.referenceImageUrl;
      const img = resolveEmbeddedUrl(raw, embedded);
      const label = VISUAL_CATEGORY_LABEL_ES[category] ?? category;
      const axes = Object.entries(dna.axes)
        .filter(([, v]) => v)
        .map(([k, v]) => `<li>${esc(AXIS_LABEL_ES[k] ?? k)}: ${esc(String(v))}</li>`)
        .join("");
      const imgBlock = img
        ? `<img src="${escAttr(img)}" alt=""/>`
        : `<div class="ref-placeholder">Sin imagen de referencia</div>`;
      cards.push(
        `<article class="visual-card">${imgBlock}<div class="visual-body"><h3>${esc(label)}</h3><ul>${axes}</ul></div></article>`,
      );
    }
  }
  return cards.length ? `<div class="visual-grid">${cards.join("")}</div>` : "<p>Sin referencias visuales confirmadas</p>";
}

function collectLogoCandidates(genome: Genome, soloValidado: boolean): Array<{
  logo: LogoValue;
  vectorUrl?: string;
}> {
  const trait = genome.traits["logo.primary"] as Trait<LogoValue> | undefined;
  if (!trait) return [];
  return trait.candidates
    .filter((c) => c.status !== "archived")
    .filter((c) => !soloValidado || trait.crownedIds.includes(c.id))
    .map((c) => ({ logo: c.value, vectorUrl: c.derived?.vectorUrl }));
}

function resolveLogoSrc(
  logo: LogoValue,
  vectorUrl: string | undefined,
  embedded: Map<string, string>,
): string | null {
  const raw = vectorUrl?.trim() || logo.imageUrl;
  return resolveEmbeddedUrl(raw, embedded);
}

function renderLogoSection(
  view: BrandKitBookView,
  genome: Genome,
  soloValidado: boolean,
  embedded: Map<string, string>,
  logoSafeAreaSvg: string | null,
): string {
  const logos = collectLogoCandidates(genome, soloValidado);
  const positive =
    logos.find((l) => l.logo.variant === "positive") ??
    (includeSlot(view.logo.primary, soloValidado) && view.logo.primary.value
      ? { logo: view.logo.primary.value, vectorUrl: undefined }
      : undefined);
  const negative = logos.find((l) => l.logo.variant === "negative");

  const cards: string[] = [];
  if (positive?.logo.imageUrl) {
    const src = resolveLogoSrc(positive.logo, positive.vectorUrl, embedded);
    if (src) {
      cards.push(
        `<div class="logo-card logo-card--light"><img src="${escAttr(src)}" alt="Logo positivo"/></div>`,
      );
    }
  }
  if (negative?.logo.imageUrl) {
    const src = resolveLogoSrc(negative.logo, negative.vectorUrl, embedded);
    if (src) {
      cards.push(
        `<div class="logo-card logo-card--dark"><img src="${escAttr(src)}" alt="Logo negativo"/></div>`,
      );
    }
  }

  if (!cards.length) {
    return includeSlot(view.logo.primary, soloValidado) ? "<p>Sin logo</p>" : "<p>Sin logo confirmado</p>";
  }

  const usage = logoSafeAreaSvg
    ? `<h3>Área de respeto</h3>${logoSafeAreaSvg}<p class="note">Mantén un margen mínimo equivalente a la altura del isotipo alrededor del logo.</p>`
    : "";

  return `<div class="logo-grid">${cards.join("")}</div>${usage ? `<div style="margin-top:24px">${usage}</div>` : ""}`;
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
  return `<section class="page"><h2>fuentes</h2><ul class="sources">${items}</ul></section>`;
}

function collectImageUrls(view: BrandKitBookView, genome: Genome, soloValidado: boolean): string[] {
  const urls: string[] = [];
  for (const entry of collectLogoCandidates(genome, soloValidado)) {
    if (entry.vectorUrl) urls.push(entry.vectorUrl);
    if (entry.logo.imageUrl) urls.push(entry.logo.imageUrl);
  }
  if (includeSlot(view.logo.primary, soloValidado) && view.logo.primary.value?.imageUrl) {
    urls.push(view.logo.primary.value.imageUrl);
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
    /** Omite CSS externo y optimiza refs para Chromium server-side. */
    forPdf?: boolean;
  } = {},
): Promise<BrandKitStyleGuideDocument> {
  const exportMode: BrandKitStyleGuideExportMode = options.exportMode === "cliente" ? "cliente" : "operativo";
  const soloValidado = resolveBrandKitStyleGuideSoloValidado(exportMode);
  const forPdf = options.forPdf === true;
  const view = buildBookView(genome);
  const embedded = await embedImageUrlsForStyleGuide(collectImageUrls(view, genome, soloValidado));

  const primaryHex = primaryColorHex(view, soloValidado);
  const coverFg = coverTextColor(primaryHex);
  const coverLogoRaw = view.logo.primary.value?.imageUrl;
  const crownedPositive = collectLogoCandidates(genome, soloValidado).find((l) => l.logo.variant === "positive");
  const coverLogo = resolveLogoSrc(
    view.logo.primary.value ?? crownedPositive?.logo ?? { imageUrl: coverLogoRaw ?? "", variant: "positive" },
    crownedPositive?.vectorUrl,
    embedded,
  );

  const derivations = buildBrandKitBookDerivations(view, {
    soloValidado,
    logoImageUrl: resolveLogoSrc(
      crownedPositive?.logo ??
        view.logo.primary.value ??
        { imageUrl: coverLogoRaw ?? "", variant: "positive" },
      crownedPositive?.vectorUrl,
      embedded,
    ),
  });

  const projectName = options.projectName?.trim() || "BrandKit";
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const modeLabel = BRAND_KIT_STYLE_GUIDE_EXPORT_MODE_LABELS[exportMode];
  const typoSheets = typographyStylesheets(view, soloValidado, forPdf);
  const typoFaces = typographyInlineFontFaces(view, soloValidado);

  const logoSection = renderLogoSection(view, genome, soloValidado, embedded, derivations.logoSafeAreaSvg);
  const paletteSection = renderPalette(view, soloValidado);
  const typoSection = renderTypography(view, derivations, soloValidado);
  const voiceSection = renderVoice(view, soloValidado);
  const visualSection = renderVisual(view, soloValidado, embedded);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>${esc(projectName)} — libro de estilo</title>
${typoSheets}
<style>${renderCss(primaryHex, coverFg)}${typoFaces ? `\n${typoFaces}` : ""}</style></head><body>
<section class="page cover">
  ${coverLogo ? `<img class="cover-logo" src="${escAttr(coverLogo)}" alt=""/>` : ""}
  <div>
    <p class="cover-meta">libro de estilo · ${esc(new Date(generatedAt).toLocaleDateString("es-ES"))}</p>
    <h1>${esc(projectName)}</h1>
    ${!soloValidado ? `<p class="cover-meta">${esc(modeLabel)}</p>` : ""}
  </div>
</section>
<section class="page"><h2>logo</h2>${logoSection}</section>
<section class="page"><h2>paleta</h2>${paletteSection}</section>
<section class="page"><h2>sistema de color</h2>${renderColorSystem(derivations)}</section>
<section class="page"><h2>tipografía</h2>${typoSection}</section>
<section class="page"><h2>voz</h2>${voiceSection}</section>
<section class="page"><h2>universo visual</h2>${visualSection}</section>
${renderSources(genome, soloValidado)}
</body></html>`;

  return { html, completenessPercent: view.completenessPercent, generatedAt, exportMode, soloValidado };
}

export function brandKitStyleGuideFilename(projectName: string | undefined, generatedAt: string): string {
  const slug = (projectName ?? "brandKit").replace(/\W+/g, "-").toLowerCase();
  const date = generatedAt.slice(0, 10);
  return `${slug}-libro-${date}.pdf`;
}

/** Fallback cliente: descarga HTML cuando Chromium no está disponible. */
export async function downloadBrandKitStyleGuideHtml(
  genome: Genome,
  projectName?: string,
  exportMode?: BrandKitStyleGuideExportMode,
): Promise<void> {
  const doc = await renderBrandKitStyleGuide(genome, { projectName, exportMode });
  const blob = new Blob([doc.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(projectName ?? "brandKit").replace(/\W+/g, "-").toLowerCase()}-libro.html`;
  a.click();
  URL.revokeObjectURL(url);
}
