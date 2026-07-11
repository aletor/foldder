import type { Block, TextContent } from "./site-types";

/** Primera línea de texto útil para thumbnail del rail. */
export function siteSectionPreviewLine(section: Block): string {
  const readBlock = (block: Block): string | null => {
    if (block.type === "text") {
      const value = (block.content as TextContent).value.trim();
      return value || null;
    }
    return null;
  };

  const root = readBlock(section);
  if (root) return root.slice(0, 48);

  for (const child of section.children ?? []) {
    const line = readBlock(child);
    if (line) return line.slice(0, 48);
  }

  return section.type;
}
