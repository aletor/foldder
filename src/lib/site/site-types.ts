/** Site node — data model (contract F1, spec §1). */

import type { SiteLeadFormConfig, SiteLeadsOutput } from "./site-leads";

export type BlockType = "text" | "media" | "button" | "collection";

export type SourceKind = "manual" | "dataset" | "populate" | "designer";

export type TextRole = "h1" | "h2" | "h3" | "body" | "quote" | "caption";

export type TextContent = {
  role: TextRole;
  value: string;
  /** Traducciones por locale (fallback → value). */
  localeValues?: Record<string, string>;
  maxWidth?: "narrow" | "normal" | "full";
  align?: "left" | "center" | "right";
};

export type MediaContent = {
  mediaType: "image" | "video" | "embed";
  src: string;
  ratio: "1:1" | "4:3" | "16:9" | "9:16" | "3:2" | "auto";
  fit: "cover" | "contain";
  duotone: boolean;
  caption?: string;
  video?: { loop: boolean; autoplayMuted: boolean; cover?: string };
};

export type ButtonContent = {
  label: string;
  localeLabels?: Record<string, string>;
  target: { kind: "anchor" | "url" | "mail" | "payment_link"; value: string };
  variant: "primary" | "secondary";
};

export type GridOpts = { columns: 1 | 2 | 3 | 4; density: "compact" | "normal" | "airy" };
export type CarouselOpts = {
  snap: boolean;
  autoplay: boolean;
  peek: boolean;
  controls: "arrows" | "dots" | "both" | "none";
};
export type TableOpts = { visibleFields: string[]; stickyHeader: boolean; zebra: boolean };
export type MarqueeOpts = { speed: 1 | 2 | 3; grayscale: boolean };

export type CollectionView = "grid" | "carousel" | "table" | "marquee";

export type CollectionItem = Record<string, string>;

export type CollectionContent = {
  view: CollectionView;
  itemTemplate: Block;
  items: CollectionItem[];
  binding?: {
    /** Listado del Dataset cableado. */
    listId?: string;
    /** Columna imagen del listado. */
    imageFieldId?: string;
    map: Record<string, string>;
    limit?: number;
    sort?: { field: string; dir: "asc" | "desc" };
  };
  overflow: "grow" | "paginate_static" | "truncate_more";
  viewOptions: GridOpts | CarouselOpts | TableOpts | MarqueeOpts;
};

export type BlockContent = TextContent | MediaContent | ButtonContent | CollectionContent;

export type BlockLayout = {
  bleed?: "full" | "contained";
  split?: {
    pattern: "1" | "1-1" | "2-1" | "1-2" | "1-1-1" | "bento-a" | "bento-b";
    /** Agrupa hijos en columnas (ej. pricing 3×3). */
    groupSize?: number;
    /** Título de sección encima del split en lugar de primera celda. */
    rootPosition?: "first-cell" | "above";
  };
  cellSpan?: number;
};

export type BlockMotion = {
  mode: "inherit" | "override";
  preset?: "soft" | "expo" | "bounce" | "linear";
  trigger?: "appear" | "scroll" | "hover";
};

export type ThemeOverride = {
  id: string;
  blockId: string;
  path: string;
  value: string;
  label: string;
};

export interface Block {
  id: string;
  type: BlockType;
  source: {
    kind: SourceKind;
    ref?: string;
  };
  content: BlockContent;
  layout: BlockLayout;
  motion: BlockMotion;
  children?: Block[];
  overrides?: ThemeOverride[];
}

export type Locale = string;

export type SitePage = {
  id: string;
  sections: Block[];
  nav: { enabled: boolean; include: string[] };
  seo: { title: string; description: string };
  /** Formulario de leads embebido en la página publicada. */
  leadsForm?: SiteLeadFormConfig;
};

export type SiteSectionLibraryEntry = {
  id: string;
  label: string;
  section: Block;
  savedAt: string;
};

export type ThemeBase = "brandKit" | "neutral";

export type ThemeDialRhythm = "compact" | "normal" | "airy";
export type ThemeDialRadius = "none" | "soft" | "round";
export type ThemeDialPolarity = "auto" | "light" | "dark";
export type ThemeFinishPreset = "editorial" | "impact" | "minimal";
export type MotionDna = "soft" | "expo" | "bounce" | "linear";

export type ThemeState = {
  base: ThemeBase;
  adnRef?: string;
  dials: {
    rhythm: ThemeDialRhythm;
    radius: ThemeDialRadius;
    polarity: ThemeDialPolarity;
    motionIntensity: 0 | 1 | 2;
  };
  finishPreset?: ThemeFinishPreset;
  motionDNA: MotionDna;
  respectReducedMotion: boolean;
};

export type PublishStatus = "draft" | "published" | "stale";

export type PublishState = {
  status: PublishStatus;
  slug?: string;
  publishedAt?: string;
  snapshotHash?: string;
  /** URL pública servida por /site/{slug} */
  publicUrl?: string;
  /** Dominio propio (CNAME → app). */
  customDomain?: string;
  /** Subdominio CDN `{slug}.foldder.com` */
  cdnHostname?: string;
};

export type SiteProject = {
  id: string;
  slug: string;
  /** Páginas del sitio (multi-página). */
  pages: SitePage[];
  activePageId: string;
  theme: ThemeState;
  locales: Locale[];
  /** Locale usado en preview/render cuando no se pasa explícito. */
  previewLocale?: string;
  /** Sincroniza entradas del grafo al borrador automáticamente. */
  autoGraphSync?: boolean;
  publish: PublishState;
  ledger: ThemeOverride[];
  /** Secciones guardadas reutilizables. */
  sectionLibrary?: SiteSectionLibraryEntry[];
};

export type SiteNodeStatus = "empty" | "draft" | "published";

export type SiteNodeData = {
  label?: string;
  status?: SiteNodeStatus;
  project?: SiteProject;
  /** Display name per section id (feeds auto-nav). */
  sectionLabels?: Record<string, string>;
  /** Salida leads para el grafo (json). */
  leadsOutput?: SiteLeadsOutput;
};

export type SiteFactoryPresetId =
  | "hero"
  | "manifesto"
  | "gallery"
  | "faq"
  | "pricing"
  | "voice"
  | "cta"
  | "footer"
  | "empty";

export type SiteInspectorTab = "content" | "layout" | "motion";

export type SitePreviewMode = "desktop" | "mobile";
