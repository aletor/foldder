import type { Node } from "@xyflow/react";
import {
  collectS3KeysFromNodeData,
  stableKnowledgeFileUrlFromKey,
  tryExtractKnowledgeFilesKeyFromUrl,
} from "@/lib/s3-media-hydrate";

export type ProjectMediaKind = "image" | "video" | "audio" | "unknown";

/**
 * Clave estable para deduplicar la misma pieza en Foldder cuando la misma clave S3
 * aparece con distintas prefirmas (caducidad/firma distinta).
 */
export function projectMediaDedupeKey(url: string): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  const s3Key = tryExtractKnowledgeFilesKeyFromUrl(trimmed);
  if (s3Key) return `s3:${s3Key}`;
  return trimmed;
}

export type ProjectMediaItem = {
  /** Estable por URL + categoría */
  id: string;
  url: string;
  kind: ProjectMediaKind;
  /** Origen legible (tipo de nodo o «Designer» / «Presenter») */
  sourceLabel: string;
  nodeId: string;
};

const GENERATOR_NODE_TYPES = new Set([
  "nanoBanana",
  "geminiVideo",
  "vfxGenerator",
  "grokProcessor",
  "enhancer",
  "backgroundRemover",
  "mediaDescriber",
  "imageCreationAdvanced",
  "painter",
  "cine",
]);

const IMPORT_NODE_TYPES = new Set(["mediaInput", "urlImage", "spaceInput", "inspiration"]);

function isLikelyMediaRef(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^data:(image|video|audio)\//i.test(t)) return true;
  if (t.startsWith("/api/spaces/s3-file")) return true;
  if (t.startsWith("knowledge-files/")) return true;
  return false;
}

/** Normaliza URL http(s), data:, ruta estable S3 o clave knowledge-files cruda. */
export function normalizeMediaRef(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("knowledge-files/")) {
    return stableKnowledgeFileUrlFromKey(trimmed) ?? trimmed;
  }
  if (isLikelyMediaRef(trimmed)) return trimmed;
  return null;
}

function guessKind(url: string, dataType?: string): ProjectMediaKind {
  const u = url.toLowerCase();
  if (u.startsWith("data:image/")) return "image";
  if (u.startsWith("data:video/")) return "video";
  if (u.startsWith("data:audio/")) return "audio";
  if (dataType === "video" || /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(u)) return "video";
  if (dataType === "audio" || /\.(mp3|wav|aac|ogg|m4a)(\?|#|$)/i.test(u)) return "audio";
  if (dataType === "image" || /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(u)) return "image";
  if (dataType === "video") return "video";
  if (dataType === "image") return "image";
  if (dataType === "audio") return "audio";
  return "unknown";
}

function pushUnique(
  list: ProjectMediaItem[],
  seen: Set<string>,
  urlOrKey: string,
  kind: ProjectMediaKind,
  sourceLabel: string,
  nodeId: string,
) {
  const normalized = normalizeMediaRef(urlOrKey);
  if (!normalized) return;
  const dedupe = projectMediaDedupeKey(normalized);
  if (!dedupe || seen.has(dedupe)) return;
  seen.add(dedupe);
  list.push({
    id: `${nodeId}::${seen.size}::${dedupe.slice(0, 48)}`,
    url: normalized,
    kind,
    sourceLabel,
    nodeId,
  });
}

function nodeLooksGenerated(nodeType: string, data: Record<string, unknown>): boolean {
  if (GENERATOR_NODE_TYPES.has(nodeType)) return true;
  if (data.generatedByAi === true) return true;
  return false;
}

function extractFromNodeData(data: Record<string, unknown>, into: string[]) {
  const fields = [data.value, data.lastGenerated, data.s3Key, data.previewUrl, data.outputUrl];
  for (const raw of fields) {
    if (typeof raw === "string") {
      const normalized = normalizeMediaRef(raw);
      if (normalized) into.push(normalized);
    }
  }

  const urls = data.urls;
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (typeof u === "string") {
        const normalized = normalizeMediaRef(u);
        if (normalized) into.push(normalized);
      }
    }
  }

  const gh = data.generationHistory;
  if (Array.isArray(gh)) {
    for (const u of gh) {
      if (typeof u === "string") {
        const normalized = normalizeMediaRef(u);
        if (normalized) into.push(normalized);
      }
    }
  }

  const av = data._assetVersions;
  if (Array.isArray(av)) {
    for (const ent of av) {
      if (!ent || typeof ent !== "object") continue;
      const row = ent as { url?: string; s3Key?: string };
      if (typeof row.url === "string") {
        const normalized = normalizeMediaRef(row.url);
        if (normalized) into.push(normalized);
      }
      if (typeof row.s3Key === "string") {
        const normalized = normalizeMediaRef(row.s3Key);
        if (normalized) into.push(normalized);
      }
    }
  }

  const studioObjects = data.studioObjects;
  if (Array.isArray(studioObjects)) {
    for (const obj of studioObjects) {
      if (!obj || typeof obj !== "object") continue;
      const row = obj as { type?: string; src?: string; cachedResult?: string };
      if (row.type === "image" && typeof row.src === "string") {
        const normalized = normalizeMediaRef(row.src);
        if (normalized) into.push(normalized);
      }
      if (row.type === "booleanGroup" && typeof row.cachedResult === "string") {
        const normalized = normalizeMediaRef(row.cachedResult);
        if (normalized) into.push(normalized);
      }
    }
  }
}

function extractInspirationOutput(data: Record<string, unknown>): string | null {
  const value = typeof data.value === "string" ? normalizeMediaRef(data.value) : null;
  if (value) return value;
  const status = data.status;
  if (status !== "selected" && status !== "output") return null;
  const selected = data.selected;
  if (!selected || typeof selected !== "object") return null;
  const row = selected as { imageUrl?: string };
  return typeof row.imageUrl === "string" ? normalizeMediaRef(row.imageUrl) : null;
}

function collectS3MediaRefs(data: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const key of collectS3KeysFromNodeData(data)) {
    const normalized = normalizeMediaRef(key);
    if (normalized) refs.push(normalized);
  }
  return refs;
}

type DesignerPageMedia = {
  url: string;
  kind: ProjectMediaKind;
  generated: boolean;
  sourceLabel: string;
};

function walkDesignerPagesForMedia(pages: unknown, into: DesignerPageMedia[]) {
  if (!Array.isArray(pages)) return;
  for (const p of pages) {
    const objects = (p as { objects?: unknown }).objects;
    if (!Array.isArray(objects)) continue;
    for (const o of objects) {
      if (!o || typeof o !== "object") continue;
      const ob = o as Record<string, unknown>;
      if (Array.isArray(ob.aiGeneratedMediaRefs)) {
        for (const raw of ob.aiGeneratedMediaRefs) {
          if (typeof raw !== "string") continue;
          const normalized = normalizeMediaRef(raw);
          if (!normalized) continue;
          into.push({
            url: normalized,
            kind: guessKind(normalized, "image"),
            generated: true,
            sourceLabel: "Designer · IA",
          });
        }
      }
      if (ob.type === "image" && typeof ob.src === "string") {
        const normalized = normalizeMediaRef(ob.src);
        if (!normalized) continue;
        const imgMeta = ob.imageAssetMeta as { generatedByAi?: boolean; generatedByAiSource?: string } | undefined;
        into.push({
          url: normalized,
          kind: guessKind(normalized, "image"),
          generated: !!imgMeta?.generatedByAi,
          sourceLabel: imgMeta?.generatedByAi ? (imgMeta.generatedByAiSource || "Designer · IA") : "Designer",
        });
      }
      if (ob.type === "rect") {
        const ifc = ob.imageFrameContent as
          | { src?: string; s3Key?: string; generatedByAi?: boolean; generatedByAiSource?: string }
          | null
          | undefined;
        const rawSrc = typeof ifc?.src === "string" ? ifc.src : typeof ifc?.s3Key === "string" ? ifc.s3Key : "";
        const normalized = normalizeMediaRef(rawSrc);
        if (normalized) {
          into.push({
            url: normalized,
            kind: guessKind(normalized, "image"),
            generated: !!ifc?.generatedByAi,
            sourceLabel: ifc?.generatedByAi ? (ifc.generatedByAiSource || "Designer frame · IA") : "Designer frame",
          });
        }
      }
      if (ob.type === "booleanGroup" && typeof ob.cachedResult === "string") {
        const normalized = normalizeMediaRef(ob.cachedResult);
        if (!normalized) continue;
        into.push({
          url: normalized,
          kind: guessKind(normalized, "image"),
          generated: false,
          sourceLabel: "Designer boolean",
        });
      }
    }
  }
}

function presenterVideoUrls(data: Record<string, unknown>, into: string[]) {
  const pl = data.imageVideoPlacements;
  if (!Array.isArray(pl)) return;
  for (const p of pl) {
    if (!p || typeof p !== "object") continue;
    const u = (p as { videoUrl?: string }).videoUrl;
    if (typeof u === "string") {
      const normalized = normalizeMediaRef(u);
      if (normalized) into.push(normalized);
    }
  }
}

function labelForNodeType(nodeType: string): string {
  switch (nodeType) {
    case "imageCreationAdvanced":
      return "Image Creation";
    case "nanoBanana":
      return "Nano Banana";
    case "cine":
      return "Cine";
    case "inspiration":
      return "Inspiration";
    case "imageExport":
      return "Image Export";
    case "crop":
      return "Crop";
    case "painter":
      return "Painter";
    default:
      return nodeType || "nodo";
  }
}

/**
 * Recorre el grafo del proyecto y agrupa URLs multimedia en importados vs generados.
 * - Generados: salidas de nodos de IA (Nano Banana, Video, VFX, Grok, etc.) y entradas en `_assetVersions` con `source === 'graph-run'`.
 * - Importados: subidas/URL manual (mediaInput, urlImage), contenido en Designer/Presenter, y el resto de orígenes no marcados como generador.
 */
export function collectProjectMedia(nodes: Node[]): {
  imported: ProjectMediaItem[];
  generated: ProjectMediaItem[];
} {
  const imported: ProjectMediaItem[] = [];
  const generated: ProjectMediaItem[] = [];
  const seenI = new Set<string>();
  const seenG = new Set<string>();

  for (const n of nodes) {
    const nodeId = n.id;
    const nodeType = n.type || "";
    const data = (n.data ?? {}) as Record<string, unknown>;
    const dataType = typeof data.type === "string" ? data.type : undefined;
    const sourceLabel = labelForNodeType(nodeType);

    if (nodeType === "designer") {
      const media: DesignerPageMedia[] = [];
      walkDesignerPagesForMedia(data.pages, media);
      for (const ent of media) {
        if (ent.generated) {
          pushUnique(generated, seenG, ent.url, ent.kind, ent.sourceLabel, nodeId);
        } else {
          pushUnique(imported, seenI, ent.url, ent.kind, ent.sourceLabel, nodeId);
        }
      }
      continue;
    }

    if (nodeType === "presenter") {
      const urls: string[] = [];
      presenterVideoUrls(data, urls);
      for (const url of urls) {
        pushUnique(imported, seenI, url, "video", "Presenter", nodeId);
      }
      continue;
    }

    if (nodeType === "inspiration") {
      const output = extractInspirationOutput(data);
      if (output) {
        pushUnique(imported, seenI, output, guessKind(output, dataType), "Inspiration", nodeId);
      }
      continue;
    }

    const urls: string[] = [];
    extractFromNodeData(data, urls);
    for (const ref of collectS3MediaRefs(data)) {
      if (!urls.includes(ref)) urls.push(ref);
    }

    const isGenNode = nodeLooksGenerated(nodeType, data);
    const isImportNode = IMPORT_NODE_TYPES.has(nodeType);

    const av = data._assetVersions;
    const graphRunUrls: string[] = [];
    if (Array.isArray(av)) {
      for (const ent of av) {
        if (!ent || typeof ent !== "object") continue;
        const row = ent as { url?: string; s3Key?: string; source?: string };
        const urlEnt = typeof row.url === "string" ? normalizeMediaRef(row.url) : null;
        const keyEnt = typeof row.s3Key === "string" ? normalizeMediaRef(row.s3Key) : null;
        const resolved = urlEnt ?? keyEnt;
        if (resolved && row.source === "graph-run") graphRunUrls.push(resolved);
      }
    }

    for (const url of urls) {
      const kind = guessKind(url, dataType);
      if (graphRunUrls.includes(url) || isGenNode) {
        pushUnique(generated, seenG, url, kind, sourceLabel, nodeId);
      } else if (isImportNode) {
        pushUnique(imported, seenI, url, kind, sourceLabel, nodeId);
      } else {
        pushUnique(imported, seenI, url, kind, sourceLabel, nodeId);
      }
    }

    for (const url of graphRunUrls) {
      if (!urls.includes(url)) {
        pushUnique(generated, seenG, url, guessKind(url, dataType), `${sourceLabel} · historial`, nodeId);
      }
    }
  }

  const genUrlSet = new Set(generated.map((g) => projectMediaDedupeKey(g.url)));
  const importedDeduped = imported.filter((i) => !genUrlSet.has(projectMediaDedupeKey(i.url)));

  return { imported: importedDeduped, generated };
}
