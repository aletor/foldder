import { applySiteAdnToProject, siteAdnGoogleFontsHref, type SiteAdnContext } from "./site-adn";
import { getActiveSitePage, resolvePreviewLocale } from "./site-project";
import { ledgerOverridesStylesheet } from "./site-theme-ledger";
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
  selectedSectionId?: string | null;
  sectionLabels?: Record<string, string>;
  adn?: SiteAdnContext | null;
  /** Inyecta script/CSS para seleccionar secciones desde el iframe del studio. */
  editorMode?: boolean;
};

export const SITE_EDITOR_SECTION_SELECT_MESSAGE = "foldder-site-section-select" as const;

const SITE_EDITOR_CSS = `
.site-section[data-section-id] {
  cursor: pointer;
}
.site-section[data-section-id]:hover {
  outline: 2px dashed color-mix(in srgb, var(--c-accent) 55%, transparent);
  outline-offset: -2px;
}
`;

const SITE_EDITOR_SCRIPT = `
document.addEventListener("click", (event) => {
  const section = event.target.closest("[data-section-id]");
  if (!section) return;
  event.preventDefault();
  event.stopPropagation();
  const sectionId = section.getAttribute("data-section-id");
  if (!sectionId) return;
  parent.postMessage({ type: "${SITE_EDITOR_SECTION_SELECT_MESSAGE}", sectionId }, "*");
}, true);
`;

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

function renderTextBlock(content: TextContent): string {
  const value = content.value.trim();
  if (!value) return "";

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

  return `<${tag} class="${classes}">${escapeHtml(value)}</${tag}>`;
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

function renderButtonBlock(content: ButtonContent): string {
  const label = content.label.trim() || "Acción";
  const href = escapeHtml(buttonHref(content));
  const variant = content.variant === "secondary" ? "site-btn--secondary" : "site-btn--primary";
  return `<a class="site-btn ${variant}" href="${href}">${escapeHtml(label)}</a>`;
}

function renderBlock(block: Block, manifest: Set<string>, depth: number): string {
  if (depth > MAX_BLOCK_DEPTH) return "";

  const blockIdAttr = ` data-block-id="${escapeHtml(block.id)}"`;
  const inner = (() => {
    switch (block.type) {
      case "text":
        return renderTextBlock(block.content as TextContent);
      case "media":
        return renderMediaBlock(block.content as MediaContent, manifest);
      case "button":
        return renderButtonBlock(block.content as ButtonContent);
      case "collection":
        return renderCollectionBlock(block.content as CollectionContent, manifest, depth);
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
): string {
  const template = structuredClone(content.itemTemplate);
  if (template.type === "media" && item.src) {
    (template.content as MediaContent).src = item.src;
  }
  if (template.type === "text") {
    const text = template.content as TextContent;
    const caption = item.caption?.trim();
    if (caption && !text.value.trim()) text.value = caption;
  }
  return `<div class="site-collection__item">${renderBlock(template, manifest, depth + 1)}</div>`;
}

function renderCollectionBlock(content: CollectionContent, manifest: Set<string>, depth: number): string {
  if (depth >= MAX_BLOCK_DEPTH) return "";

  const items = content.items.length ? content.items : [{}, {}, {}];
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
    const zebra = tableOpts.zebra !== false ? " site-collection--table-zebra" : "";
    const sticky = tableOpts.stickyHeader !== false ? " site-collection--table-sticky" : "";
    return `<div class="site-collection site-collection--table${zebra}${sticky}" data-view="table">
  <table class="site-collection__table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
</div>`;
  }

  if (view === "marquee") {
    const marqueeOpts = content.viewOptions as MarqueeOpts;
    const speed = marqueeOpts.speed ?? 2;
    const grayscale = marqueeOpts.grayscale ? " site-collection--marquee-grayscale" : "";
    const itemHtml = items.map((item) => renderCollectionItemHtml(content, item, manifest, depth)).join("");
    return `<div class="site-collection site-collection--marquee${grayscale}" data-view="marquee" data-speed="${speed}">
  <div class="site-collection__marquee-track">${itemHtml}${itemHtml}</div>
</div>`;
  }

  if (view === "carousel") {
    const carouselOpts = content.viewOptions as CarouselOpts;
    const controls = carouselOpts.controls ?? "dots";
    const peek = carouselOpts.peek !== false ? " site-collection--carousel-peek" : "";
    const snap = carouselOpts.snap !== false ? " site-collection--carousel-snap" : "";
    const itemHtml = items.map((item) => renderCollectionItemHtml(content, item, manifest, depth)).join("");
    return `<div class="site-collection site-collection--carousel${peek}${snap}" data-view="carousel" data-controls="${escapeHtml(controls)}"${carouselOpts.autoplay ? ' data-autoplay="true"' : ""}>
  <div class="site-collection__carousel-track">${itemHtml}</div>
</div>`;
  }

  const grid = content.viewOptions as GridOpts;
  const columns = grid?.columns ?? 3;
  const density = grid?.density ?? "normal";
  const itemHtml = items.map((item) => renderCollectionItemHtml(content, item, manifest, depth)).join("");
  return `<div class="site-collection site-collection--grid site-collection--grid-${columns} site-collection--density-${density}" data-view="grid">${itemHtml}</div>`;
}

function renderSection(section: Block, manifest: Set<string>, options: SiteRenderOptions): string {
  const bleed = section.layout.bleed ?? "contained";
  const pattern = section.layout.split?.pattern ?? "1";
  const selected = options.selectedSectionId === section.id ? " is-selected" : "";
  const anchor = sectionAnchorId(section.id);

  const rootHtml = renderBlock(section, manifest, 1);
  const children = section.children ?? [];
  const childHtml = children.map((child) => `<div class="site-cell">${renderBlock(child, manifest, 2)}</div>`).join("");

  const cells =
    children.length > 0
      ? `<div class="site-split ${splitClass(pattern)}">${rootHtml ? `<div class="site-cell">${rootHtml}</div>` : ""}${childHtml}</div>`
      : `<div class="site-split site-split--1">${rootHtml ? `<div class="site-cell">${rootHtml}</div>` : ""}</div>`;

  const stackCenter =
    section.type === "text" && (section.content as TextContent).align === "center" ? " site-stack--center" : "";

  return `<section id="${anchor}" class="site-section site-section--${bleed}${selected}${sectionMotionClasses(section)}" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(section.id)}" aria-label="Sección">
  <div class="site-section__inner">
    <div class="site-stack${stackCenter}">
      ${cells}
    </div>
  </div>
</section>`;
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

function renderMain(page: SitePage, manifest: Set<string>, options: SiteRenderOptions): string {
  const sections = page.sections.map((section) => renderSection(section, manifest, options)).join("\n");
  return `<main class="site-page__main">${sections}</main>`;
}

/** Renderer puro — misma salida para editor (iframe) y publish. */
export function renderSiteProject(project: SiteProject, options: SiteRenderOptions = {}): SiteRenderOutput {
  const manifest = new Set<string>();
  const sectionLabels = options.sectionLabels ?? {};
  const effective = applySiteAdnToProject(project, options.adn);
  const page = getActiveSitePage(effective);

  for (const section of page.sections) {
    collectAssetsFromBlock(section, manifest);
  }

  const body = `${renderNav(page, sectionLabels)}
${renderMain(page, manifest, options)}`;

  const ledgerCss = ledgerOverridesStylesheet(effective.ledger);

  return {
    html: `${body.trim()}\n`,
    css: `${siteThemeStylesheet(effective.theme, options.adn)}${ledgerCss ? `\n${ledgerCss}` : ""}`,
    js: "",
    assetsManifest: [...manifest],
  };
}

export function buildSiteSrcDoc(project: SiteProject, options: SiteRenderOptions = {}): string {
  const locale = options.locale ?? resolvePreviewLocale(project);
  const { html, css, js } = renderSiteProject(project, options);
  const activePage = getActiveSitePage(project);
  const title = activePage.seo.title.trim() || "Sitio";
  const description = activePage.seo.description.trim();
  const fontsHref = siteAdnGoogleFontsHref(options.adn);
  const editorCss = options.editorMode ? SITE_EDITOR_CSS : "";
  const editorScript = options.editorMode ? SITE_EDITOR_SCRIPT : "";

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ""}
  ${fontsHref ? `<link rel="stylesheet" href="${escapeHtml(fontsHref)}" />` : ""}
  <style>${css}${editorCss}</style>
</head>
<body>
${html}
${editorScript ? `<script>${editorScript}</script>` : js ? `<script>${js}</script>` : ""}
</body>
</html>`;
}
