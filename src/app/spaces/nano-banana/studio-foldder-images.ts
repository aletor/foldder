import type { Node } from "@xyflow/react";
import { collectFoldderLibrarySections } from "../foldder-library";
import type { GuionistaGeneratedTextAssetsMetadata } from "../guionista-types";
import type { ProjectFilesMetadata } from "../project-files";
import { projectMediaDedupeKey, type ProjectMediaItem } from "../project-media-inventory";

export const STUDIO_SCENE_DEST = "__scene__";

export type StudioIncomingPlan = {
  sessionImage?: string;
  extraCard?: { references: string[] };
  cardUpdate?: { cardId: string; add: string[] };
  newCard?: { references: string[] };
};

function looksLikeImageFile(name: string, mime: string, kind: string): boolean {
  if (mime.toLowerCase().startsWith("image/")) return true;
  if (kind === "image") return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(name);
}

export function mergeStudioCardReferences(existing: string[], incoming: string[], maxRefs: number): string[] {
  const out = [...existing];
  for (const raw of incoming) {
    const url = raw.trim();
    if (!url || out.includes(url)) continue;
    if (out.length >= maxRefs) break;
    out.push(url);
  }
  return out;
}

export function planStudioIncomingUrls(args: {
  urls: string[];
  dest: string | null;
  hasScene: boolean;
  maxRefs: number;
}): StudioIncomingPlan {
  const clean = args.urls.map((url) => url.trim()).filter(Boolean);
  if (clean.length === 0) return {};
  const asScene = args.dest === STUDIO_SCENE_DEST || (!args.dest && !args.hasScene);
  if (asScene && !args.hasScene) {
    return {
      sessionImage: clean[0],
      extraCard: clean.length > 1 ? { references: clean.slice(1, 1 + args.maxRefs) } : undefined,
    };
  }
  if (args.dest && args.dest !== STUDIO_SCENE_DEST) {
    return { cardUpdate: { cardId: args.dest, add: clean } };
  }
  return { newCard: { references: clean.slice(0, args.maxRefs) } };
}

export function listStudioFoldderImages(args: {
  nodes?: Node[];
  assetsMetadata?: unknown;
  projectScopeId?: string;
  projectFiles?: ProjectFilesMetadata;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
}): ProjectMediaItem[] {
  const sections = collectFoldderLibrarySections({
    nodes: args.nodes ?? [],
    assetsMetadata: args.assetsMetadata,
    projectScopeId: args.projectScopeId || "__local__",
    projectFiles: args.projectFiles,
    generatedTextAssets: args.generatedTextAssets,
  });
  const out: ProjectMediaItem[] = [];
  const seen = new Set<string>();
  const push = (item: ProjectMediaItem) => {
    const key = projectMediaDedupeKey(item.url.trim());
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  for (const item of [...sections.importedMedia, ...sections.generatedMedia]) {
    if (item.kind === "video" || item.kind === "audio") continue;
    if (item.kind !== "image" && item.kind !== "unknown") continue;
    push(item);
  }

  for (const file of [...sections.mediaFiles, ...sections.exports]) {
    const url = (file.fileUrl || file.thumbnailUrl || "").trim();
    if (!url) continue;
    if (!looksLikeImageFile(file.name || file.extension || "", file.mimeType || "", file.kind)) continue;
    push({
      id: `file-${file.id}`,
      url,
      kind: "image",
      sourceLabel: file.name || "Archivo del proyecto",
      nodeId: file.backingNodeId || "project-files",
    });
  }

  return out;
}
