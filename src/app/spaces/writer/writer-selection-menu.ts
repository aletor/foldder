import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { inferWriterMemoryScope, writerEntitiesInDocument, writerEntityId, type WriterMemoryScope } from "./writer-entities";

export type WriterRewriteVariant = "improve" | "expand" | "shorten" | "natural" | "brief" | "visual";

export type WriterSelectionLength = "short" | "normal" | "long";

export type WriterSelectionOffer = {
  context: boolean;
  rewrite: boolean;
  length: WriterSelectionLength;
  secondary: "expand" | "shorten" | null;
  rememberLabel: string;
  entityLabel: string | null;
  prompt: string;
  scope: WriterMemoryScope;
  askScope: boolean;
};

export function writerSelectionOffer(doc: ProseMirrorNode, from: number, to: number): WriterSelectionOffer {
  const text = from === to ? "" : doc.textBetween(from, to, " ").replace(/\s+/g, " ").trim();
  const inferred = inferWriterMemoryScope(doc, Math.max(from, 1), Math.max(to, from));
  const block = doc.resolve(Math.max(1, Math.min(from, doc.content.size))).parent.type.name;
  const words = text ? text.split(/\s+/u).filter(Boolean) : [];
  const dialogue = block === "dialogue" || block === "parenthetical";
  const selectionIsEntity = inferred.scope.type === "entity" && words.length === 1 && writerEntityId(text) === inferred.scope.entityId;
  const inEntity = inferred.scope.type === "entity" && (dialogue || block === "character" || selectionIsEntity);
  const entityLabel = selectionIsEntity || (block === "character" && inferred.scope.type === "entity") ? inferred.label : null;
  const entitiesHere = text
    ? writerEntitiesInDocument(doc).filter((entity) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(entity.label)}(?![\\p{L}])`, "iu").test(text))
    : [];
  const askScope = !inEntity && entitiesHere.length > 1;
  const scope = inEntity ? inferred.scope : { type: "global" as const };
  const length: WriterSelectionLength = words.length <= 1 ? "short" : words.length >= 8 ? "long" : "normal";
  return {
    context: text.length > 0,
    rewrite: text.length > 0,
    length,
    secondary: length === "long" ? "shorten" : length === "normal" ? "expand" : null,
    rememberLabel: entityLabel ? `Añadir sobre ${entityLabel}` : "Recordar",
    entityLabel,
    prompt: entityLabel ? `¿Qué quieres recordar sobre ${entityLabel}?` : "¿Qué quieres recordar?",
    scope,
    askScope,
  };
}

export function writerRewriteRequest(variant: WriterRewriteVariant): { action: "rewrite" | "expand" | "shorten"; intent?: "natural" | "visual" | "brief" } {
  if (variant === "expand") return { action: "expand" };
  if (variant === "shorten") return { action: "shorten" };
  if (variant === "brief") return { action: "shorten", intent: "brief" };
  if (variant === "natural") return { action: "rewrite", intent: "natural" };
  if (variant === "visual") return { action: "rewrite", intent: "visual" };
  return { action: "rewrite" };
}

export function writerRewriteLabel(variant: WriterRewriteVariant): string {
  if (variant === "improve") return "Mejorar";
  if (variant === "expand") return "Expandir";
  if (variant === "shorten") return "Acortar";
  if (variant === "natural") return "Más natural";
  if (variant === "brief") return "Más breve";
  return "Más visual";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
