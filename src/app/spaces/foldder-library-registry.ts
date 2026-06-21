import type { Node } from "@xyflow/react";
import { collectFoldderLibrarySections } from "./foldder-library";
import type { GuionistaGeneratedTextAssetsMetadata, GuionistaTextAsset } from "./guionista-types";
import {
  createProjectExportFile,
  getProjectFilesFromMetadata,
  type ProjectFile,
  type ProjectFilesMetadata,
} from "./project-files";
import {
  collectProjectMedia,
  projectMediaDedupeKey,
  type ProjectMediaItem,
} from "./project-media-inventory";

export type LibraryAssetBucket = "imported" | "generated" | "exported";
export type LibraryAssetLifecycle = "active" | "orphaned" | "exported";
export type LibraryAssetKind = "image" | "video" | "audio" | "file" | "text" | "unknown";

export type LibraryAsset = {
  id: string;
  dedupeKey: string;
  bucket: LibraryAssetBucket;
  lifecycle: LibraryAssetLifecycle;
  displayName: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  kind: LibraryAssetKind;
  sourceNodeId?: string;
  sourceNodeType?: string;
  sourceLabel?: string;
  exportFileId?: string;
  guionistaAssetId?: string;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FoldderLibraryRegistryMetadata = {
  version: 1;
  items: LibraryAsset[];
};

export type FoldderLibraryBucketView = {
  active: LibraryAsset[];
  orphaned: LibraryAsset[];
};

export type FoldderLibraryView = {
  imported: FoldderLibraryBucketView;
  generated: FoldderLibraryBucketView & { texts: GuionistaTextAsset[] };
  exported: LibraryAsset[];
};

const MAX_ITEMS = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mediaKindToLibraryKind(kind: ProjectMediaItem["kind"]): LibraryAssetKind {
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  return "unknown";
}

function guessKindFromProjectFile(file: ProjectFile): LibraryAssetKind {
  if (file.mimeType?.startsWith("image/")) return "image";
  if (file.mimeType?.startsWith("video/")) return "video";
  if (file.mimeType?.startsWith("audio/")) return "audio";
  const ref = `${file.extension ?? ""} ${file.name}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg)/.test(ref)) return "image";
  if (/\.(mp4|webm|mov|m4v)/.test(ref)) return "video";
  if (/\.(mp3|wav|aac|ogg)/.test(ref)) return "audio";
  return "file";
}

export function stableLibraryAssetId(bucket: LibraryAssetBucket, dedupeKey: string): string {
  const safe = dedupeKey.replace(/[^a-zA-Z0-9:_-]+/g, "_").slice(0, 96);
  return `lib_${bucket}_${safe}`;
}

export function getFoldderLibraryFromMetadata(metadataRaw: unknown): FoldderLibraryRegistryMetadata {
  const root = isRecord(metadataRaw) ? metadataRaw : {};
  const raw = isRecord(root.foldderLibrary) ? root.foldderLibrary : undefined;
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const parsed: LibraryAsset[] = [];
  for (const entry of items) {
    if (!isRecord(entry)) continue;
    const dedupeKey = typeof entry.dedupeKey === "string" ? entry.dedupeKey : "";
    const bucket = entry.bucket;
    if (bucket !== "imported" && bucket !== "generated" && bucket !== "exported") continue;
    if (!dedupeKey) continue;
    const lifecycle = entry.lifecycle;
    parsed.push({
      id: typeof entry.id === "string" ? entry.id : stableLibraryAssetId(bucket, dedupeKey),
      dedupeKey,
      bucket,
      lifecycle:
        lifecycle === "active" || lifecycle === "orphaned" || lifecycle === "exported"
          ? lifecycle
          : bucket === "exported"
            ? "exported"
            : "active",
      displayName: typeof entry.displayName === "string" ? entry.displayName : "Sin nombre",
      url: typeof entry.url === "string" ? entry.url : undefined,
      thumbnailUrl: typeof entry.thumbnailUrl === "string" ? entry.thumbnailUrl : undefined,
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
      kind:
        entry.kind === "image" ||
        entry.kind === "video" ||
        entry.kind === "audio" ||
        entry.kind === "file" ||
        entry.kind === "text" ||
        entry.kind === "unknown"
          ? entry.kind
          : "unknown",
      sourceNodeId: typeof entry.sourceNodeId === "string" ? entry.sourceNodeId : undefined,
      sourceNodeType: typeof entry.sourceNodeType === "string" ? entry.sourceNodeType : undefined,
      sourceLabel: typeof entry.sourceLabel === "string" ? entry.sourceLabel : undefined,
      exportFileId: typeof entry.exportFileId === "string" ? entry.exportFileId : undefined,
      guionistaAssetId: typeof entry.guionistaAssetId === "string" ? entry.guionistaAssetId : undefined,
      hidden: entry.hidden === true,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : nowIso(),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : nowIso(),
    });
  }
  return { version: 1, items: parsed.slice(0, MAX_ITEMS) };
}

export function setFoldderLibraryInMetadata(
  metadataRaw: unknown,
  registry: FoldderLibraryRegistryMetadata,
): Record<string, unknown> {
  const root = isRecord(metadataRaw) ? { ...metadataRaw } : {};
  return {
    ...root,
    foldderLibrary: {
      version: 1,
      items: registry.items.slice(0, MAX_ITEMS),
    },
  };
}

function defaultDisplayName(sourceLabel: string, url: string): string {
  const base = sourceLabel.trim() || "Media";
  const tail = url.replace(/^https?:\/\//, "").split(/[/?#]/)[0]?.split(".").pop();
  return tail && tail.length <= 5 ? `${base}.${tail}` : base;
}

function upsertMediaAsset(
  map: Map<string, LibraryAsset>,
  item: ProjectMediaItem,
  bucket: LibraryAssetBucket,
  liveNodeIds: Set<string>,
  nodeTypeById: Map<string, string>,
  previousById: Map<string, LibraryAsset>,
) {
  const dedupeKey = projectMediaDedupeKey(item.url);
  if (!dedupeKey) return;
  const id = stableLibraryAssetId(bucket, dedupeKey);
  const prev = previousById.get(id);
  const nodeAlive = liveNodeIds.has(item.nodeId);
  const lifecycle = nodeAlive ? "active" : prev?.lifecycle === "orphaned" ? "orphaned" : "active";
  const next: LibraryAsset = {
    id,
    dedupeKey,
    bucket,
    lifecycle,
    displayName: prev?.displayName ?? defaultDisplayName(item.sourceLabel, item.url),
    url: item.url,
    thumbnailUrl: prev?.thumbnailUrl ?? (item.kind === "image" ? item.url : undefined),
    kind: mediaKindToLibraryKind(item.kind),
    sourceNodeId: item.nodeId,
    sourceNodeType: nodeTypeById.get(item.nodeId),
    sourceLabel: item.sourceLabel,
    hidden: prev?.hidden,
    createdAt: prev?.createdAt ?? nowIso(),
    updatedAt: prev?.updatedAt ?? nowIso(),
  };
  const changed =
    !prev ||
    prev.lifecycle !== next.lifecycle ||
    prev.url !== next.url ||
    prev.sourceNodeId !== next.sourceNodeId ||
    prev.sourceLabel !== next.sourceLabel;
  map.set(id, changed ? { ...next, updatedAt: nowIso() } : next);
}

function upsertExportAsset(
  map: Map<string, LibraryAsset>,
  file: ProjectFile,
  previousById: Map<string, LibraryAsset>,
) {
  const url = file.fileUrl ?? file.thumbnailUrl;
  const dedupeKey = url ? projectMediaDedupeKey(url) : `export:${file.id}`;
  const id = stableLibraryAssetId("exported", dedupeKey);
  const prev = previousById.get(id) ?? previousById.get(`lib_exported_export:${file.id}`);
  map.set(id, {
    id: prev?.id ?? id,
    dedupeKey,
    bucket: "exported",
    lifecycle: "exported",
    displayName: file.name,
    url: file.fileUrl,
    thumbnailUrl: file.thumbnailUrl ?? (guessKindFromProjectFile(file) === "image" ? file.fileUrl : undefined),
    mimeType: file.mimeType,
    kind: guessKindFromProjectFile(file),
    sourceNodeId: file.sourceNodeId,
    sourceNodeType: file.nodeType,
    sourceLabel:
      typeof file.metadata?.exportedFrom === "string" ? String(file.metadata.exportedFrom) : "export",
    exportFileId: file.id,
    hidden: file.metadata?.hidden === true,
    createdAt: file.createdAt || prev?.createdAt || nowIso(),
    updatedAt: file.updatedAt || nowIso(),
  });
}

export function reconcileFoldderLibraryRegistry(args: {
  nodes: Node[];
  assetsMetadata: unknown;
  projectScopeId: string;
  projectFiles?: ProjectFilesMetadata;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
  registry: FoldderLibraryRegistryMetadata;
}): FoldderLibraryRegistryMetadata {
  const sections = collectFoldderLibrarySections({
    nodes: args.nodes,
    assetsMetadata: args.assetsMetadata,
    projectScopeId: args.projectScopeId,
    projectFiles: args.projectFiles,
    generatedTextAssets: args.generatedTextAssets,
  });

  const liveNodeIds = new Set(args.nodes.map((n) => n.id));
  const nodeTypeById = new Map(args.nodes.map((n) => [n.id, n.type ?? ""]));
  const previousById = new Map(args.registry.items.map((item) => [item.id, item]));
  const nextMap = new Map<string, LibraryAsset>();

  for (const item of sections.importedMedia) {
    upsertMediaAsset(nextMap, item, "imported", liveNodeIds, nodeTypeById, previousById);
  }
  for (const item of sections.generatedMedia) {
    upsertMediaAsset(nextMap, item, "generated", liveNodeIds, nodeTypeById, previousById);
  }

  const projectFiles = args.projectFiles ?? getProjectFilesFromMetadata({});
  for (const file of projectFiles.items.filter((f) => f.kind === "export" && f.metadata?.hidden !== true)) {
    upsertExportAsset(nextMap, file, previousById);
  }

  for (const item of args.registry.items) {
    if (nextMap.has(item.id)) continue;
    if (item.bucket === "exported") continue;
    if (item.hidden) {
      nextMap.set(item.id, item);
      continue;
    }
    if (item.sourceNodeId && !liveNodeIds.has(item.sourceNodeId) && item.lifecycle !== "exported") {
      if (item.lifecycle !== "orphaned") {
        nextMap.set(item.id, { ...item, lifecycle: "orphaned", updatedAt: nowIso() });
      } else {
        nextMap.set(item.id, item);
      }
    } else if (!item.sourceNodeId && item.url) {
      nextMap.set(item.id, item);
    }
  }

  const items = Array.from(nextMap.values())
    .filter((item) => item.hidden !== true)
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, MAX_ITEMS);

  return { version: 1, items };
}

export function orphanLibraryAssetsForRemovedNodes(
  registry: FoldderLibraryRegistryMetadata,
  removedNodeIds: string[],
): FoldderLibraryRegistryMetadata {
  if (removedNodeIds.length === 0) return registry;
  const removed = new Set(removedNodeIds);
  const ts = nowIso();
  return {
    version: 1,
    items: registry.items.map((item) =>
      item.sourceNodeId && removed.has(item.sourceNodeId) && item.bucket !== "exported"
        ? { ...item, lifecycle: "orphaned", updatedAt: ts }
        : item,
    ),
  };
}

export function renameLibraryAsset(
  registry: FoldderLibraryRegistryMetadata,
  assetId: string,
  displayName: string,
): FoldderLibraryRegistryMetadata {
  const trimmed = displayName.trim();
  if (!trimmed) return registry;
  return {
    version: 1,
    items: registry.items.map((item) =>
      item.id === assetId ? { ...item, displayName: trimmed.slice(0, 120), updatedAt: nowIso() } : item,
    ),
  };
}

export function hideLibraryAsset(
  registry: FoldderLibraryRegistryMetadata,
  assetId: string,
): FoldderLibraryRegistryMetadata {
  return {
    version: 1,
    items: registry.items.map((item) =>
      item.id === assetId ? { ...item, hidden: true, updatedAt: nowIso() } : item,
    ),
  };
}

export function createExportFromLibraryAsset(args: {
  asset: LibraryAsset;
  extension?: string;
}): { exportFile: ReturnType<typeof createProjectExportFile>; registryAsset: LibraryAsset } {
  const asset = args.asset;
  const extRaw = args.extension ?? guessExtension(asset);
  const extension = extRaw.startsWith(".") ? extRaw : `.${extRaw}`;
  const exportFile = createProjectExportFile({
    name: asset.displayName.includes(".") ? asset.displayName : `${asset.displayName}${extension}`,
    extension,
    sourceNodeId: asset.sourceNodeId,
    fileUrl: asset.url,
    thumbnailUrl: asset.thumbnailUrl ?? (asset.kind === "image" ? asset.url : undefined),
    mimeType: asset.mimeType ?? mimeFromKind(asset.kind),
    exportedFrom: asset.sourceLabel ?? "foldder-library",
    exportFormat: extension.replace(/^\./, ""),
  });
  const dedupeKey = exportFile.fileUrl
    ? projectMediaDedupeKey(exportFile.fileUrl)
    : `export:${exportFile.id}`;
  const registryAsset: LibraryAsset = {
    id: stableLibraryAssetId("exported", dedupeKey),
    dedupeKey,
    bucket: "exported",
    lifecycle: "exported",
    displayName: exportFile.name,
    url: exportFile.fileUrl,
    thumbnailUrl: exportFile.thumbnailUrl,
    mimeType: exportFile.mimeType,
    kind: asset.kind === "text" ? "file" : asset.kind,
    sourceNodeId: asset.sourceNodeId,
    sourceNodeType: asset.sourceNodeType,
    sourceLabel: asset.sourceLabel,
    exportFileId: exportFile.id,
    createdAt: exportFile.createdAt,
    updatedAt: exportFile.updatedAt,
  };
  return { exportFile, registryAsset };
}

function guessExtension(asset: LibraryAsset): string {
  const fromUrl = asset.url?.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i)?.[1];
  if (fromUrl) return `.${fromUrl.toLowerCase()}`;
  switch (asset.kind) {
    case "video":
      return ".mp4";
    case "audio":
      return ".mp3";
    case "image":
      return ".png";
    default:
      return ".bin";
  }
}

function mimeFromKind(kind: LibraryAssetKind): string | undefined {
  switch (kind) {
    case "image":
      return "image/png";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/mpeg";
    default:
      return undefined;
  }
}

function splitBucket(items: LibraryAsset[], bucket: LibraryAssetBucket): FoldderLibraryBucketView {
  const scoped = items.filter((item) => item.bucket === bucket && item.hidden !== true);
  const activeKeys = new Set(
    scoped.filter((item) => item.lifecycle === "active").map((item) => item.dedupeKey),
  );
  const active = scoped.filter((item) => item.lifecycle === "active");
  const orphaned = scoped.filter(
    (item) => item.lifecycle === "orphaned" && !activeKeys.has(item.dedupeKey),
  );
  return { active, orphaned };
}

export function buildFoldderLibraryView(args: {
  registry: FoldderLibraryRegistryMetadata;
  generatedTextAssets?: GuionistaGeneratedTextAssetsMetadata;
  liveNodeIds: Set<string>;
}): FoldderLibraryView {
  const items = args.registry.items.filter((item) => item.hidden !== true);
  const exported = items.filter((item) => item.bucket === "exported");
  const texts = (args.generatedTextAssets?.items ?? []).filter((t) => t);
  return {
    imported: splitBucket(items, "imported"),
    generated: {
      ...splitBucket(items, "generated"),
      texts,
    },
    exported,
  };
}

/** Scan live graph media for immediate orphan detection when nodes array changes. */
export function scanLiveMediaKeys(nodes: Node[]): Set<string> {
  const { imported, generated } = collectProjectMedia(nodes);
  const keys = new Set<string>();
  for (const item of [...imported, ...generated]) {
    const key = projectMediaDedupeKey(item.url);
    if (key) keys.add(key);
  }
  return keys;
}
