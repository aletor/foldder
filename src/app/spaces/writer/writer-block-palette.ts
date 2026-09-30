import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { WriterProfile } from "./writer-document";

export type WriterBlockCommand = {
  id: string;
  mark: string;
  label: string;
  keywords: string[];
};

const SCRIPT: WriterBlockCommand[] = [
  { id: "sceneHeading", mark: "#", label: "Encabezado", keywords: ["encabezado", "escena", "esc", "int"] },
  { id: "action", mark: "¶", label: "Acción", keywords: ["accion", "acción", "acc"] },
  { id: "character", mark: "@", label: "Personaje", keywords: ["personaje", "per"] },
  { id: "parenthetical", mark: "()", label: "Acotación", keywords: ["acotacion", "acotación", "aco"] },
  { id: "dialogue", mark: "“”", label: "Diálogo", keywords: ["dialogo", "diálogo", "dia"] },
  { id: "transition", mark: "→", label: "Transición", keywords: ["transicion", "transición", "trans", "corte"] },
];

const PROSE: WriterBlockCommand[] = [
  { id: "heading-1", mark: "H1", label: "Título 1", keywords: ["h1", "titulo", "título"] },
  { id: "heading-2", mark: "H2", label: "Título 2", keywords: ["h2", "subtitulo", "subtítulo"] },
  { id: "heading-3", mark: "H3", label: "Apartado", keywords: ["h3", "apartado"] },
  { id: "paragraph", mark: "¶", label: "Párrafo", keywords: ["parrafo", "párrafo", "p"] },
  { id: "blockquote", mark: "“", label: "Cita", keywords: ["cita"] },
  { id: "bulletList", mark: "•", label: "Lista", keywords: ["lista"] },
];

const PAGE_BREAK: WriterBlockCommand = {
  id: "pageBreak",
  mark: "—",
  label: "Salto de página",
  keywords: ["salto", "pagina", "página", "break"],
};

const CHAPTER: WriterBlockCommand = {
  id: "chapter",
  mark: "T",
  label: "Título",
  keywords: ["titulo", "título", "capitulo", "capítulo"],
};

export function writerBlockPalette(profile: WriterProfile): WriterBlockCommand[] {
  if (profile === "screenplay") return [...SCRIPT, PAGE_BREAK];
  if (profile === "document" || profile === "article") return [CHAPTER, ...PROSE, PAGE_BREAK];
  return [...PROSE, PAGE_BREAK];
}

export function writerSlashMatches(profile: WriterProfile, query: string): WriterBlockCommand[] {
  const folded = fold(query);
  const commands = writerBlockPalette(profile);
  if (!folded) return commands;
  return commands.filter((command) => [command.label, command.mark, ...command.keywords].some((word) => fold(word).includes(folded)));
}

export function writerSlashAt(doc: ProseMirrorNode, pos: number): { query: string; token: string } | null {
  const $pos = doc.resolve(Math.max(1, Math.min(pos, doc.content.size)));
  if (!$pos.parent.isTextblock) return null;
  const text = $pos.parent.textContent;
  const match = /^\/\S*/u.exec(text);
  if (!match) return null;
  const token = match[0];
  if ($pos.parentOffset > token.length) return null;
  return { query: token.slice(1), token };
}

export function writerDocumentHasOutline(content: JSONContent | null | undefined): boolean {
  let found = false;
  const visit = (node: JSONContent | undefined) => {
    if (!node || found) return;
    if (node.type === "chapter" || node.type === "chapterTitle" || node.type === "heading" || node.type === "sceneHeading") found = true;
    for (const child of node.content ?? []) visit(child);
  };
  visit(content ?? undefined);
  return found;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
