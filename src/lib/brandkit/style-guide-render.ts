import type { ProjectAssetsMetadata, BrainVoiceExample } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { stableKnowledgeFileUrlFromMaybeUrl } from "@/lib/s3-media-hydrate";
import { buildBrandBoardView, bootstrapSidecarFromAssets } from "./board-projection";
import { refCategoryLabelEs, paletteRoleLabelEs } from "./brand-board-labels";
import { BRANDKIT_REF_CATEGORIES } from "./types";
import { getMeta } from "./interpretation";
import { messageKeyElementKey } from "./element-registry";
import { shouldIncludeInStyleGuide, styleGuideStatusLabel } from "./style-guide-filter";
import { buildBookDerivations, type BrandBookDerivations } from "./book-derivations";
import {
  hasPendingVoiceSynthesis,
  voiceExampleKindLabelEs,
  VOICE_EXAMPLES_ELEMENT_KEY,
} from "./synthesize-voice-examples";
import {
  resolveStyleGuideSoloValidado,
  STYLE_GUIDE_EXPORT_MODE_LABELS,
  type StyleGuideChapterMeta,
  type StyleGuideChapterOrigin,
  type StyleGuideExportMode,
} from "./style-guide-export-types";

export type StyleGuideRenderOptions = {
  soloValidado?: boolean;
  exportMode?: StyleGuideExportMode;
  projectName?: string;
  brainVersion?: number;
  generatedAt?: string;
};

export type StyleGuideDocument = {
  html: string;
  completenessPercent: number;
  generatedAt: string;
  brainVersion: number;
  soloValidado: boolean;
  exportMode: StyleGuideExportMode;
  version: 2;
  chapters: StyleGuideChapterMeta[];
  derivations: BrandBookDerivations;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderExtendedPalette(derived: BrandBookDerivations): string {
  if (!derived.palette.length) return `<p>Sin colores para derivar especificaciones extendidas.</p>`;
  const rows = derived.palette
    .map(
      (color) => `
        <tr>
          <td><span class="color-dot" style="background:${escapeHtml(color.hex)}"></span>${escapeHtml(color.hex)}</td>
          <td>${escapeHtml(paletteRoleLabelEs(color.role === "primary" ? "colorPrimary" : color.role === "secondary" ? "colorSecondary" : "colorAccent"))}</td>
          <td>rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})</td>
          <td>hsl(${color.hsl.h}°, ${color.hsl.s}%, ${color.hsl.l}%)</td>
          <td>cmyk(${color.cmykApprox.c}, ${color.cmykApprox.m}, ${color.cmykApprox.y}, ${color.cmykApprox.k})*</td>
        </tr>`,
    )
    .join("");
  return `
    <table class="spec-table">
      <thead><tr><th>Color</th><th>Rol</th><th>RGB</th><th>HSL</th><th>CMYK aprox.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">* CMYK aproximado para referencia; no sustituye perfil de impresión.</p>`;
}

function renderWcagMatrix(derived: BrandBookDerivations): string {
  if (!derived.wcagMatrix.length) return "";
  const rows = derived.wcagMatrix
    .map(
      (pair) => `
        <tr>
          <td>${escapeHtml(pair.foregroundHex)} / ${escapeHtml(pair.backgroundHex)}</td>
          <td>${pair.ratio.toFixed(2)}:1</td>
          <td>${pair.aaNormal ? "AA" : "—"}</td>
          <td>${pair.aaaNormal ? "AAA" : "—"}</td>
        </tr>`,
    )
    .join("");
  return `
    <table class="spec-table">
      <thead><tr><th>Par</th><th>Ratio</th><th>AA</th><th>AAA</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderColorUsage603010(derived: BrandBookDerivations): string {
  const u = derived.colorUsage603010;
  return `
    <div class="usage-bar">
      <span style="width:${u.primaryPercent}%;background:${escapeHtml(derived.palette.find((c) => c.role === "primary")?.hex ?? "#D1D5DB")}">60%</span>
      <span style="width:${u.secondaryPercent}%;background:${escapeHtml(derived.palette.find((c) => c.role === "secondary")?.hex ?? "#9CA3AF")}">30%</span>
      <span style="width:${u.accentPercent}%;background:${escapeHtml(derived.palette.find((c) => c.role === "accent")?.hex ?? "#6B7280")}">10%</span>
    </div>
    <p>${escapeHtml(u.guidance)}</p>`;
}

function renderLogoUsage(derived: BrandBookDerivations): string {
  const parts: string[] = [];
  if (derived.logoSafeArea) {
    parts.push(`
      <div class="logo-spec">
        <h3>Área de seguridad</h3>
        <p>${escapeHtml(derived.logoSafeArea.rule)}</p>
        ${derived.logoSafeArea.diagramSvg}
      </div>`);
  }
  if (derived.logoMinSize) {
    parts.push(`
      <div class="logo-spec">
        <h3>Tamaño mínimo</h3>
        <p>${escapeHtml(derived.logoMinSize.rule)}</p>
      </div>`);
  }
  if (derived.logoMisuses.length) {
    const cards = derived.logoMisuses
      .map(
        (misuse) => `
          <article class="misuse-card">
            ${misuse.previewSvg}
            <strong>${escapeHtml(misuse.title)}</strong>
            <p>${escapeHtml(misuse.description)}</p>
          </article>`,
      )
      .join("");
    parts.push(`
      <div class="logo-spec">
        <h3>Usos incorrectos</h3>
        <div class="misuse-grid">${cards}</div>
      </div>`);
  }
  return parts.join("") || `<p>Valida un logo principal para generar reglas de uso.</p>`;
}

function renderTypographicScale(derived: BrandBookDerivations): string {
  if (!derived.typographicScale.length) return "";
  const rows = derived.typographicScale
    .map(
      (step) => `
        <tr>
          <td>${escapeHtml(step.token)}</td>
          <td>${step.sizePx}px</td>
          <td>${step.lineHeightPx}px</td>
          <td style="font-size:${step.sizePx}px;line-height:${step.lineHeightPx}px">${escapeHtml(step.sample)}</td>
        </tr>`,
    )
    .join("");
  return `
    <table class="spec-table">
      <thead><tr><th>Token</th><th>Tamaño</th><th>Interlineado</th><th>Muestra</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function resolveImage(raw: string | null | undefined): string | null {
  return stableKnowledgeFileUrlFromMaybeUrl(raw);
}

function showInternalStatusLabels(exportMode: StyleGuideExportMode): boolean {
  return exportMode === "operativo";
}

function buildStyleGuideChapters(input: {
  showPrimaryLogo: boolean;
  showAltLogo: boolean;
  hasPalette: boolean;
  hasColorSystem: boolean;
  showTypography: boolean;
  hasTypographicScale: boolean;
  hasVoice: boolean;
  voiceChapterOrigin: StyleGuideChapterOrigin;
  hasVisualRefs: boolean;
  hasLogoUsage: boolean;
}): StyleGuideChapterMeta[] {
  return [
    { id: "cover", title: "Portada", origin: "cosechado", included: true },
    {
      id: "identity",
      title: "Identidad",
      origin: "cosechado",
      included: input.showPrimaryLogo || input.showAltLogo,
    },
    {
      id: "logo-usage",
      title: "Uso del logo",
      origin: "derivado",
      included: input.hasLogoUsage,
    },
    {
      id: "palette",
      title: "Paleta",
      origin: "cosechado",
      included: input.hasPalette,
    },
    {
      id: "color-system",
      title: "Contraste y uso del color",
      origin: "derivado",
      included: input.hasColorSystem,
    },
    {
      id: "typography",
      title: "Tipografía",
      origin: input.showTypography ? "cosechado" : "derivado",
      included: input.showTypography || input.hasTypographicScale,
    },
    {
      id: "voice",
      title: "Voz",
      origin: input.voiceChapterOrigin,
      included: input.hasVoice,
    },
    {
      id: "visual-references",
      title: "Referencias visuales",
      origin: "cosechado",
      included: input.hasVisualRefs,
    },
  ];
}

function renderVoiceExamples(examples: BrainVoiceExample[], showSynthesisNote: boolean): string {
  if (!examples.length) return "";
  const rows = examples
    .map(
      (example) => `
        <li class="voice-example">
          <strong>${escapeHtml(voiceExampleKindLabelEs(example.kind))}</strong>
          ${example.label ? `<span class="voice-example-label">${escapeHtml(example.label)}</span>` : ""}
          <p>${escapeHtml(example.text)}</p>
        </li>`,
    )
    .join("");
  const note = showSynthesisNote
    ? `<p class="voice-synthesis-note">Ejemplos sintetizados · revisar antes de modo cliente</p>`
    : "";
  return `
    <div class="voice-examples">
      <h3 style="margin-top:18px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Ejemplos de voz</h3>
      ${note}
      <ul class="voice-example-list">${rows}</ul>
    </div>`;
}

export function renderStyleGuideHtml(
  rawAssets: ProjectAssetsMetadata | unknown,
  options: StyleGuideRenderOptions = {},
): StyleGuideDocument {
  const assets = normalizeProjectAssets(rawAssets);
  const boardMeta = bootstrapSidecarFromAssets(assets);
  const view = buildBrandBoardView(assets, boardMeta);
  const exportMode: StyleGuideExportMode = options.exportMode ?? "operativo";
  const soloValidado =
    options.soloValidado === true || resolveStyleGuideSoloValidado(exportMode);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const brainVersion = options.brainVersion ?? assets.brainMeta?.brainVersion ?? 1;
  const projectName = options.projectName?.trim() || "BrandKit";
  const completenessPercent = view.completenessPercent;
  const derivations = buildBookDerivations(assets, boardMeta);
  const internalLabels = showInternalStatusLabels(exportMode);
  const exportModeLabel = STYLE_GUIDE_EXPORT_MODE_LABELS[exportMode];
  const scopeLabel = soloValidado ? "Solo validado" : "Validado + propuesto";
  const editionBadge = exportMode === "cliente" ? "Edición cliente" : "Edición operativa";
  const footerNote =
    exportMode === "cliente"
      ? "Guía de marca generada desde BrandKit. Contenido validado para uso externo."
      : "Documento generado desde el estado guardado del BrandKit. Secciones marcadas como derivadas se calculan en exportación (CMYK aprox., WCAG, escala tipográfica) y no se persisten en assets.";

  const logoPrimaryMeta = view.logo.primary.meta;
  const logoAltMeta = view.logo.alt.meta;
  const showPrimaryLogo = shouldIncludeInStyleGuide(logoPrimaryMeta, soloValidado) && view.logo.primary.url;
  const showAltLogo = shouldIncludeInStyleGuide(logoAltMeta, soloValidado) && view.logo.alt.url;

  const paletteRows = view.palette
    .filter((swatch) => shouldIncludeInStyleGuide(swatch.meta, soloValidado))
    .map(
      (swatch) => `
        <div class="swatch">
          <div class="swatch-color" style="background:${escapeHtml(swatch.hex)}"></div>
          <div class="swatch-meta">
            <strong>${escapeHtml(paletteRoleLabelEs(swatch.id))}</strong>
            <span>${escapeHtml(swatch.hex)}</span>
            ${internalLabels ? `<em>${escapeHtml(styleGuideStatusLabel(swatch.meta))}</em>` : ""}
          </div>
        </div>`,
    )
    .join("");

  const toneChips = view.voice.toneChips
    .filter((chip) => shouldIncludeInStyleGuide(chip.meta, soloValidado))
    .map((chip) => `<span class="chip">${escapeHtml(chip.text)}</span>`)
    .join("");

  const showTagline = shouldIncludeInStyleGuide(view.voice.taglineMeta, soloValidado) && view.voice.tagline;
  const showTone = toneChips.length > 0 || shouldIncludeInStyleGuide(getMeta(boardMeta, "tone"), soloValidado);

  const keyMessages = assets.strategy.messageBlueprints
    .slice(0, 6)
    .filter((bp) => bp.claim.trim() && shouldIncludeInStyleGuide(getMeta(boardMeta, messageKeyElementKey(bp.id)), soloValidado))
    .map(
      (bp) => `
        <li>
          <strong>${escapeHtml(bp.claim.trim())}</strong>
          ${bp.support?.trim() ? `<span>${escapeHtml(bp.support.trim())}</span>` : ""}
        </li>`,
    )
    .join("");

  const voiceExamplesMeta = getMeta(boardMeta, VOICE_EXAMPLES_ELEMENT_KEY);
  const voiceExamplesForGuide = shouldIncludeInStyleGuide(voiceExamplesMeta, soloValidado)
    ? assets.strategy.voiceExamples.filter((example) => example.text.trim())
    : [];
  const voiceExamplesHtml = renderVoiceExamples(
    voiceExamplesForGuide,
    exportMode === "operativo" &&
      (voiceExamplesMeta.evidence.some((evidence) => evidence.kind === "llm-synthesis") ||
        hasPendingVoiceSynthesis(boardMeta)),
  );
  const voiceChapterOrigin: StyleGuideChapterOrigin =
    voiceExamplesMeta.evidence.some((evidence) => evidence.kind === "llm-synthesis") ||
    hasPendingVoiceSynthesis(boardMeta)
      ? "sintetizado"
      : "cosechado";

  const referenceSections = BRANDKIT_REF_CATEGORIES.map((category) => {
    const section = view.references[category];
    if (!shouldIncludeInStyleGuide(section.ruleMeta, soloValidado) && !section.items.some((i) => shouldIncludeInStyleGuide(i.meta, soloValidado))) {
      return "";
    }
    const item = section.items.find((i) => shouldIncludeInStyleGuide(i.meta, soloValidado)) ?? section.items[0];
    const img = item ? resolveImage(item.assetUrl) : null;
    const rule = section.rule.trim() || "Pendiente de síntesis";
    return `
      <article class="ref-block">
        <h3>${escapeHtml(refCategoryLabelEs(category))}</h3>
        <p class="ref-rule">${escapeHtml(rule)}</p>
        ${internalLabels ? `<p class="ref-status">${escapeHtml(styleGuideStatusLabel(section.ruleMeta))}</p>` : ""}
        ${
          img
            ? `<img class="ref-image" src="${escapeHtml(img)}" alt="" />`
            : `<div class="ref-placeholder">Sin imagen de referencia</div>`
        }
      </article>`;
  }).join("");

  const typoPrimary = view.typography.primaryFamily;
  const typoSecondary = view.typography.secondaryFamily;
  const showTypography = Boolean(
    (typoPrimary && shouldIncludeInStyleGuide(view.typography.metaPrimary, soloValidado)) ||
      (typoSecondary && shouldIncludeInStyleGuide(view.typography.metaSecondary, soloValidado)),
  );

  const logoUsageHtml = renderLogoUsage(derivations);
  const hasLogoUsage =
    Boolean(derivations.logoSafeArea) ||
    Boolean(derivations.logoMinSize) ||
    derivations.logoMisuses.length > 0;
  const hasPalette = paletteRows.length > 0;
  const hasColorSystem = derivations.palette.length > 0;
  const hasVoice = Boolean(showTagline || showTone || keyMessages || voiceExamplesForGuide.length);
  const hasVisualRefs = referenceSections.trim().length > 0;
  const chapters = buildStyleGuideChapters({
    showPrimaryLogo: Boolean(showPrimaryLogo),
    showAltLogo: Boolean(showAltLogo),
    hasPalette,
    hasColorSystem,
    showTypography,
    hasTypographicScale: derivations.typographicScale.length > 0,
    hasVoice,
    voiceChapterOrigin,
    hasVisualRefs,
    hasLogoUsage,
  });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(projectName)} · Libro de estilo</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      line-height: 1.45;
      margin: 0;
      padding: 24px;
      background: #fff;
    }
    .cover {
      border-bottom: 2px solid #111827;
      padding-bottom: 18px;
      margin-bottom: 28px;
    }
    .cover h1 {
      margin: 0 0 8px;
      font-size: 28px;
      letter-spacing: -0.02em;
    }
    .cover .meta {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #6b7280;
    }
    .cover .score {
      margin-top: 14px;
      font-size: 42px;
      font-weight: 800;
      color: #5e8e70;
    }
    section { margin-bottom: 28px; page-break-inside: avoid; }
    h2 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #6b7280;
      margin: 0 0 12px;
    }
    .logo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .logo-card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      min-height: 120px;
      display: grid;
      place-items: center;
      background: #f9fafb;
    }
    .logo-card img { max-width: 100%; max-height: 88px; object-fit: contain; }
    .palette {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .swatch {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
    }
    .swatch-color { height: 72px; }
    .swatch-meta {
      padding: 10px;
      font-size: 11px;
      display: grid;
      gap: 2px;
    }
    .swatch-meta em {
      font-style: normal;
      color: #6b7280;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .tagline {
      font-size: 22px;
      font-weight: 600;
      margin: 0 0 12px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip {
      border: 1px solid #d1d5db;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .messages {
      margin: 12px 0 0;
      padding-left: 18px;
    }
    .messages li { margin-bottom: 8px; }
    .messages span { display: block; color: #4b5563; font-size: 12px; margin-top: 2px; }
    .typo-sample {
      font-size: 48px;
      font-weight: 800;
      margin: 0 0 8px;
    }
    .ref-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .ref-block {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px;
    }
    .ref-block h3 {
      margin: 0 0 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #6b7280;
    }
    .ref-rule { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
    .ref-status {
      margin: 0 0 10px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7280;
    }
    .ref-image {
      width: 100%;
      height: 120px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .ref-placeholder {
      height: 120px;
      border: 1px dashed #d1d5db;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: #9ca3af;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .footer-note {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 10px;
      color: #6b7280;
    }
    .spec-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
    }
    .spec-table th,
    .spec-table td {
      border: 1px solid #e5e7eb;
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    .spec-table th {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 10px;
      color: #6b7280;
      background: #f9fafb;
    }
    .color-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 1px solid #d1d5db;
      margin-right: 6px;
      vertical-align: middle;
    }
    .note { font-size: 10px; color: #6b7280; margin-top: 8px; }
    .usage-bar {
      display: flex;
      height: 28px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      margin-bottom: 10px;
    }
    .usage-bar span {
      display: grid;
      place-items: center;
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 1px rgba(0,0,0,0.35);
    }
    .logo-spec { margin-top: 16px; }
    .logo-spec h3 {
      margin: 0 0 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #6b7280;
    }
    .misuse-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .misuse-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px;
      font-size: 11px;
    }
    .misuse-card strong { display: block; margin-top: 8px; }
    .misuse-card p { margin: 4px 0 0; color: #4b5563; }
    .voice-example-list {
      margin: 12px 0 0;
      padding-left: 18px;
    }
    .voice-example { margin-bottom: 12px; }
    .voice-example strong {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b7280;
    }
    .voice-example-label {
      display: block;
      font-size: 11px;
      color: #4b5563;
      margin-top: 2px;
    }
    .voice-example p { margin: 4px 0 0; }
    .voice-synthesis-note {
      margin: 8px 0 0;
      font-size: 10px;
      color: #6b7280;
    }
    .style-guide-chapter { break-inside: avoid-page; }
    .edition-badge {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid #d1d5db;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #374151;
    }
  </style>
</head>
<body>
  <header class="cover style-guide-chapter" data-chapter="cover">
    <p class="meta">Libro de estilo · BrandKit v${brainVersion}</p>
    <h1>${escapeHtml(projectName)}</h1>
    <p class="meta">Generado ${escapeHtml(new Date(generatedAt).toLocaleString("es-ES"))} · ${escapeHtml(exportModeLabel)} · ${escapeHtml(scopeLabel)}</p>
    <span class="edition-badge">${escapeHtml(editionBadge)}</span>
    <div class="score">${completenessPercent}%</div>
  </header>

  <section class="style-guide-chapter" data-chapter="identity">
    <h2>Identidad</h2>
    <div class="logo-grid">
      ${
        showPrimaryLogo
          ? `<div class="logo-card"><img src="${escapeHtml(resolveImage(view.logo.primary.url) ?? "")}" alt="Logo principal" /></div>`
          : `<div class="logo-card"><span>Pendiente · Logo principal</span></div>`
      }
      ${
        showAltLogo
          ? `<div class="logo-card" style="background:#111827;color:#fff;"><img src="${escapeHtml(resolveImage(view.logo.alt.url) ?? "")}" alt="Logo alternativo" /></div>`
          : `<div class="logo-card"><span>Pendiente · Logo alternativo</span></div>`
      }
    </div>
  </section>

  <section class="style-guide-chapter" data-chapter="logo-usage">
    <h2>Uso del logo</h2>
    ${logoUsageHtml}
  </section>

  <section class="style-guide-chapter" data-chapter="palette">
    <h2>Paleta</h2>
    <div class="palette">${paletteRows || `<p>Pendiente de definir colores de marca.</p>`}</div>
    <h3 style="margin-top:18px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Especificación extendida (derivada)</h3>
    ${renderExtendedPalette(derivations)}
  </section>

  <section class="style-guide-chapter" data-chapter="color-system">
    <h2>Contraste y uso del color</h2>
    <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Regla 60 / 30 / 10</h3>
    ${renderColorUsage603010(derivations)}
    <h3 style="margin-top:18px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Matriz WCAG (pares destacados)</h3>
    ${renderWcagMatrix(derivations)}
  </section>

  ${
    showTypography
      ? `<section class="style-guide-chapter" data-chapter="typography">
    <h2>Tipografía</h2>
    <p class="typo-sample">Aa</p>
    <p><strong>Primaria:</strong> ${escapeHtml(typoPrimary ?? "Pendiente")}</p>
    ${typoSecondary ? `<p><strong>Secundaria:</strong> ${escapeHtml(typoSecondary)}</p>` : ""}
    <h3 style="margin-top:18px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Escala tipográfica (derivada)</h3>
    ${renderTypographicScale(derivations)}
  </section>`
      : derivations.typographicScale.length
        ? `<section class="style-guide-chapter" data-chapter="typography">
    <h2>Tipografía</h2>
    <p style="color:#6b7280;">Familia pendiente · escala derivada disponible</p>
    ${renderTypographicScale(derivations)}
  </section>`
        : ""
  }

  <section class="style-guide-chapter" data-chapter="voice">
    <h2>Voz</h2>
    ${
      showTagline
        ? `<p class="tagline">${escapeHtml(view.voice.tagline ?? "")}</p>`
        : `<p class="tagline" style="color:#9ca3af;">Mensaje principal pendiente</p>`
    }
    ${showTone ? `<div class="chips">${toneChips || `<span class="chip">Tono pendiente</span>`}</div>` : ""}
    ${keyMessages ? `<ul class="messages">${keyMessages}</ul>` : ""}
    ${voiceExamplesHtml}
  </section>

  <section class="style-guide-chapter" data-chapter="visual-references">
    <h2>Referencias visuales</h2>
    <div class="ref-grid">${referenceSections || `<p>Pendiente de referencias visuales.</p>`}</div>
  </section>

  <p class="footer-note">${escapeHtml(footerNote)}</p>
</body>
</html>`;

  return {
    html,
    completenessPercent,
    generatedAt,
    brainVersion,
    soloValidado,
    exportMode,
    version: 2,
    chapters,
    derivations,
  };
}

export function renderStyleGuideV2(
  rawAssets: ProjectAssetsMetadata | unknown,
  options: Omit<StyleGuideRenderOptions, "soloValidado"> & { exportMode: StyleGuideExportMode },
): StyleGuideDocument {
  return renderStyleGuideHtml(rawAssets, {
    ...options,
    soloValidado: resolveStyleGuideSoloValidado(options.exportMode),
  });
}

export function styleGuideFilename(projectName: string | undefined, generatedAt: string): string {
  const slug = (projectName ?? "brandkit")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const date = generatedAt.slice(0, 10);
  return `${slug || "brandkit"}-libro-estilo-${date}.pdf`;
}
