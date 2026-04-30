import type { Node } from "@xyflow/react";
import { listAllBrainGeneratedSuggestionUrls } from "./brain-image-suggestions-cache";
import { normalizeProjectAssets } from "./project-assets-metadata";
import {
  collectProjectMedia,
  projectMediaDedupeKey,
  type ProjectMediaItem,
} from "./project-media-inventory";
import { getProjectFilesFromMetadata, type ProjectFile, type ProjectFilesMetadata } from "./project-files";
import { getGuionistaTextAssetsFromMetadata, type GuionistaGeneratedTextAssetsMetadata, type GuionistaTextAsset } from "./guionista-types";

export type FoldderLibrarySections = {
  importedMedia: ProjectMediaItem[];
  generatedMedia: ProjectMediaItem[];
  generatedTexts: GuionistaTextAsset[];
  mediaFiles: ProjectFile[];
  exports: ProjectFile[];
};

function pushUniqueMedia(
  items: ProjectMediaItem[],
  seen: Set<string>,
  item: ProjectMediaItem,
) {
  const key = projectMediaDedupeKey(item.url.trim());
  if (!key || seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

function collectImportedAssetsFromMetadata(assetsMetadata: unknown): ProjectMediaItem[] {
  const assets = normalizeProjectAssets(assetsMetadata);
  const items: ProjectMediaItem[] = [];
  const seen = new Set<string>();

  for (const doc of assets.knowledge.documents) {
    const url = doc.dataUrl || doc.originalSourceUrl;
    if (!url) continue;
    pushUniqueMedia(items, seen, {
      id: `brain-doc-${doc.id}`,
      url,
      kind: doc.mime.toLowerCase().startsWith("image/")
        ? "image"
        : doc.mime.toLowerCase().startsWith("video/")
          ? "video"
          : doc.mime.toLowerCase().startsWith("audio/")
            ? "audio"
            : "unknown",
      sourceLabel: doc.name || "Documento importado",
      nodeId: "metadata.assets",
    });
  }

  for (const url of assets.knowledge.urls) {
    pushUniqueMedia(items, seen, {
      id: `brain-url-${items.length}-${url.slice(0, 32)}`,
      url,
      kind: "unknown",
      sourceLabel: "Brain · URL importada",
      nodeId: "metadata.assets",
    });
  }

  for (const [key, url] of [
    ["logo-positive", assets.brand.logoPositive],
    ["logo-negative", assets.brand.logoNegative],
  ] as const) {
    if (!url) continue;
    pushUniqueMedia(items, seen, {
      id: `brand-${key}`,
      url,
      kind: "image",
      sourceLabel: key === "logo-positive" ? "Marca · logo positivo" : "Marca · logo negativo",
      nodeId: "metadata.assets",
    });
  }

  return items;
}

function collectGeneratedAssetsFromMetadata(assetsMetadata: unknown, projectScopeId: string): ProjectMediaItem[] {
  const assets = normalizeProjectAssets(assetsMetadata);
  const items: ProjectMediaItem[] = [];
  const seen = new Set<string>();

  for (const url of listAllBrainGeneratedSuggestionUrls(projectScopeId)) {
    const key = url.trim();
    if (!key) continue;
    pushUniqueMedia(items, seen, {
      id: `brain-generated-${items.length}-${key.slice(0, 32)}`,
      url: key,
      kind: "image",
      sourceLabel: "Brain · sugerencia IA",
      nodeId: "brain-cache",
    });
  }

  for (const slot of assets.strategy.visualDnaSlots ?? []) {
    const key = slot.mosaic?.imageUrl?.trim();
    if (!key) continue;
    pushUniqueMedia(items, seen, {
      id: `brain-visual-dna-slot-${slot.id}`,
      url: key,
      kind: "image",
      sourceLabel: `Brain · ADN por imagen (${slot.label || "slot"})`,
      nodeId: "brain-visual-dna-slot",
    });
  }

  return items;
}

export function collectFoldderLibrarySections(args: {
  nodes: Node[];
  assetsMetadata: unknown;
  projectScopeId: string;
  projectFiles?: ProjectFilesMetadata;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
}): FoldderLibrarySections {
  const graphMedia = collectProjectMedia(args.nodes);
  const importedSeen = new Set(graphMedia.imported.map((item) => projectMediaDedupeKey(item.url)));
  const generatedSeen = new Set(graphMedia.generated.map((item) => projectMediaDedupeKey(item.url)));
  const importedMedia = [...graphMedia.imported];
  const generatedMedia = [...graphMedia.generated];

  for (const item of collectImportedAssetsFromMetadata(args.assetsMetadata)) {
    pushUniqueMedia(importedMedia, importedSeen, item);
  }
  for (const item of collectGeneratedAssetsFromMetadata(args.assetsMetadata, args.projectScopeId)) {
    pushUniqueMedia(generatedMedia, generatedSeen, item);
  }

  const visibleProjectFiles = (args.projectFiles ?? getProjectFilesFromMetadata({})).items.filter(
    (file) => file.metadata?.hidden !== true,
  );
  const exports = visibleProjectFiles.filter((file) => file.kind === "export");
  const mediaFiles = visibleProjectFiles.filter((file) => file.kind !== "export");
  const generatedTexts = (args.generatedTextAssets ?? getGuionistaTextAssetsFromMetadata({})).items;

  const generatedKeys = new Set(generatedMedia.map((item) => projectMediaDedupeKey(item.url)));
  return {
    importedMedia: importedMedia.filter((item) => !generatedKeys.has(projectMediaDedupeKey(item.url))),
    generatedMedia,
    generatedTexts,
    mediaFiles,
    exports,
  };
}
