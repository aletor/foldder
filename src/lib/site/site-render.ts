import { applySiteAdnToProject, siteAdnGoogleFontsHref, type SiteAdnContext } from "./site-adn";
import { sliceCollectionItems } from "./site-collection-overflow";
import { resolveButtonLabel, resolveTextValue } from "./site-i18n";
import { renderSiteLeadForm, SITE_LEADS_FORM_JS } from "./site-leads-form";
import { getActiveSitePage, resolvePreviewLocale } from "./site-project";
import { sitePagePathSlug, sitePublicPath } from "./site-publish-slug";
import { ledgerOverridesStylesheet } from "./site-theme-ledger";
import { SITE_COLLECTION_OVERFLOW_JS, SITE_PUBLISH_FULL_RUNTIME_JS } from "./site-publish-runtime";
import type {
  Block,
  ButtonContent,
  CarouselOpts,
  CollectionContent,
  GridOpts,
  MarqueeOpts,
  MediaContent,
  SitePage,
  SiteProject,
  TableOpts,
  TextContent,
} from "./site-types";
import { siteThemeStylesheet } from "./site-theme";

export type SiteRenderOutput = {
  html: string;
  css: string;
  js: string;
  assetsManifest: string[];
};

export type SiteRenderOptions = {
  locale?: string;
  /** Renderiza una página concreta (multi-página). */
  pageId?: string;
  selectedSectionId?: string | null;
  sectionLabels?: Record<string, string>;
  adn?: SiteAdnContext | null;
  /** Inyecta script/CSS para seleccionar secciones desde el iframe del studio. */
  editorMode?: boolean;
  /** Sitio publicado: sin chrome de editor + JS runtime mínimo. */
  production?: boolean;
  /** Slug publicado — habilita nav entre páginas en modo production. */
  publishedSlug?: string;
};

export const SITE_EDITOR_SECTION_SELECT_MESSAGE = "foldder-site-section-select" as const;
export const SITE_EDITOR_TEXT_EDIT_MESSAGE = "foldder-site-text-edit" as const;
export const SITE_EDITOR_BUTTON_EDIT_MESSAGE = "foldder-site-button-edit" as const;

const SITE_EDITOR_CSS = `
.site-section[data-section-id] {
  cursor: pointer;
}
.site-section[data-section-id]:hover {
  outline: 2px dashed color-mix(in srgb, var(--c-accent) 55%, transparent);
  outline-offset: -2px;
}
.site-text[data-editable-text="true"] {
  cursor: text;
}
.site-text[data-editable-text="true"]:hover {
  outline: 1px dashed color-mix(in srgb, var(--c-accent) 40%, transparent);
  outline-offset: 2px;
}
.site-text[data-editable-text="true"]:focus {
  outline: 2px solid color-mix(in srgb, var(--c-accent) 70%, transparent);
  outline-offset: 2px;
}
.site-btn[data-editable-button="true"] {
  cursor: text;
}
`;

type RenderContext = {
  locale: string;
  editorMode?: boolean;
};

const SITE_EDITOR_SCRIPT = `
document.addEventListener("click", (event) => {
  const editableText = event.target.closest("[data-editable-text]");
  const editableButton = event.target.closest("[data-editable-button]");
  if (editableText || editableButton) return;
  const section = event.target.closest("[data-section-id]");
  if (!section) return;
  event.preventDefault();
  event.stopPropagation();
  const sectionId = section.getAttribute("data-section-id");
  if (!sectionId) return;
  parent.postMessage({ type: "${SITE_EDITOR_SECTION_SELECT_MESSAGE}", sectionId }, "*");
}, true);

document.addEventListener("dblclick", (event) => {
  const textEl = event.target.closest("[data-editable-text]");
  if (!textEl || textEl.getAttribute("contenteditable") === "true") return;
  event.preventDefault();
  event.stopPropagation();
  textEl.setAttribute("contenteditable", "true");
  textEl.focus();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}, true);

document.addEventListener("focusout", (event) => {
  const textEl = event.target.closest("[data-editable-text][contenteditable=true]");
  if (!textEl) return;
  textEl.removeAttribute("contenteditable");
  const blockId = textEl.closest("[data-block-id]")?.getAttribute("data-block-id");
  const sectionId = textEl.closest("[data-section-id]")?.getAttribute("data-section-id");
  const value = (textEl.textContent ?? "").trim();
  if (!blockId || !sectionId) return;
  parent.postMessage({
    type: "${SITE_EDITOR_TEXT_EDIT_MESSAGE}",
    sectionId,
    blockId,
    value,
  }, "*");
}, true);

document.addEventListener("dblclick", (event) => {
  const btn = event.target.closest("[data-editable-button]");
  if (!btn || btn.getAttribute("contenteditable") === "true") return;
  event.preventDefault();
  event.stopPropagation();
  btn.setAttribute("contenteditable", "true");
  btn.focus();
  const range = document.createRange();
  range.selectNodeContents(btn);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}, true);

document.addEventListener("focusout", (event) => {
  const btn = event.target.closest("[data-editable-button][contenteditable=true]");
  if (!btn) return;
  btn.removeAttribute("contenteditable");
  const blockId = btn.closest("[data-block-id]")?.getAttribute("data-block-id");
  const sectionId = btn.closest("[data-section-id]")?.getAttribute("data-section-id");
  const value = (btn.textContent ?? "").trim();
  if (!blockId || !sectionId) return;
  parent.postMessage({
    type: "${SITE_EDITOR_BUTTON_EDIT_MESSAGE}",
    sectionId,
    blockId,
    value,
  }, "*");
}, true);
`;

function columnCountForPattern(pattern: string): number {
  if (pattern === "1-1-1") return 3;
  if (pattern === "1-1" || pattern === "2-1" || pattern === "1-2") return 2;
  return 1;
}

const MAX_BLOCK_DEPTH = 3;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sectionAnchorId(sectionId: string): string {
  return `section-${sectionId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function ratioClass(ratio: MediaContent["ratio"]): string {
  return `site-media--ratio-${ratio.replace(":", "-")}`;
}

function textRoleClass(role: TextContent["role"]): string {
  return `site-text--${role}`;
}

function textWidthClass(maxWidth?: TextContent["maxWidth"]): string {
  if (maxWidth === "narrow") return "site-text--width-narrow";
  if (maxWidth === "full") return "site-text--width-full";
  return "site-text--width-normal";
}

function textAlignClass(align?: TextContent["align"]): string {
  if (align === "center") return "site-text--align-center";
  if (align === "right") return "site-text--align-right";
  return "site-text--align-left";
}

function splitClass(pattern: string): string {
  return `site-split--${pattern}`;
}

function buttonHref(content: ButtonContent): string {
  const value = content.target.value.trim();
  switch (content.target.kind) {
    case "mail":
      return value.startsWith("mailto:") ? value : `mailto:${value}`;
    case "url":
    case "payment_link":
      return value;
    case "anchor":
    default:
      return value.startsWith("#") ? value : `#${value}`;
  }
}

function collectAssetsFromBlock(block: Block, manifest: Set<string>): void {
  if (block.type === "media") {
    const src = (block.content as MediaContent).src?.trim();
    if (src) manifest.add(src);
    const cover = (block.content as MediaContent).video?.cover?.trim();
    if (cover) manifest.add(cover);
  }
  if (block.type === "collection") {
    const content = block.content as CollectionContent;
    collectAssetsFromBlock(content.itemTemplate, manifest);
    for (const item of content.items) {
      const src = item.src?.trim();
      if (src) manifest.add(src);
    }
  }
  for (const child of block.children ?? []) {
    collectAssetsFromBlock(child, manifest);
  }
}

function buildRenderContext(options: SiteRenderOptions, locale: string): RenderContext {
  return { locale, editorMode: options.editorMode };
}

function renderTextBlock(content: TextContent, editorMode: RenderContext): string {
  const value = resolveTextValue(content, editorMode.locale);
  if (!value && !editorMode.editorMode) return "";

  const tag =
    content.role === "h1"
      ? "h1"
      : content.role === "h2"
        ? "h2"
        : content.role === "h3"
          ? "h3"
          : content.role === "quote"
            ? "blockquote"
            : "p";

  const classes = [
    "site-text",
    textRoleClass(content.role),
    textWidthClass(content.maxWidth),
    textAlignClass(content.align),
  ].join(" ");

  const editableAttr = editorMode.editorMode ? ' data-editable-text="true"' : "";
  const display = value || (editorMode.editorMode ? "Doble clic para editar" : "");

  return `<${tag} class="${classes}"${editableAttr}>${escapeHtml(display)}</${tag}>`;
}

function renderMediaBlock(content: MediaContent, manifest: Set<string>): string {
  const caption = content.caption?.trim();
  const ratio = ratioClass(content.ratio);
  const fitClass = content.fit === "contain" ? " site-media__asset--contain" : "";
  const src = content.src?.trim();

  let assetMarkup = "";
  if (content.mediaType === "image" && src) {
    manifest.add(src);
    assetMarkup = `<img class="site-media__asset${fitClass}" src="${escapeHtml(src)}" alt="${escapeHtml(caption || "Imagen")}" loading="lazy" decoding="async" />`;
  } else if (content.mediaType === "video" && src) {
    manifest.add(src);
    const poster = content.video?.cover?.trim();
    if (poster) manifest.add(poster);
    assetMarkup = `<video class="site-media__asset${fitClass}" src="${escapeHtml(src)}"${poster ? ` poster="${escapeHtml(poster)}"` : ""}${content.video?.loop ? " loop" : ""}${content.video?.autoplayMuted ? " autoplay muted playsinline" : " controls"}></video>`;
  } else if (content.mediaType === "embed" && src) {
    assetMarkup = `<iframe class="site-media__asset${fitClass}" src="${escapeHtml(src)}" title="${escapeHtml(caption || "Contenido incrustado")}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  } else {
    assetMarkup = `<div class="site-media__placeholder" aria-hidden>Media</div>`;
  }

  const duotoneAttr = content.duotone ? ' data-duotone="true"' : "";

  return `<figure class="site-figure">
  <div class="site-media ${ratio}"${duotoneAttr}>
    ${assetMarkup}
  </div>
  ${caption ? `<figcaption class="site-media__caption">${escapeHtml(caption)}</figcaption>` : ""}
</figure>`;
}

function renderButtonBlock(content: ButtonContent, editorMode: RenderContext): string {
  const label = resolveButtonLabel(content, editorMode.locale);
  const href = escapeHtml(buttonHref(content));
  const variant = content.variant === "secondary" ? "site-btn--secondary" : "site-btn--primary";
  const editableAttr = editorMode.editorMode ? ' data-editable-button="true"' : "";
  return `<a class="site-btn ${variant}" href="${href}"${editableAttr}>${escapeHtml(label || (editorMode.editorMode ? "Botón" : "Acción"))}</a>`;
}

function renderBlock(block: Block, manifest: Set<string>, depth: number, editorMode: RenderContext): string {
  if (depth > MAX_BLOCK_DEPTH) return "";

  const blockIdAttr = ` data-block-id="${escapeHtml(block.id)}"`;
  const inner = (() => {
    switch (block.type) {
      case "text":
        return renderTextBlock(block.content as TextContent, editorMode);
      case "media":
        return renderMediaBlock(block.content as MediaContent, manifest);
      case "button":
        return renderButtonBlock(block.content as ButtonContent, editorMode);
      case "collection":
        return renderCollectionBlock(block.content as CollectionContent, manifest, depth, editorMode);
      default:
        return "";
    }
  })();

  if (!inner) return "";
  if (block.type === "text" || block.type === "button") {
    return `<div class="site-block"${blockIdAttr}>${inner}</div>`;
  }
  return inner.replace(/^(\<[a-z]+)/, `$1${blockIdAttr}`);
}

function sectionMotionClasses(section: Block): string {
  if (section.motion.mode !== "override") return "";
  const preset = section.motion.preset ?? "soft";
  const trigger = section.motion.trigger ?? "appear";
  return ` site-section--motion-${preset} site-section--motion-trigger-${trigger}`;
}

function renderCollectionItemHtml(
  content: CollectionContent,
  item: CollectionContent["items"][number],
  manifest: Set<string>,
  depth: number,
  editorMode: RenderContext,
): string {
  const template = structuredClone(content.itemTemplate);
  if (template.type === "media" && item.src) {
    (template.content as MediaContent).src = item.src;
  }
  if (template.type === "text") {
    const text = template.content as TextContent;
    const caption = item.caption?.trim();
    if (caption && !resolveTextValue(text, editorMode.locale)) text.value = caption;
  }
  return `<div class="site-collection__item">${renderBlock(template, manifest, depth + 1, editorMode)}</div>`;
}

function renderCollectionOverflowFooter(
  slice: ReturnType<typeof sliceCollectionItems>,
  hiddenItemHtml: string,
): string {
  if (!slice.showMoreControl || slice.hiddenCount <= 0 || !hiddenItemHtml.trim()) return "";
  return `<div class="site-collection__overflow">
  <div class="site-collection__overflow-items" hidden>${hiddenItemHtml}</div>
  <button type="button" class="site-collection__more-btn">Ver ${slice.hiddenCount} más</button>
</div>`;
}

function renderTableCollectionCards(
  fields: string[],
  items: CollectionContent["items"],
): string {
  const cards = items
    .map((item) => {
      const rows = fields
        .map((field) => {
          const value = item[field]?.trim() || "—";
          return `<div class="site-collection__table-card-row"><dt>${escapeHtml(field)}</dt><dd>${escapeHtml(value)}</dd></div>`;
        })
        .join("");
      return `<article class="site-collection__table-card">${rows}</article>`;
    })
    .join("");
  return `<div class="site-collection__table-cards">${cards}</div>`;
}

function renderCollectionBlock(
  content: CollectionContent,
  manifest: Set<string>,
  depth: number,
  editorMode: RenderContext,
): string {
  if (depth >= MAX_BLOCK_DEPTH) return "";

  const allItems = content.items.length ? content.items : [{}, {}, {}];
  const slice = sliceCollectionItems(allItems, content.overflow, content.view, content.viewOptions);
  const items = slice.visibleItems;
  const hiddenItems = allItems.slice(items.length);
  const view = content.view;

  if (view === "table") {
    const tableOpts = content.viewOptions as TableOpts;
    const fields = tableOpts.visibleFields?.length ? tableOpts.visibleFields : ["src", "caption"];
    const head = fields.map((field) => `<th>${escapeHtml(field)}</th>`).join("");
    const rows = items
      .map((item) => {
        const cells = fields
          .map((field) => `<td>${escapeHtml(item[field]?.trim() || "—")}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    const hiddenRows = hiddenItems
      .map((item) => {
        const cells = fields
          .map((field) => `<td>${escapeHtml(item[field]?.trim() || "—")}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    const zebra = tableOpts.zebra !== false ? " site-collection--table-zebra" : "";
    const sticky = tableOpts.stickyHeader !== false ? " site-collection--table-sticky" : "";
    const overflowFooter = renderCollectionOverflowFooter(slice, hiddenRows);
    return `<div class="site-collection site-collection--table${zebra}${sticky}" data-view="table">
  <div class="site-collection__table-wrap">
    <table class="site-collection__table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
  </div>
  ${renderTableCollectionCards(fields, items)}
  ${overflowFooter}
</div>`;
  }

  if (view === "marquee") {
    const marqueeOpts = content.viewOptions as MarqueeOpts;
    const speed = marqueeOpts.speed ?? 2;
    const grayscale = marqueeOpts.grayscale ? " site-collection--marquee-grayscale" : "";
    const itemHtml = items.map((item) => renderCollectionItemHtml(content, item, manifest, depth, editorMode)).join("");
    const hiddenHtml = hiddenItems
      .map((item) => renderCollectionItemHtml(content, item, manifest, depth, editorMode))
      .join("");
    return `<div class="site-collection site-collection--marquee${grayscale}" data-view="marquee" data-speed="${speed}">
  <div class="site-collection__marquee-track">${itemHtml}${itemHtml}</div>
  ${renderCollectionOverflowFooter(slice, hiddenHtml)}
</div>`;
  }

  if (view === "carousel") {
    const carouselOpts = content.viewOptions as CarouselOpts;
    const controls = carouselOpts.controls ?? "dots";
    const peek = carouselOpts.peek !== false ? " site-collection--carousel-peek" : "";
    const snap = carouselOpts.snap !== false ? " site-collection--carousel-snap" : "";
    const itemHtml = items.map((item) => renderCollectionItemHtml(content, item, manifest, depth, editorMode)).join("");
    const hiddenHtml = hiddenItems
      .map((item) => renderCollectionItemHtml(content, item, manifest, depth, editorMode))
      .join("");
    return `<div class="site-collection site-collection--carousel${peek}${snap}" data-view="carousel" data-controls="${escapeHtml(controls)}"${carouselOpts.autoplay ? ' data-autoplay="true"' : ""}>
  <div class="site-collection__carousel-track">${itemHtml}</div>
  ${renderCollectionOverflowFooter(slice, hiddenHtml)}
</div>`;
  }

  const grid = content.viewOptions as GridOpts;
  const columns = grid?.columns ?? 3;
  const density = grid?.density ?? "normal";
  const itemHtml = items.map((item) => renderCollectionItemHtml(content, item, manifest, depth, editorMode)).join("");
  const hiddenHtml = hiddenItems
    .map((item) => renderCollectionItemHtml(content, item, manifest, depth, editorMode))
    .join("");
  return `<div class="site-collection site-collection--grid site-collection--grid-${columns} site-collection--density-${density}" data-view="grid">
  ${itemHtml}
  ${renderCollectionOverflowFooter(slice, hiddenHtml)}
</div>`;
}

function renderGroupedChildCells(
  children: Block[],
  groupSize: number,
  manifest: Set<string>,
  ctx: RenderContext,
): string {
  if (groupSize <= 1) {
    return children
      .map((child) => `<div class="site-cell">${renderBlock(child, manifest, 2, ctx)}</div>`)
      .join("");
  }

  const columns: Block[][] = [];
  for (let index = 0; index < children.length; index += groupSize) {
    columns.push(children.slice(index, index + groupSize));
  }

  return columns
    .map((group) => {
      const inner = group
        .map((child) => renderBlock(child, manifest, 2, ctx))
        .filter(Boolean)
        .join("");
      return `<div class="site-cell site-cell--stack">${inner}</div>`;
    })
    .join("");
}

function renderSection(
  section: Block,
  manifest: Set<string>,
  options: SiteRenderOptions,
  locale: string,
): string {
  const ctx = buildRenderContext(options, locale);
  const bleed = section.layout.bleed ?? "contained";
  const pattern = section.layout.split?.pattern ?? "1";
  const groupSize = section.layout.split?.groupSize ?? 1;
  const rootPosition = section.layout.split?.rootPosition ?? "first-cell";
  const selected = options.selectedSectionId === section.id ? " is-selected" : "";
  const anchor = sectionAnchorId(section.id);

  const rootHtml = renderBlock(section, manifest, 1, ctx);
  const children = section.children ?? [];
  const childHtml = renderGroupedChildCells(children, groupSize, manifest, ctx);

  const splitInner =
    rootPosition === "above"
      ? `<div class="site-split ${splitClass(pattern)}">${childHtml}</div>`
      : children.length > 0
        ? `<div class="site-split ${splitClass(pattern)}">${rootHtml ? `<div class="site-cell">${rootHtml}</div>` : ""}${childHtml}</div>`
        : `<div class="site-split site-split--1">${rootHtml ? `<div class="site-cell">${rootHtml}</div>` : ""}</div>`;

  const aboveRoot = rootPosition === "above" && rootHtml ? rootHtml : "";
  const stackCenter =
    section.type === "text" && (section.content as TextContent).align === "center" ? " site-stack--center" : "";

  return `<section id="${anchor}" class="site-section site-section--${bleed}${selected}${sectionMotionClasses(section)}" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(section.id)}" aria-label="Sección">
  <div class="site-section__inner">
    <div class="site-stack${stackCenter}">
      ${aboveRoot}
      ${splitInner}
    </div>
  </div>
</section>`;
}

function renderPublishedPagesNav(
  project: SiteProject,
  currentPageId: string,
  publishedSlug: string,
): string {
  if (project.pages.length <= 1) return "";

  const links = project.pages
    .map((entry, index) => {
      const pathSlug = sitePagePathSlug(entry, index);
      const href = sitePublicPath(publishedSlug, pathSlug);
      const label = entry.seo.title.trim() || `Página ${index + 1}`;
      const current = entry.id === currentPageId ? ' aria-current="page"' : "";
      return `<a href="${escapeHtml(href)}"${current}>${escapeHtml(label)}</a>`;
    })
    .join("");

  return `<nav class="site-page__site-nav" aria-label="Páginas del sitio">${links}</nav>`;
}

function renderNav(page: SitePage, sectionLabels: Record<string, string>): string {
  if (!page.nav.enabled || page.nav.include.length === 0) return "";

  const links = page.nav.include
    .map((sectionId) => {
      const section = page.sections.find((entry) => entry.id === sectionId);
      if (!section) return "";
      const label = sectionLabels[sectionId]?.trim() || "Sección";
      const href = `#${sectionAnchorId(sectionId)}`;
      return `<a href="${href}">${escapeHtml(label)}</a>`;
    })
    .filter(Boolean)
    .join("");

  if (!links) return "";

  return `<header class="site-page__header">
  <nav class="site-page__nav" aria-label="Navegación principal">${links}</nav>
</header>`;
}

function renderMain(page: SitePage, manifest: Set<string>, options: SiteRenderOptions, locale: string): string {
  const sections = page.sections
    .map((section) => renderSection(section, manifest, options, locale))
    .join("\n");
  const leadForm =
    options.production &&
    options.publishedSlug?.trim() &&
    page.leadsForm?.enabled
      ? renderSiteLeadForm({
          slug: options.publishedSlug.trim(),
          pageId: page.id,
          locale,
          config: page.leadsForm,
        })
      : "";
  return `<main class="site-page__main">${sections}${leadForm ? `\n${leadForm}` : ""}</main>`;
}

function resolveRenderPage(project: SiteProject, pageId?: string) {
  if (pageId) {
    return project.pages.find((page) => page.id === pageId) ?? getActiveSitePage(project);
  }
  return getActiveSitePage(project);
}

/** Renderer puro — misma salida para editor (iframe) y publish. */
export function renderSiteProject(project: SiteProject, options: SiteRenderOptions = {}): SiteRenderOutput {
  const manifest = new Set<string>();
  const sectionLabels = options.sectionLabels ?? {};
  const locale = options.locale?.trim() || resolvePreviewLocale(project);
  const effective = applySiteAdnToProject(project, options.adn);
  const page = resolveRenderPage(effective, options.pageId);

  for (const section of page.sections) {
    collectAssetsFromBlock(section, manifest);
  }

  const siteNav =
    options.production && options.publishedSlug?.trim()
      ? renderPublishedPagesNav(effective, page.id, options.publishedSlug.trim())
      : "";

  const body = `${siteNav}${renderNav(page, sectionLabels)}
${renderMain(page, manifest, options, locale)}`;

  const ledgerCss = ledgerOverridesStylesheet(effective.ledger);
  const productionJs = options.production && !options.editorMode ? SITE_PUBLISH_FULL_RUNTIME_JS : "";

  return {
    html: `${body.trim()}\n`,
    css: `${siteThemeStylesheet(effective.theme, options.adn)}${ledgerCss ? `\n${ledgerCss}` : ""}`,
    js: productionJs,
    assetsManifest: [...manifest],
  };
}

export function buildSiteHtmlDocument(project: SiteProject, options: SiteRenderOptions = {}): string {
  const locale = options.locale ?? resolvePreviewLocale(project);
  const page = resolveRenderPage(project, options.pageId);
  const { html, css, js } = renderSiteProject(project, { ...options, locale });
  const title = page.seo.title.trim() || "Sitio";
  const description = page.seo.description.trim();
  const fontsHref = siteAdnGoogleFontsHref(options.adn);
  const editorCss = options.editorMode ? SITE_EDITOR_CSS : "";
  const editorScript = options.editorMode ? SITE_EDITOR_SCRIPT : "";
  const ogImage = findFirstPublishedOgImage(page);
  const brandName = options.adn?.brandName?.trim() || title;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brandName,
    ...(description ? { description } : {}),
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ""}
  <meta property="og:title" content="${escapeHtml(title)}" />
  ${description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : ""}
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ""}
  <script type="application/ld+json">${jsonLd}</script>
  ${fontsHref ? `<link rel="stylesheet" href="${escapeHtml(fontsHref)}" />` : ""}
  <style>${css}${editorCss}</style>
</head>
<body>
${html}
${editorScript ? `<script>${editorScript}</script>` : js ? `<script>${js}</script>` : ""}
${options.editorMode ? `<script>${SITE_COLLECTION_OVERFLOW_JS}</script>` : ""}
</body>
</html>`;
}

function findFirstPublishedOgImage(page: SitePage): string | null {
  for (const section of page.sections) {
    const fromSection = extractMediaSrc(section);
    if (fromSection) return fromSection;
    for (const child of section.children ?? []) {
      const fromChild = extractMediaSrc(child);
      if (fromChild) return fromChild;
    }
  }
  return null;
}

function extractMediaSrc(block: Block): string | null {
  if (block.type === "media") {
    const src = (block.content as MediaContent).src?.trim();
    return src || null;
  }
  return null;
}

export function buildSiteSrcDoc(project: SiteProject, options: SiteRenderOptions = {}): string {
  return buildSiteHtmlDocument(project, options);
}
