import type {
  Block,
  BlockMotion,
  BlockContent,
  BlockLayout,
  BlockType,
  ButtonContent,
  CollectionContent,
  MediaContent,
  TextContent,
  TextRole,
} from "./site-types";

/** Bloques editables en una sección (raíz + hijos directos). */
export function flattenSectionBlocks(section: Block): Block[] {
  return [section, ...(section.children ?? [])];
}

export function findBlockInSection(section: Block, blockId: string): Block | null {
  if (section.id === blockId) return section;
  return section.children?.find((child) => child.id === blockId) ?? null;
}

export function updateBlockInSection(
  section: Block,
  blockId: string,
  updater: (block: Block) => Block,
): Block {
  if (section.id === blockId) return updater(section);
  if (!section.children?.length) return section;

  let changed = false;
  const children = section.children.map((child) => {
    if (child.id !== blockId) return child;
    changed = true;
    return updater(child);
  });
  return changed ? { ...section, children } : section;
}

export function patchBlockContent(section: Block, blockId: string, content: BlockContent): Block {
  return updateBlockInSection(section, blockId, (block) => ({ ...block, content }));
}

export function patchBlockLayout(section: Block, layout: BlockLayout): Block {
  return { ...section, layout: { ...section.layout, ...layout } };
}

export function patchBlockMotion(section: Block, motion: BlockMotion): Block {
  return { ...section, motion: { ...section.motion, ...motion } };
}

export function patchBlockMotionInSection(
  section: Block,
  blockId: string,
  motion: Partial<BlockMotion>,
): Block {
  return updateBlockInSection(section, blockId, (block) => ({
    ...block,
    motion: { ...block.motion, ...motion },
  }));
}

export function duplicateBlockInSection(
  section: Block,
  blockId: string,
  newId: string,
): { section: Block; newBlockId: string | null } {
  if (section.id === blockId) {
    return { section, newBlockId: null };
  }
  const children = section.children ?? [];
  const index = children.findIndex((child) => child.id === blockId);
  if (index < 0) return { section, newBlockId: null };
  const source = children[index]!;
  const clone = structuredClone(source);
  clone.id = newId;
  const nextChildren = [...children];
  nextChildren.splice(index + 1, 0, clone);
  return { section: { ...section, children: nextChildren }, newBlockId: clone.id };
}

const TEXT_ROLE_LABELS: Record<TextRole, string> = {
  h1: "Titular",
  h2: "Subtítulo",
  h3: "Encabezado",
  body: "Cuerpo",
  quote: "Cita",
  caption: "Pie",
};

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  text: "Texto",
  media: "Media",
  button: "Botón",
  collection: "Colección",
};

export function blockEditorLabel(block: Block, index: number): string {
  if (block.type === "text") {
    const role = (block.content as TextContent).role;
    return `${TEXT_ROLE_LABELS[role] ?? "Texto"}${index === 0 ? " · sección" : ""}`;
  }
  return `${BLOCK_TYPE_LABELS[block.type]}${index === 0 ? " · sección" : ""}`;
}

export function isTextContent(content: BlockContent): content is TextContent {
  return "role" in content && "value" in content && !("mediaType" in content);
}

export function isMediaContent(content: BlockContent): content is MediaContent {
  return "mediaType" in content;
}

export function isButtonContent(content: BlockContent): content is ButtonContent {
  return "label" in content && "target" in content && "variant" in content;
}

export function isCollectionContent(content: BlockContent): content is CollectionContent {
  return "view" in content && "itemTemplate" in content;
}
