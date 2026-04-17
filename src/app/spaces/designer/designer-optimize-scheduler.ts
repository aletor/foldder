import type { DesignerPageState } from "./DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import {
  fetchBlobViaProxy,
  newDesignerAssetId,
  optimizeImageBlobToOptFormat,
} from "./designer-image-pipeline";
import { readResponseJson } from "@/lib/read-response-json";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

/**
 * Clave `knowledge-files/...` para presign e hidratar: prioriza OPT (único archivo guardado en proyectos nuevos),
 * luego HR/s3Key/src para legados.
 */
export function resolveDesignerImageHrKey(
  c: NonNullable<FreehandObject["imageFrameContent"]>,
): string {
  const direct = (c.s3KeyOpt || c.s3KeyHr || c.s3Key || "").trim();
  if (direct.startsWith("knowledge-files/")) return direct;
  const fromSrc = c.src ? tryExtractKnowledgeFilesKeyFromUrl(c.src) : null;
  return fromSrc && fromSrc.startsWith("knowledge-files/") ? fromSrc : "";
}

/**
 * Solo claves HR legacy (`…_HR.ext`) para la cola “generar OPT desde HR”. No usar cuando solo existe OPT.
 */
export function resolveLegacyDesignerHrKeyForOptimization(
  c: NonNullable<FreehandObject["imageFrameContent"]>,
): string {
  const hr = (c.s3KeyHr || "").trim();
  if (hr.startsWith("knowledge-files/")) return hr;
  const sk = (c.s3Key || "").trim();
  if (sk.startsWith("knowledge-files/") && sk.includes("_HR.")) return sk;
  const fromSrc = c.src ? tryExtractKnowledgeFilesKeyFromUrl(c.src) : null;
  if (fromSrc?.startsWith("knowledge-files/") && fromSrc.includes("_HR.")) return fromSrc;
  return "";
}

export type DesignerOptimizePending = {
  dedupeKey: string;
  assetId: string;
  hrKey: string;
  label: string;
  /** Primer marco de imagen encontrado (página activa primero) para HUD en el lienzo. */
  frameId: string;
};

export async function presignKnowledgeFileKeys(keys: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter((k) => k.startsWith("knowledge-files/")))];
  if (unique.length === 0) return {};
  const res = await fetch("/api/spaces/s3-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: unique }),
  });
  if (!res.ok) return {};
  const payload = (await res.json()) as { urls?: Record<string, string> };
  return payload.urls && typeof payload.urls === "object" ? payload.urls : {};
}

/** Recorre objetos anidados (boolean, clip). */
function patchAllImageContents(
  objs: FreehandObject[],
  predicate: (c: NonNullable<FreehandObject["imageFrameContent"]>) => boolean,
  patch: (c: NonNullable<FreehandObject["imageFrameContent"]>) => NonNullable<FreehandObject["imageFrameContent"]>,
): FreehandObject[] {
  const walk = (list: FreehandObject[]): FreehandObject[] =>
    list.map((o) => {
      if (o.type === "booleanGroup") {
        return { ...o, children: walk(o.children) } as FreehandObject;
      }
      if (o.type === "clippingContainer") {
        return {
          ...o,
          mask: walk([o.mask as FreehandObject])[0]!,
          content: walk(o.content),
        } as FreehandObject;
      }
      if (o.isImageFrame && o.imageFrameContent) {
        const c = o.imageFrameContent;
        if (!predicate(c)) return o;
        return { ...o, imageFrameContent: patch({ ...c }) } as FreehandObject;
      }
      return o;
    });
  return walk(objs);
}

export function collectPendingDesignerOptimizations(
  pages: DesignerPageState[],
  activePageId?: string | null,
): DesignerOptimizePending[] {
  const hasOptByHr = new Set<string>();
  const candidates = new Map<string, DesignerOptimizePending>();

  const consider = (o: FreehandObject) => {
    if (!o.isImageFrame || !o.imageFrameContent) return;
    const c = o.imageFrameContent;
    if (c.designerHrSourceMissing) return;
    if (c.s3KeyOpt) {
      const legacyHr = resolveLegacyDesignerHrKeyForOptimization(c);
      if (legacyHr.startsWith("knowledge-files/")) hasOptByHr.add(legacyHr);
      return;
    }
    const hrKey = resolveLegacyDesignerHrKeyForOptimization(c);
    if (!hrKey.startsWith("knowledge-files/")) return;
    if (candidates.has(hrKey)) return;
    const assetId =
      c.designerAssetId && c.designerAssetId.length > 0 ? c.designerAssetId : `legacy_${hrKey}`;
    const label = hrKey.split("/").pop() || "imagen";
    candidates.set(hrKey, { dedupeKey: hrKey, assetId, hrKey, label, frameId: o.id });
  };

  const walk = (objs: FreehandObject[]) => {
    for (const o of objs) {
      consider(o);
      if (o.type === "booleanGroup") walk(o.children);
      else if (o.type === "clippingContainer") {
        walk([o.mask as FreehandObject]);
        walk(o.content);
      }
    }
  };

  const pageOrder =
    activePageId != null && activePageId !== ""
      ? [...pages].sort((a, b) => {
          if (a.id === activePageId) return -1;
          if (b.id === activePageId) return 1;
          return 0;
        })
      : [...pages];

  for (const p of pageOrder) {
    walk(p.objects ?? []);
  }

  return [...candidates.values()].filter((x) => !hasOptByHr.has(x.hrKey));
}

async function knowledgeFileExistsInBucket(key: string): Promise<boolean | null> {
  if (!key.startsWith("knowledge-files/")) return false;
  try {
    const res = await fetch(`/api/spaces/s3-object-exists?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { exists?: boolean };
    if (j.exists === true) return true;
    if (j.exists === false) return false;
    return null;
  } catch {
    return null;
  }
}

/** Marca todos los marcos con esa HR como ausentes en bucket (evita reintentos en bucle). */
export function patchPagesMarkHrSourceMissing(
  pages: DesignerPageState[],
  hrKey: string,
): DesignerPageState[] {
  return patchPagesWithImageFramePredicate(
    pages,
    (c) =>
      resolveLegacyDesignerHrKeyForOptimization(c) === hrKey || resolveDesignerImageHrKey(c) === hrKey,
    (c) => ({ ...c, designerHrSourceMissing: true }),
  );
}

export function patchPagesWithImageFramePredicate(
  pages: DesignerPageState[],
  predicate: (c: NonNullable<FreehandObject["imageFrameContent"]>) => boolean,
  patch: (c: NonNullable<FreehandObject["imageFrameContent"]>) => NonNullable<FreehandObject["imageFrameContent"]>,
): DesignerPageState[] {
  return pages.map((page) => ({
    ...page,
    objects: patchAllImageContents(page.objects ?? [], predicate, patch),
  }));
}

export type CreateOptVersionForDesignerAssetResult =
  | { ok: true; pages: DesignerPageState[]; optKey: string; urls: Record<string, string> }
  | { ok: false; pages: DesignerPageState[]; reason: "hr_not_in_bucket" };

/**
 * Sube OPT, actualiza todas las instancias con el mismo HR/assetId y devuelve URLs prefirmadas.
 */
export async function createOptVersionForDesignerAsset(
  pages: DesignerPageState[],
  item: DesignerOptimizePending,
  spaceId: string | null,
  signal?: AbortSignal,
): Promise<CreateOptVersionForDesignerAssetResult> {
  const urlsMap = await presignKnowledgeFileKeys([item.hrKey]);
  const hrUrl = urlsMap[item.hrKey];
  if (!hrUrl) throw new Error("presign HR failed");

  const head = await knowledgeFileExistsInBucket(item.hrKey);
  if (head === false) {
    const nextPages = patchPagesMarkHrSourceMissing(pages, item.hrKey);
    return { ok: false, pages: nextPages, reason: "hr_not_in_bucket" };
  }

  let hrBlob: Blob;
  let mime: string;
  try {
    const fetched = await fetchBlobViaProxy(hrUrl);
    hrBlob = fetched.blob;
    mime = fetched.mime;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.includes("Not Found")) {
      return {
        ok: false,
        pages: patchPagesMarkHrSourceMissing(pages, item.hrKey),
        reason: "hr_not_in_bucket",
      };
    }
    throw e;
  }
  if (signal?.aborted) throw new Error("aborted");

  const { blob: optBlob, ext } = await optimizeImageBlobToOptFormat(hrBlob, mime);
  if (signal?.aborted) throw new Error("aborted");

  let assetId = item.assetId;
  if (assetId.startsWith("legacy_")) {
    assetId = newDesignerAssetId();
  }

  const form = new FormData();
  form.append("file", optBlob, `opt.${ext}`);
  form.append("assetId", assetId);
  form.append("variant", "OPT");
  if (spaceId) form.append("spaceId", spaceId);
  form.append("ext", ext);

  const up = await fetch("/api/spaces/designer-asset-upload", { method: "POST", body: form });
  const json = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(up, "designer OPT upload");
  if (!up.ok || !json?.s3Key || !json.url) {
    throw new Error(json?.error || `OPT upload failed (${up.status})`);
  }

  const optKey = json.s3Key;
  const pres = await presignKnowledgeFileKeys([optKey, item.hrKey]);
  const mergedUrls = { ...pres, ...urlsMap, [optKey]: json.url };

  const nextPages = patchPagesWithImageFramePredicate(
    pages,
    (c) => resolveLegacyDesignerHrKeyForOptimization(c) === item.hrKey && !c.s3KeyOpt,
    (c) => {
      const nextAsset = item.assetId.startsWith("legacy_") ? assetId : c.designerAssetId || assetId;
      return {
        ...c,
        designerAssetId: nextAsset,
        s3KeyOpt: optKey,
        s3Key: optKey,
        s3KeyHr: undefined,
      };
    },
  );

  return { ok: true, pages: nextPages, optKey, urls: mergedUrls };
}

/** Tras OPT: fija `src` según versión deseada (HR u OPT) con URLs prefirmadas. */
export function collectAllDesignerImageS3Keys(pages: DesignerPageState[]): string[] {
  const s = new Set<string>();
  const visit = (o: FreehandObject) => {
    if (o.isImageFrame && o.imageFrameContent) {
      const c = o.imageFrameContent;
      const primary = resolveDesignerImageHrKey(c);
      if (primary.startsWith("knowledge-files/")) s.add(primary);
      const legacyHr = (c.s3KeyHr || "").trim();
      if (legacyHr.startsWith("knowledge-files/") && legacyHr !== primary) s.add(legacyHr);
    }
    if (o.type === "booleanGroup") o.children.forEach(visit);
    else if (o.type === "clippingContainer") {
      visit(o.mask as FreehandObject);
      o.content.forEach(visit);
    }
  };
  for (const p of pages) {
    for (const o of p.objects ?? []) visit(o);
  }
  return [...s];
}

export function applyDesignerImageDisplayUrls(
  pages: DesignerPageState[],
  useOptimized: boolean,
  urlByKey: Record<string, string>,
): DesignerPageState[] {
  return patchPagesWithImageFramePredicate(
    pages,
    (c) => {
      const hr = resolveDesignerImageHrKey(c);
      return hr.startsWith("knowledge-files/");
    },
    (c) => {
      const primary = resolveDesignerImageHrKey(c);
      if (!primary.startsWith("knowledge-files/")) return c;
      const opt = c.s3KeyOpt;
      const key = useOptimized && opt ? opt : primary;
      const src = (key && urlByKey[key]) || c.src;
      return {
        ...c,
        s3KeyHr: c.s3KeyHr,
        s3Key: key || c.s3Key || primary,
        src,
      };
    },
  );
}
