import type { Node } from "@xyflow/react";

export type ProjectFileKind =
  | "designer"
  | "photoroom"
  | "presenter"
  | "brain"
  | "assets"
  | "image"
  | "video"
  | "vfx"
  | "painter"
  | "document"
  | "export"
  | "unknown";

export type ProjectFile = {
  id: string;
  name: string;
  category?: "mediaFiles" | "exports";
  kind: ProjectFileKind;
  extension?: string;
  nodeType?: string;
  backingNodeId?: string;
  sourceFileId?: string;
  sourceNodeId?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type ProjectFilesMetadata = {
  version: 1;
  items: ProjectFile[];
};

type StudioNodeFileDescriptor = {
  kind: ProjectFileKind;
  extension: string;
  baseName: string;
};

const NODE_TYPE_TO_FILE: Record<string, StudioNodeFileDescriptor> = {
  designer: { kind: "designer", extension: ".design", baseName: "Designer" },
  photoRoom: { kind: "photoroom", extension: ".photoroom", baseName: "PhotoRoom" },
  geminiVideo: { kind: "video", extension: ".video", baseName: "Video" },
  nanoBanana: { kind: "image", extension: ".image", baseName: "Imagen IA" },
  vfxGenerator: { kind: "vfx", extension: ".vfx", baseName: "VFX" },
  painter: { kind: "painter", extension: ".painter", baseName: "Freehand" },
  presenter: { kind: "presenter", extension: ".presenter", baseName: "Presentar" },
};

const VALID_KINDS = new Set<ProjectFileKind>([
  "designer",
  "photoroom",
  "presenter",
  "brain",
  "assets",
  "image",
  "video",
  "vfx",
  "painter",
  "document",
  "export",
  "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
}

function withExtension(name: string, extension?: string): string {
  if (!extension) return name;
  return name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension}`;
}

function cleanMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  return { ...raw };
}

export function getFileExtensionForNodeType(nodeType?: string): string | undefined {
  return nodeType ? NODE_TYPE_TO_FILE[nodeType]?.extension : undefined;
}

export function getProjectFileKindForNodeType(nodeType?: string): ProjectFileKind {
  return nodeType ? NODE_TYPE_TO_FILE[nodeType]?.kind ?? "unknown" : "unknown";
}

export function getStudioAppForFileKind(kind: ProjectFileKind): string | undefined {
  switch (kind) {
    case "designer":
      return "designer";
    case "photoroom":
      return "photoRoom";
    case "presenter":
      return "presenter";
    case "image":
      return "nanoBanana";
    case "video":
      return "geminiVideo";
    case "vfx":
      return "vfxGenerator";
    case "painter":
      return "painter";
    case "brain":
      return "brain";
    case "assets":
      return "files";
    default:
      return undefined;
  }
}

export function getProjectFilesFromMetadata(metadataRaw: unknown): ProjectFilesMetadata {
  const root = isRecord(metadataRaw) ? metadataRaw : {};
  const projectFiles = isRecord(root.projectFiles) ? root.projectFiles : undefined;
  const legacyStandard = isRecord(root.standardWorkspace) ? root.standardWorkspace : undefined;
  const rawItems = Array.isArray(projectFiles?.items)
    ? projectFiles.items
    : Array.isArray(legacyStandard?.files)
      ? legacyStandard.files
      : [];
  const seen = new Set<string>();
  const items: ProjectFile[] = [];

  for (const raw of rawItems) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
    if (!id || seen.has(id)) continue;
    const kindRaw = typeof raw.kind === "string" ? raw.kind : "unknown";
    const kind = VALID_KINDS.has(kindRaw as ProjectFileKind)
      ? (kindRaw as ProjectFileKind)
      : legacyKindToProjectFileKind(kindRaw);
    const nodeType = typeof raw.nodeType === "string" ? raw.nodeType : undefined;
    const extension =
      typeof raw.extension === "string"
        ? raw.extension
        : getFileExtensionForNodeType(nodeType) ?? defaultExtensionForKind(kind);
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
    seen.add(id);
    items.push({
      id,
      name: normalizeName(raw.name, "Untitled"),
      category:
        raw.category === "mediaFiles" || raw.category === "exports"
          ? raw.category
          : kind === "export"
            ? "exports"
            : "mediaFiles",
      kind,
      extension,
      nodeType,
      backingNodeId:
        typeof raw.backingNodeId === "string"
          ? raw.backingNodeId
          : typeof raw.nodeId === "string"
            ? raw.nodeId
            : undefined,
      sourceFileId: typeof raw.sourceFileId === "string" ? raw.sourceFileId : undefined,
      sourceNodeId: typeof raw.sourceNodeId === "string" ? raw.sourceNodeId : undefined,
      fileUrl: typeof raw.fileUrl === "string" ? raw.fileUrl : undefined,
      thumbnailUrl:
        typeof raw.thumbnailUrl === "string"
          ? raw.thumbnailUrl
          : typeof raw.value === "string"
            ? raw.value
            : undefined,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType : undefined,
      createdAt,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
      metadata: cleanMetadata(raw.metadata),
    });
  }

  return { version: 1, items };
}

export function setProjectFilesInMetadata(metadataRaw: unknown, projectFiles: ProjectFilesMetadata): Record<string, unknown> {
  const root = isRecord(metadataRaw) ? { ...metadataRaw } : {};
  delete root.standardWorkspace;
  return {
    ...root,
    projectFiles: {
      version: 1,
      items: projectFiles.items.slice(0, 300),
    },
  };
}

export function createProjectFileForStudioNode(args: {
  node: Pick<Node, "id" | "type" | "data">;
  name?: string;
  sourceFileId?: string;
  sourceNodeId?: string;
}): ProjectFile | null {
  if (!args.node.type) return null;
  const descriptor = NODE_TYPE_TO_FILE[args.node.type];
  if (!descriptor) return null;
  const ts = nowIso();
  const data = isRecord(args.node.data) ? args.node.data : {};
  const fallback = normalizeName(data.label, descriptor.baseName);
  const name = withExtension(normalizeName(args.name, fallback), descriptor.extension);
  return {
    id: `pf_${args.node.type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name,
    kind: descriptor.kind,
    extension: descriptor.extension,
    nodeType: args.node.type,
    backingNodeId: args.node.id,
    sourceFileId: args.sourceFileId,
    sourceNodeId: args.sourceNodeId,
    thumbnailUrl: typeof data.value === "string" ? data.value : undefined,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function createProjectExportFile(args: {
  name: string;
  extension: string;
  sourceFileId?: string;
  sourceNodeId?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  exportedFrom?: string;
  exportFormat?: string;
  metadata?: Record<string, unknown>;
}): ProjectFile {
  const ts = nowIso();
  const extension = args.extension.startsWith(".") ? args.extension : `.${args.extension}`;
  return {
    id: `file_export_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: withExtension(normalizeName(args.name, `Export ${Date.now()}`), extension),
    category: "exports",
    kind: "export",
    extension,
    sourceFileId: args.sourceFileId,
    sourceNodeId: args.sourceNodeId,
    fileUrl: args.fileUrl,
    thumbnailUrl: args.thumbnailUrl,
    mimeType: args.mimeType,
    createdAt: ts,
    updatedAt: ts,
    metadata: {
      ...(args.metadata ?? {}),
      ...(args.exportedFrom ? { exportedFrom: args.exportedFrom } : {}),
      ...(args.exportFormat ? { exportFormat: args.exportFormat } : {}),
    },
  };
}

export function reconcileProjectFilesFromNodes(metadataRaw: unknown, nodes: Node[]): ProjectFilesMetadata {
  const current = getProjectFilesFromMetadata(metadataRaw);
  const usedNodeIds = new Set(current.items.map((item) => item.backingNodeId).filter(Boolean));
  const hiddenNodeIds = new Set(
    current.items
      .filter((item) => item.metadata?.hidden === true && item.backingNodeId)
      .map((item) => item.backingNodeId as string),
  );
  const counters = new Map<string, number>();
  const next = [...current.items];

  for (const node of nodes) {
    if (!node.id || !node.type) continue;
    if (usedNodeIds.has(node.id) || hiddenNodeIds.has(node.id)) continue;
    const descriptor = NODE_TYPE_TO_FILE[node.type];
    if (!descriptor) continue;
    const index = (counters.get(node.type) ?? 0) + 1;
    counters.set(node.type, index);
    const derived = createProjectFileForStudioNode({
      node,
      name: `${descriptor.baseName} ${index}`,
    });
    if (derived) next.push({ ...derived, id: `node:${node.id}` });
  }

  return {
    version: 1,
    items: next.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)),
  };
}

export function upsertProjectFile(metadataRaw: unknown, file: ProjectFile): ProjectFilesMetadata {
  const current = getProjectFilesFromMetadata(metadataRaw);
  const items = current.items.filter(
    (item) => item.id !== file.id && (!file.backingNodeId || item.backingNodeId !== file.backingNodeId),
  );
  return { version: 1, items: [file, ...items].slice(0, 300) };
}

export function updateProjectFileInMetadata(
  metadataRaw: unknown,
  fileId: string,
  updater: (file: ProjectFile) => ProjectFile,
): ProjectFilesMetadata {
  const current = getProjectFilesFromMetadata(metadataRaw);
  return {
    version: 1,
    items: current.items.map((item) => (item.id === fileId ? updater(item) : item)),
  };
}

function defaultExtensionForKind(kind: ProjectFileKind): string | undefined {
  switch (kind) {
    case "designer":
      return ".design";
    case "photoroom":
      return ".photoroom";
    case "presenter":
      return ".presenter";
    case "image":
      return ".image";
    case "video":
      return ".video";
    case "vfx":
      return ".vfx";
    case "painter":
      return ".painter";
    case "document":
      return ".document";
    case "export":
      return ".export";
    default:
      return undefined;
  }
}

function legacyKindToProjectFileKind(kind: string): ProjectFileKind {
  switch (kind) {
    case "design":
      return "designer";
    case "photo":
      return "photoroom";
    case "present":
      return "presenter";
    case "paint":
      return "painter";
    case "foldder":
      return "assets";
    default:
      return VALID_KINDS.has(kind as ProjectFileKind) ? (kind as ProjectFileKind) : "unknown";
  }
}
