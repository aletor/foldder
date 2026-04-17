/**
 * Fichero `.de` (Foldder Designer Export): ZIP con `document.json` + `assets/N` (binarios).
 * Incluye imágenes embebidas para no depender de S3 al abrir en otro proyecto.
 */
import JSZip from "jszip";
import type { DesignerPageState } from "./DesignerNode";
import type { FreehandObject } from "./FreehandStudio";
import { fetchBlobViaSpacesProxy } from "@/lib/spaces-proxy-fetch";

export const FOLDDER_DE_FORMAT = "foldder-design" as const;
export const FOLDDER_DE_VERSION = 1;
export const FOLDDER_DE_EXTENSION = ".de";

const DOC_ENTRY = "document.json";

function assetToken(index: number): string {
  return `__FOLDDER_DE_ASSET_${index}__`;
}

function isLikelyImageUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.startsWith("data:image/")) return true;
  if (t.startsWith("blob:")) return true;
  if (t.startsWith("http://") || t.startsWith("https://")) return true;
  return false;
}

function walkObjects(o: FreehandObject, visit: (url: string) => void): void {
  if (o.type === "image") {
    const s = (o as { src?: string }).src?.trim();
    if (s && isLikelyImageUrl(s)) visit(s);
  }
  if (o.type === "rect" && o.isImageFrame && o.imageFrameContent?.src) {
    const s = o.imageFrameContent.src.trim();
    if (isLikelyImageUrl(s)) visit(s);
  }
  if (o.type === "booleanGroup") {
    const bg = o as { cachedResult?: string; children: FreehandObject[] };
    const cr = bg.cachedResult?.trim();
    if (cr && isLikelyImageUrl(cr)) visit(cr);
    for (const c of bg.children) walkObjects(c, visit);
  }
  if (o.type === "clippingContainer") {
    walkObjects(o.mask as FreehandObject, visit);
    for (const c of o.content) walkObjects(c, visit);
  }
}

function collectImageUrlsFromPages(pages: DesignerPageState[]): string[] {
  const set = new Set<string>();
  const add = (u: string) => {
    const t = u.trim();
    if (t && isLikelyImageUrl(t)) set.add(t);
  };
  for (const p of pages) {
    for (const o of p.objects ?? []) walkObjects(o, add);
    for (const fr of p.imageFrames ?? []) {
      const s = fr.imageContent?.src?.trim();
      if (s) add(s);
    }
  }
  return Array.from(set).sort();
}

async function urlToBlob(url: string): Promise<Blob> {
  const u = url.trim();
  if (u.startsWith("data:")) {
    const res = await fetch(u);
    return res.blob();
  }
  if (u.startsWith("blob:")) {
    const res = await fetch(u);
    return res.blob();
  }
  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      const res = await fetch(u, { mode: "cors" });
      if (res.ok) return res.blob();
    } catch {
      /* CORS u otro: intentar proxy del espacio */
    }
    return fetchBlobViaSpacesProxy(u);
  }
  throw new Error(`No se puede empaquetar la URL: ${u.slice(0, 80)}…`);
}

function rewriteUrlStringsInValue(value: unknown, urlToToken: Map<string, string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (typeof v === "string") {
        const tok = urlToToken.get(v) ?? urlToToken.get(v.trim());
        if (tok) value[i] = tok;
      } else {
        rewriteUrlStringsInValue(v, urlToToken);
      }
    }
    return;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "string") {
        const tok = urlToToken.get(v) ?? urlToToken.get(v.trim());
        if (tok) o[k] = tok;
      } else {
        rewriteUrlStringsInValue(v, urlToToken);
      }
    }
  }
}

function buildUrlToTokenMap(urls: string[]): Map<string, string> {
  const m = new Map<string, string>();
  urls.forEach((u, i) => {
    const t = assetToken(i);
    m.set(u, t);
    const tr = u.trim();
    if (tr !== u) m.set(tr, t);
  });
  return m;
}

/** Quita referencias S3 para que el documento importado sea autocontenido (blob:). */
function stripS3MetaFromObject(o: FreehandObject): void {
  if (o.type === "rect" && o.isImageFrame && o.imageFrameContent) {
    const c = o.imageFrameContent as Record<string, unknown>;
    delete c.s3Key;
    delete c.s3KeyHr;
    delete c.s3KeyOpt;
    delete c.designerAssetId;
    c.designerHrSourceMissing = false;
  }
  if (o.type === "booleanGroup") {
    for (const c of o.children) stripS3MetaFromObject(c);
  }
  if (o.type === "clippingContainer") {
    stripS3MetaFromObject(o.mask as FreehandObject);
    for (const c of o.content) stripS3MetaFromObject(c);
  }
}

function stripS3MetaFromPages(pages: DesignerPageState[]): void {
  for (const p of pages) {
    for (const o of p.objects ?? []) stripS3MetaFromObject(o);
  }
}

function resolveAssetTokensInValue(
  value: unknown,
  tokenToObjectUrl: Map<string, string>,
): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (typeof v === "string") {
        const rep = tokenToObjectUrl.get(v) ?? tokenToObjectUrl.get(v.trim());
        if (rep) value[i] = rep;
      } else {
        resolveAssetTokensInValue(v, tokenToObjectUrl);
      }
    }
    return;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "string") {
        const rep = tokenToObjectUrl.get(v) ?? tokenToObjectUrl.get(v.trim());
        if (rep) o[k] = rep;
      } else {
        resolveAssetTokensInValue(v, tokenToObjectUrl);
      }
    }
  }
}

export type FoldderDesignFilePayload = {
  format: typeof FOLDDER_DE_FORMAT;
  version: number;
  activePageIndex: number;
  autoImageOptimization: boolean;
  assetMimes: string[];
  pages: DesignerPageState[];
};

export async function exportDesignerDeFile(args: {
  pages: DesignerPageState[];
  activePageIndex: number;
  autoImageOptimization: boolean;
  filenameBase?: string;
}): Promise<void> {
  const urls = collectImageUrlsFromPages(args.pages);
  const blobs: Blob[] = [];
  const mimes: string[] = [];
  for (const u of urls) {
    const blob = await urlToBlob(u);
    blobs.push(blob);
    mimes.push(blob.type || "application/octet-stream");
  }

  const urlToToken = buildUrlToTokenMap(urls);
  const pagesClone = JSON.parse(JSON.stringify(args.pages)) as DesignerPageState[];
  rewriteUrlStringsInValue(pagesClone, urlToToken);

  const payload: FoldderDesignFilePayload = {
    format: FOLDDER_DE_FORMAT,
    version: FOLDDER_DE_VERSION,
    activePageIndex: args.activePageIndex,
    autoImageOptimization: args.autoImageOptimization,
    assetMimes: mimes,
    pages: pagesClone,
  };

  const zip = new JSZip();
  zip.file(DOC_ENTRY, JSON.stringify(payload));
  for (let i = 0; i < blobs.length; i++) {
    const ab = await blobs[i]!.arrayBuffer();
    zip.file(`assets/${i}`, ab);
  }

  const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const base = args.filenameBase?.replace(/\.de$/i, "") || "diseno-foldder";
  const name = `${base}-${new Date().toISOString().slice(0, 10)}${FOLDDER_DE_EXTENSION}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(out);
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importDesignerDeFile(file: File): Promise<{
  pages: DesignerPageState[];
  activePageIndex: number;
  autoImageOptimization: boolean;
}> {
  const zip = await JSZip.loadAsync(file);
  const doc = zip.file(DOC_ENTRY);
  if (!doc) {
    throw new Error("No es un fichero .de válido (falta document.json).");
  }
  const text = await doc.async("string");
  const payload = JSON.parse(text) as FoldderDesignFilePayload;
  if (payload.format !== FOLDDER_DE_FORMAT || payload.version !== FOLDDER_DE_VERSION) {
    throw new Error("Versión de .de no compatible. Actualiza la app o vuelve a exportar.");
  }
  if (!Array.isArray(payload.pages)) {
    throw new Error("document.json corrupto: falta `pages`.");
  }

  const tokenToObjectUrl = new Map<string, string>();
  const n = payload.assetMimes?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const entry = zip.file(`assets/${i}`);
    if (!entry) {
      throw new Error(`Falta el recurso empaquetado assets/${i}`);
    }
    const ab = await entry.async("arraybuffer");
    const mime = payload.assetMimes[i] || "application/octet-stream";
    const blob = new Blob([ab], { type: mime });
    const url = URL.createObjectURL(blob);
    const tok = assetToken(i);
    tokenToObjectUrl.set(tok, url);
  }

  const pages = JSON.parse(JSON.stringify(payload.pages)) as DesignerPageState[];
  resolveAssetTokensInValue(pages, tokenToObjectUrl);
  stripS3MetaFromPages(pages);

  const activePageIndex = Math.max(
    0,
    Math.min(payload.activePageIndex ?? 0, Math.max(0, pages.length - 1)),
  );

  return {
    pages,
    activePageIndex,
    autoImageOptimization: payload.autoImageOptimization !== false,
  };
}
