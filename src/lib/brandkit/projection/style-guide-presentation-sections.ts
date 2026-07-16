import type { BrandKitDocument } from "../brand-kit-types";
import { buildBrandKitShowcaseData } from "@/app/spaces/brandKit/board-v2/showcase/brand-kit-showcase-data";
import { campaignDisplayTitle } from "../brand-kit-campaign";
import {
  buildBrandKitStationeryView,
  stationeryRequirementsMet,
  STATIONERY_PIECES,
} from "../brand-kit-stationery";
import { showcaseRequirementsMet } from "../brand-kit-showcase-requirements";
import type { StyleGuideChapterMeta } from "../brand-kit-presentation-export";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return esc(s);
}

export function renderStyleGuideTableOfContents(chapters: StyleGuideChapterMeta[]): string {
  const items = chapters
    .filter((chapter) => chapter.included && chapter.id !== "cover" && chapter.id !== "closing")
    .map((chapter, index) => {
      const anchor = `sg-chapter-${chapter.id}`;
      return `<li class="sg-toc__item"><a href="#${anchor}" class="sg-toc__link"><span class="sg-toc__num">${String(index + 1).padStart(2, "0")}</span><span class="sg-toc__title">${esc(chapter.title)}</span></a></li>`;
    })
    .join("");

  if (!items) return "";

  return `<section class="sg-band sg-band--page" id="sg-chapter-index">
    <div class="sg-cell sg-cell--12 sg-surface-raised sg-toc">
      <p class="sg-chapter">Índice</p>
      <ol class="sg-toc__list">${items}</ol>
    </div>
  </section>`;
}

export function renderStyleGuideApplicationsSection(
  doc: BrandKitDocument,
  soloValidado: boolean,
  embedded: Map<string, string>,
): string {
  const showcase = buildBrandKitShowcaseData(doc, soloValidado);
  if (!showcase || !showcaseRequirementsMet(showcase.requirements)) return "";

  const campaign = showcase.campaign;
  const gallerySrc = showcase.galleryImageUrl
    ? embedded.get(showcase.galleryImageUrl) ?? showcase.galleryImageUrl
    : undefined;
  const logoSrc = showcase.logoUrl ? embedded.get(showcase.logoUrl) ?? showcase.logoUrl : undefined;

  const hero = gallerySrc
    ? `<figure class="sg-app-hero"><img src="${escAttr(gallerySrc)}" alt=""/><figcaption class="sg-app-hero__caption">${esc(campaign.headline)}</figcaption></figure>`
    : `<div class="sg-app-hero sg-app-hero--type"><p class="sg-headline" style="font-size:32px">${esc(campaign.headline)}</p>${logoSrc ? `<img class="sg-app-hero__logo" src="${escAttr(logoSrc)}" alt=""/>` : ""}</div>`;

  const formats = `
    <div class="sg-app-grid">
      <article class="sg-app-card"><p class="sg-app-card__label">Post 1:1</p><div class="sg-app-card__frame sg-app-card__frame--square">${gallerySrc ? `<img src="${escAttr(gallerySrc)}" alt=""/>` : `<span>${esc(campaign.headline)}</span>`}</div></article>
      <article class="sg-app-card"><p class="sg-app-card__label">Story 9:16</p><div class="sg-app-card__frame sg-app-card__frame--story">${gallerySrc ? `<img src="${escAttr(gallerySrc)}" alt=""/>` : `<span>${esc(campaign.cta)}</span>`}</div></article>
      <article class="sg-app-card sg-app-card--wide"><p class="sg-app-card__label">Banner</p><div class="sg-app-card__frame sg-app-card__frame--banner">${gallerySrc ? `<img src="${escAttr(gallerySrc)}" alt=""/>` : `<span>${esc(showcase.brandName)}</span>`}</div></article>
    </div>`;

  return `<section class="sg-band sg-band--page" id="sg-chapter-applications">
    <div class="sg-cell sg-cell--12 sg-surface-page">
      <p class="sg-chapter">Aplicaciones de marca</p>
      <p class="sg-meta">${esc(campaignDisplayTitle(campaign))}</p>
      <div class="sg-app-campaign">
        <div><p class="sg-app-kicker">Concepto</p><p class="sg-prose">${esc(campaign.concept)}</p></div>
        ${campaign.subheadline ? `<div><p class="sg-app-kicker">Subheadline</p><p class="sg-prose">${esc(campaign.subheadline)}</p></div>` : ""}
        <div><p class="sg-app-kicker">CTA</p><p class="sg-app-cta">${esc(campaign.cta)}</p></div>
      </div>
      ${hero}
      ${formats}
    </div>
  </section>`;
}

function renderStationeryPieceHtml(
  pieceId: string,
  view: NonNullable<ReturnType<typeof buildBrandKitStationeryView>>,
  logoSrc?: string,
): string {
  const logo = logoSrc
    ? `<img class="sg-stationery__logo" src="${escAttr(logoSrc)}" alt=""/>`
    : `<span class="sg-stationery__monogram">${esc(view.monogram)}</span>`;

  switch (pieceId) {
    case "card":
      return `<div class="sg-stationery-card">${logo}<p class="sg-stationery__brand">${esc(view.brandName)}</p><p class="sg-stationery__name">${esc(view.contact.personName)}</p><p class="sg-stationery__role">${esc(view.contact.role)}</p></div>`;
    case "letterhead":
      return `<div class="sg-stationery-letter">${logo}<p class="sg-stationery__brand">${esc(view.brandName)}</p><div class="sg-stationery-letter__body"></div><footer class="sg-stationery-letter__footer">${esc(view.contact.email)}${view.contact.phone ? ` · ${esc(view.contact.phone)}` : ""}</footer></div>`;
    case "envelope":
      return `<div class="sg-stationery-envelope"><div class="sg-stationery-envelope__flap"></div>${logo}<p class="sg-stationery__brand">${esc(view.brandName)}</p></div>`;
    case "signature":
      return `<div class="sg-stationery-signature"><p class="sg-stationery__brand">${esc(view.brandName)}</p><p>${esc(view.contact.personName)} · ${esc(view.contact.role)}</p><p>${esc(view.contact.email)}</p></div>`;
    case "cover":
      return `<div class="sg-stationery-cover">${logo}<p class="sg-stationery-cover__title">${esc(view.brandName)}</p>${view.tagline ? `<p class="sg-stationery-cover__tagline">${esc(view.tagline)}</p>` : ""}</div>`;
    default:
      return "";
  }
}

export function renderStyleGuideStationerySection(
  doc: BrandKitDocument,
  soloValidado: boolean,
  embedded: Map<string, string>,
): string {
  if (!stationeryRequirementsMet(doc, soloValidado)) return "";

  const showcase = buildBrandKitShowcaseData(doc, soloValidado);
  if (!showcase) return "";

  const view = buildBrandKitStationeryView(doc, {
    brandName: showcase.brandName,
    monogram: showcase.monogram,
    logoUrl: showcase.logoUrl,
    tagline: showcase.tagline,
    contactEmail: showcase.contactEmail,
  });
  if (!view) return "";

  const logoSrc = view.logoUrl ? embedded.get(view.logoUrl) ?? view.logoUrl : undefined;
  const pieces = STATIONERY_PIECES.map((piece) => {
    const preview = renderStationeryPieceHtml(piece.id, view, logoSrc);
    return `<article class="sg-stationery-piece"><p class="sg-stationery-piece__label">${esc(piece.label)}</p><p class="sg-stationery-piece__size">${esc(piece.sizeLabel)}</p>${preview}</article>`;
  }).join("");

  return `<section class="sg-band sg-band--page" id="sg-chapter-stationery">
    <div class="sg-cell sg-cell--12 sg-surface-raised">
      <p class="sg-chapter">Papelería</p>
      <p class="sg-prose sg-prose--wide">Piezas deterministas listas para exportar — ${esc(view.contact.personName)}, ${esc(view.contact.email)}</p>
      <div class="sg-stationery-grid">${pieces}</div>
    </div>
  </section>`;
}

export function renderStyleGuideClosingPage(projectName: string, generatedAt: string, modeLabel: string): string {
  const date = new Date(generatedAt).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<section class="sg-band sg-band--page" id="sg-chapter-closing">
    <div class="sg-cell sg-cell--12 sg-surface-primary sg-closing">
      <p class="sg-meta">libro de estilo · ${esc(modeLabel)}</p>
      <h2 class="sg-headline">${esc(projectName)}</h2>
      <p class="sg-subhead">Documento generado el ${esc(date)}</p>
      <p class="sg-closing__note">Contenido alineado con el modo presentación del BrandKit.</p>
    </div>
  </section>`;
}

export function presentationSectionsCss(): string {
  return `
    .sg-band--page { break-inside: avoid-page; page-break-inside: avoid; }
    .sg-band--page + .sg-band--page { break-before: page; page-break-before: always; }
    .sg-toc { min-height: 70vh; justify-content: center; }
    .sg-toc__list { list-style: none; margin: 24px 0 0; padding: 0; display: grid; gap: 10px; }
    .sg-toc__item { margin: 0; }
    .sg-toc__link {
      display: grid;
      grid-template-columns: 48px 1fr;
      gap: 16px;
      align-items: baseline;
      text-decoration: none;
      color: inherit;
      padding: 8px 0;
      border-bottom: 1px solid rgba(26, 26, 26, 0.08);
    }
    .sg-toc__num { font-size: 11px; letter-spacing: 0.1em; opacity: 0.55; }
    .sg-toc__title { font-size: 18px; font-weight: 500; }
    .sg-app-campaign {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin: 20px 0 24px;
    }
    .sg-app-kicker {
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.6;
      margin: 0 0 6px;
    }
    .sg-app-cta {
      display: inline-block;
      margin-top: 4px;
      padding: 8px 16px;
      background: var(--sg-primary);
      color: var(--sg-on-primary);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .sg-app-hero {
      margin: 0 0 20px;
      border-radius: 4px;
      overflow: hidden;
      min-height: 220px;
      background: color-mix(in srgb, var(--sg-primary) 8%, var(--sg-raised));
      position: relative;
    }
    .sg-app-hero img { width: 100%; height: 280px; object-fit: cover; display: block; }
    .sg-app-hero--type {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 48px 32px;
      text-align: center;
    }
    .sg-app-hero__logo { max-height: 72px; max-width: 180px; object-fit: contain; }
    .sg-app-hero__caption {
      position: absolute;
      left: 24px;
      bottom: 20px;
      margin: 0;
      color: #fff;
      font-size: 22px;
      font-weight: 500;
      text-shadow: 0 2px 16px rgba(0,0,0,0.45);
    }
    .sg-app-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .sg-app-card--wide { grid-column: 1 / -1; }
    .sg-app-card__label {
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.6;
      margin: 0 0 8px;
    }
    .sg-app-card__frame {
      background: var(--sg-raised);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--sg-ink-soft);
      font-size: 13px;
      padding: 16px;
    }
    .sg-app-card__frame img { width: 100%; height: 100%; object-fit: cover; }
    .sg-app-card__frame--square { aspect-ratio: 1; }
    .sg-app-card__frame--story { aspect-ratio: 9 / 16; max-height: 280px; }
    .sg-app-card__frame--banner { aspect-ratio: 16 / 5; }
    .sg-stationery-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 24px;
    }
    .sg-stationery-piece {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .sg-stationery-piece__label { font-size: 12px; font-weight: 600; margin: 0; }
    .sg-stationery-piece__size { font-size: 10px; opacity: 0.55; margin: 0; }
    .sg-stationery-card,
    .sg-stationery-letter,
    .sg-stationery-envelope,
    .sg-stationery-signature,
    .sg-stationery-cover {
      background: #fff;
      border: 1px solid rgba(26,26,26,0.08);
      padding: 16px;
      min-height: 120px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sg-stationery__logo { max-height: 36px; max-width: 120px; object-fit: contain; }
    .sg-stationery__monogram {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--sg-primary);
      color: var(--sg-on-primary);
      font-size: 12px;
      font-weight: 700;
    }
    .sg-stationery__brand { font-size: 13px; font-weight: 600; margin: 0; }
    .sg-stationery__name, .sg-stationery__role { font-size: 11px; margin: 0; opacity: 0.8; }
    .sg-stationery-letter__body { flex: 1; min-height: 48px; }
    .sg-stationery-letter__footer { font-size: 10px; opacity: 0.65; margin: 0; }
    .sg-stationery-envelope { position: relative; aspect-ratio: 2 / 1; }
    .sg-stationery-envelope__flap {
      position: absolute;
      inset: 0 12% auto;
      height: 42%;
      background: color-mix(in srgb, var(--sg-primary) 10%, #fff);
      clip-path: polygon(0 0, 50% 100%, 100% 0);
    }
    .sg-stationery-cover { min-height: 180px; justify-content: center; }
    .sg-stationery-cover__title { font-size: 20px; font-weight: 600; margin: 8px 0 0; }
    .sg-stationery-cover__tagline { font-size: 12px; opacity: 0.7; margin: 0; }
    .sg-closing {
      min-height: 60vh;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 12px;
    }
    .sg-closing__note { font-size: 12px; opacity: 0.72; max-width: 36ch; margin: 12px 0 0; }
    .sg-appendix { break-before: page; page-break-before: always; }
  `;
}
