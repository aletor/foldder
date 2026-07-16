import { findBlockInSection, flattenSectionBlocks } from "./site-block-tree";
import type { Block, BlockType, ButtonContent, SourceKind, TextContent, TextRole } from "./site-types";

export type SiteSelectionKind = "page" | "section" | "block";

export type SiteSelectionState = {
  sectionId: string | null;
  blockId: string | null;
  kind: SiteSelectionKind;
};

export type SiteSelectionContext = {
  kind: SiteSelectionKind;
  sectionId: string | null;
  blockId: string | null;
  section: Block | null;
  block: Block | null;
  sectionLabel: string;
  /** True when kind === "block" and block.id === section.id (root slot). */
  isSectionRootBlock: boolean;
  humanLabel: string;
  breadcrumb: SiteSelectionBreadcrumbItem[];
  capabilities: SiteSelectionCapabilities;
};

export type SiteSelectionBreadcrumbItem = {
  key: string;
  label: string;
  kind: SiteSelectionKind;
  sectionId?: string;
  blockId?: string;
};

export type SiteSelectionCapabilities = {
  level: SiteSelectionKind;
  blockType: BlockType | "section" | null;
  canEditInline: boolean;
  canDuplicate: boolean;
  canConfigureSource: boolean;
  toolbarProfile:
    | "section"
    | "text"
    | "media"
    | "button"
    | "collection"
    | "generic";
};

export type ContextToolbarActionId =
  | "type"
  | "alignment"
  | "width"
  | "source"
  | "motion"
  | "replace"
  | "ratio"
  | "fit"
  | "duotone"
  | "label"
  | "variant"
  | "target"
  | "view"
  | "density"
  | "split"
  | "bleed"
  | "order"
  | "duplicate"
  | "more";

const TEXT_ROLE_LABELS: Record<TextRole, string> = {
  h1: "Titular",
  h2: "Subtítulo",
  h3: "Encabezado",
  body: "Texto descriptivo",
  quote: "Cita",
  caption: "Pie de foto",
};

const SOURCE_LABELS: Record<SourceKind, string> = {
  manual: "Manual",
  dataset: "Dataset",
  populate: "Populate",
  designer: "Designer",
};

export function getBlockHumanLabel(
  block: Block,
  options: {
    isSectionRoot: boolean;
    siblingIndex: number;
    sectionLabel: string;
    buttonsBefore?: number;
  },
): string {
  if (options.isSectionRoot && block.id !== block.id) {
    // unreachable guard
  }

  if (block.type === "text") {
    const role = (block.content as TextContent).role;
    if (options.isSectionRoot && role === "h1") return "Titular";
    if (options.isSectionRoot && role === "h2") return "Subtítulo";
    return TEXT_ROLE_LABELS[role] ?? "Texto";
  }

  if (block.type === "media") {
    return options.siblingIndex === 0 || options.isSectionRoot ? "Imagen principal" : "Imagen";
  }

  if (block.type === "button") {
    const variant = (block.content as ButtonContent).variant;
    if (variant === "secondary") return "Botón secundario";
    const order = options.buttonsBefore ?? 0;
    return order === 0 ? "Botón principal" : "Botón";
  }

  if (block.type === "collection") {
    return options.isSectionRoot ? "Collection" : "Colección";
  }

  return options.isSectionRoot ? `Sección · ${options.sectionLabel}` : "Bloque";
}

export function getSourceSummary(block: Block): string {
  const kind = block.source.kind;
  const base = SOURCE_LABELS[kind];
  const ref = block.source.ref?.trim();
  if (!ref) return base;
  return `${base} · ${ref}`;
}

export function resolveSiteSelection(
  section: Block | null,
  state: SiteSelectionState,
  sectionLabels: Record<string, string>,
): SiteSelectionContext | null {
  if (!section || !state.sectionId || section.id !== state.sectionId) {
    if (state.kind === "page") {
      return {
        kind: "page",
        sectionId: null,
        blockId: null,
        section: null,
        block: null,
        sectionLabel: "Página",
        isSectionRootBlock: false,
        humanLabel: "Página",
        breadcrumb: [{ key: "page", label: "Página", kind: "page" }],
        capabilities: {
          level: "page",
          blockType: null,
          canEditInline: false,
          canDuplicate: false,
          canConfigureSource: false,
          toolbarProfile: "generic",
        },
      };
    }
    return null;
  }

  const sectionLabel = sectionLabels[section.id]?.trim() || "Sección";
  const blocks = flattenSectionBlocks(section);

  if (state.kind === "section") {
    const capabilities = getSelectionCapabilities({
      kind: "section",
      sectionId: section.id,
      blockId: null,
      section,
      block: null,
      sectionLabel,
      isSectionRootBlock: false,
      humanLabel: `Sección · ${sectionLabel}`,
      breadcrumb: [],
    });
    const breadcrumb = buildBreadcrumb(sectionLabel, section.id, null, "section", section, null);
    return {
      kind: "section",
      sectionId: section.id,
      blockId: null,
      section,
      block: null,
      sectionLabel,
      isSectionRootBlock: false,
      humanLabel: `Sección · ${sectionLabel}`,
      breadcrumb,
      capabilities,
    };
  }

  const blockId = state.blockId;
  if (!blockId) return null;

  const block = findBlockInSection(section, blockId);
  if (!block) return null;

  const flatIndex = blocks.findIndex((entry) => entry.id === block.id);
  const isSectionRootBlock = block.id === section.id;
  const buttonsBefore = blocks
    .slice(0, flatIndex)
    .filter((entry) => entry.type === "button").length;

  const humanLabel = getBlockHumanLabel(block, {
    isSectionRoot: isSectionRootBlock,
    siblingIndex: flatIndex,
    sectionLabel,
    buttonsBefore,
  });

  const draft: Omit<SiteSelectionContext, "capabilities" | "breadcrumb"> = {
    kind: "block",
    sectionId: section.id,
    blockId: block.id,
    section,
    block,
    sectionLabel,
    isSectionRootBlock,
    humanLabel,
  };

  const capabilities = getSelectionCapabilities({ ...draft, breadcrumb: [] });
  const breadcrumb = buildBreadcrumb(sectionLabel, section.id, block.id, "block", section, block);

  return { ...draft, breadcrumb, capabilities };
}

function buildBreadcrumb(
  sectionLabel: string,
  sectionId: string,
  blockId: string | null,
  kind: SiteSelectionKind,
  section: Block,
  block: Block | null,
): SiteSelectionBreadcrumbItem[] {
  const items: SiteSelectionBreadcrumbItem[] = [
    { key: `section:${sectionId}`, label: sectionLabel, kind: "section", sectionId },
  ];

  if (kind === "section" || !block || block.id === section.id) {
    return items;
  }

  const blocks = flattenSectionBlocks(section);
  const index = blocks.findIndex((entry) => entry.id === block.id);
  const buttonsBefore = blocks
    .slice(0, index)
    .filter((entry) => entry.type === "button").length;

  items.push({
    key: `block:${block.id}`,
    label: getBlockHumanLabel(block, {
      isSectionRoot: block.id === section.id,
      siblingIndex: index,
      sectionLabel,
      buttonsBefore,
    }),
    kind: "block",
    sectionId,
    blockId: block.id,
  });

  if (block.type === "collection") {
    items.push({
      key: `template:${block.id}`,
      label: "Card",
      kind: "block",
      sectionId,
      blockId: block.id,
    });
    const template = (block.content as { itemTemplate?: Block }).itemTemplate;
    if (template?.type === "media") {
      items.push({
        key: `template-media:${block.id}`,
        label: "Imagen",
        kind: "block",
        sectionId,
        blockId: block.id,
      });
    }
  }

  return items;
}

export function getSelectionCapabilities(ctx: Omit<SiteSelectionContext, "capabilities">): SiteSelectionCapabilities {
  if (ctx.kind === "page") {
    return {
      level: "page",
      blockType: null,
      canEditInline: false,
      canDuplicate: false,
      canConfigureSource: false,
      toolbarProfile: "generic",
    };
  }

  if (ctx.kind === "section") {
    return {
      level: "section",
      blockType: "section",
      canEditInline: false,
      canDuplicate: true,
      canConfigureSource: false,
      toolbarProfile: "section",
    };
  }

  const block = ctx.block!;
  const base = {
    level: "block" as const,
    blockType: block.type,
    canDuplicate: true,
    canConfigureSource: true,
  };

  switch (block.type) {
    case "text":
      return {
        ...base,
        canEditInline: true,
        toolbarProfile: "text",
      };
    case "media":
      return {
        ...base,
        canEditInline: false,
        toolbarProfile: "media",
      };
    case "button":
      return {
        ...base,
        canEditInline: true,
        toolbarProfile: "button",
      };
    case "collection":
      return {
        ...base,
        canEditInline: false,
        toolbarProfile: "collection",
      };
    default:
      return {
        ...base,
        canEditInline: false,
        canConfigureSource: false,
        toolbarProfile: "generic",
      };
  }
}

export function getContextToolbarActions(
  capabilities: SiteSelectionCapabilities,
): ContextToolbarActionId[] {
  switch (capabilities.toolbarProfile) {
    case "section":
      return ["split", "bleed", "order", "motion", "duplicate", "more"];
    case "text":
      return ["type", "alignment", "width", "source", "motion", "duplicate", "more"];
    case "media":
      return ["replace", "ratio", "fit", "duotone", "source", "motion", "duplicate", "more"];
    case "button":
      return ["label", "variant", "target", "motion", "duplicate", "more"];
    case "collection":
      return ["view", "density", "source", "motion", "duplicate", "more"];
    default:
      return ["motion", "duplicate", "more"];
  }
}

/** IDs de bloques seleccionables en orden DOM (raíz + hijos). */
export function getSelectableBlockIds(section: Block): string[] {
  return flattenSectionBlocks(section).map((block) => block.id);
}

export function getAdjacentSelectableBlockId(
  section: Block,
  currentBlockId: string,
  direction: 1 | -1,
): string | null {
  const ids = getSelectableBlockIds(section);
  const index = ids.indexOf(currentBlockId);
  if (index < 0) return null;
  const next = ids[index + direction];
  return next ?? null;
}

/** Etiqueta corta para hover en canvas (editor iframe). */
export function getBlockHoverLabel(
  block: Block,
  section: Block,
  sectionLabels: Record<string, string>,
): string {
  const blocks = flattenSectionBlocks(section);
  const index = blocks.findIndex((entry) => entry.id === block.id);
  const buttonsBefore = blocks
    .slice(0, index)
    .filter((entry) => entry.type === "button").length;
  return getBlockHumanLabel(block, {
    isSectionRoot: block.id === section.id,
    siblingIndex: Math.max(0, index),
    sectionLabel: sectionLabels[section.id]?.trim() || "Sección",
    buttonsBefore,
  });
}
