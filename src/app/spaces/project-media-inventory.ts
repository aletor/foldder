import type { Node } from "@xyflow/react";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

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
]);

const IMPORT_NODE_TYPES = new Set(["mediaInput", "urlImage", "spaceInput"]);

function isLikelyMediaRef(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^data:(image|video|audio)\//i.test(t)) return true;
  return false;
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
  url: string,
  kind: ProjectMediaKind,
  sourceLabel: string,
  nodeId: string,
) {
  if (!isLikelyMediaRef(url)) return;
  const normalized = url.trim();
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

function extractFromNodeData(
  data: Record<string, unknown>,
  into: string[],
) {
  const v = data.value;
  if (typeof v === "string" && isLikelyMediaRef(v)) into.push(v);

  const urls = data.urls;
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (typeof u === "string" && isLikelyMediaRef(u)) into.push(u);
    }
  }

  const gh = data.generationHistory;
  if (Array.isArray(gh)) {
    for (const u of gh) {
      if (typeof u === "string" && isLikelyMediaRef(u)) into.push(u);
    }
  }

  const av = data._assetVersions;
  if (Array.isArray(av)) {
    for (const ent of av) {
      if (!ent || typeof ent !== "object") continue;
      const url = (ent as { url?: string }).url;
      if (typeof url === "string" && isLikelyMediaRef(url)) into.push(url);
    }
  }

  const lastGen = data.lastGenerated;
  if (typeof lastGen === "string" && isLikelyMediaRef(lastGen)) into.push(lastGen);
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
          if (typeof raw !== "string" || !isLikelyMediaRef(raw)) continue;
          into.push({
            url: raw,
            kind: guessKind(raw, "image"),
            generated: true,
            sourceLabel: "Designer · IA",
          });
        }
      }
      if (ob.type === "image" && typeof ob.src === "string") {
        const imgMeta = ob.imageAssetMeta as { generatedByAi?: boolean; generatedByAiSource?: string } | undefined;
        into.push({
          url: ob.src,
          kind: guessKind(ob.src, "image"),
          generated: !!imgMeta?.generatedByAi,
          sourceLabel: imgMeta?.generatedByAi ? (imgMeta.generatedByAiSource || "Designer · IA") : "Designer",
        });
      }
      if (ob.type === "rect") {
        const ifc = ob.imageFrameContent as
          | { src?: string; generatedByAi?: boolean; generatedByAiSource?: string }
          | null
          | undefined;
        if (ifc?.src && typeof ifc.src === "string") {
          into.push({
            url: ifc.src,
            kind: guessKind(ifc.src, "image"),
            generated: !!ifc.generatedByAi,
            sourceLabel: ifc.generatedByAi ? (ifc.generatedByAiSource || "Designer frame · IA") : "Designer frame",
          });
        }
      }
      if (ob.type === "booleanGroup" && typeof ob.cachedResult === "string") {
        into.push({
          url: ob.cachedResult,
          kind: guessKind(ob.cachedResult, "image"),
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
    if (typeof u === "string" && isLikelyMediaRef(u)) into.push(u);
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

    const urls: string[] = [];
    extractFromNodeData(data, urls);

    const isGenNode = GENERATOR_NODE_TYPES.has(nodeType);
    const isImportNode = IMPORT_NODE_TYPES.has(nodeType);

    const av = data._assetVersions;
    const graphRunUrls: string[] = [];
    if (Array.isArray(av)) {
      for (const ent of av) {
        if (!ent || typeof ent !== "object") continue;
        const urlEnt = (ent as { url?: string; source?: string }).url;
        const source = (ent as { source?: string }).source;
        if (typeof urlEnt === "string" && isLikelyMediaRef(urlEnt) && source === "graph-run") {
          graphRunUrls.push(urlEnt);
        }
      }
    }

    for (const url of urls) {
      const kind = guessKind(url, dataType);
      if (graphRunUrls.includes(url) || isGenNode) {
        pushUnique(generated, seenG, url, kind, nodeType || "nodo", nodeId);
      } else if (isImportNode) {
        pushUnique(imported, seenI, url, kind, nodeType || "nodo", nodeId);
      } else {
        pushUnique(imported, seenI, url, kind, nodeType || "nodo", nodeId);
      }
    }

    for (const url of graphRunUrls) {
      if (!urls.includes(url)) {
        pushUnique(generated, seenG, url, guessKind(url, dataType), `${nodeType} · historial`, nodeId);
      }
    }
  }

  const genUrlSet = new Set(generated.map((g) => projectMediaDedupeKey(g.url)));
  const importedDeduped = imported.filter((i) => !genUrlSet.has(projectMediaDedupeKey(i.url)));

  return { imported: importedDeduped, generated };
}
