/**
 * Fichero `.folddata`: ZIP con `dataset.json` + `assets/N` (imágenes/vídeos embebidos).
 * Snapshot desvinculado del Dataset global vivo.
 */
import JSZip from "jszip";
import type { Dataset, DatasetScope, FieldValue } from "./dataset-types";
import { normalizeDataset } from "./dataset-migrate";
import { fetchBlobViaSpacesProxy } from "@/lib/spaces-proxy-fetch";

export const FOLDDER_FOLDDATA_FORMAT = "foldder-dataset" as const;
export const FOLDDER_FOLDDATA_VERSION = 1;
export const FOLDDER_FOLDDATA_EXTENSION = ".folddata";

const DATASET_ENTRY = "dataset.json";

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const stamp = Date.now().toString(36);
  return `${prefix}_${stamp}${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function assetToken(index: number): string {
  return `__FOLDDER_FOLDDATA_ASSET_${index}__`;
}

function isPackagableMediaUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  return (
    t.startsWith("data:") ||
    t.startsWith("blob:") ||
    t.startsWith("http://") ||
    t.startsWith("https://")
  );
}

function visitFieldValue(val: FieldValue, visit: (url: string) => void): void {
  if (val.type === "image" || val.type === "video") {
    const url = val.url?.trim();
    if (url && isPackagableMediaUrl(url)) visit(url);
  }
}

/** Recorre listados y constantes; devuelve URLs únicas de medios empaquetables. */
export function collectMediaUrlsFromDataset(dataset: Dataset): string[] {
  const set = new Set<string>();
  const normalized = normalizeDataset(dataset);
  for (const list of normalized.lists) {
    for (const card of list.cards) {
      for (const val of Object.values(card.values)) visitFieldValue(val, (u) => set.add(u));
    }
  }
  for (const val of Object.values(normalized.constants.values)) {
    visitFieldValue(val, (u) => set.add(u));
  }
  return Array.from(set).sort();
}

async function urlToBlob(url: string): Promise<Blob> {
  const u = url.trim();
  if (u.startsWith("data:") || u.startsWith("blob:")) {
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

function rewriteUrlStringsInValue(value: unknown, urlToToken: Map<string, string>): void {
  if (value === null || value === undefined) return;
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

function resolveAssetTokensInValue(value: unknown, tokenToObjectUrl: Map<string, string>): void {
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

function remapMediaAssetId(val: FieldValue): FieldValue {
  if (val.type === "image" || val.type === "video") {
    return { ...val, assetId: genId("a") };
  }
  return val;
}

/** Regenera ids del dataset importado y aplica scope destino. */
export function prepareImportedDataset(
  source: Dataset,
  scope: DatasetScope,
  projectId?: string,
): Dataset {
  const normalized = normalizeDataset(source);
  const fieldIdMap = new Map<string, string>();

  const lists = normalized.lists.map((list) => {
    const newListId = genId("dl");
    const schema = list.schema.map((f) => {
      const newId = genId("f");
      fieldIdMap.set(f.id, newId);
      return { ...f, id: newId };
    });
    const cards = list.cards.map((card) => {
      const values: Record<string, FieldValue> = {};
      for (const [oldFieldId, val] of Object.entries(card.values)) {
        const newFieldId = fieldIdMap.get(oldFieldId) ?? oldFieldId;
        values[newFieldId] = remapMediaAssetId(val);
      }
      return { id: genId("c"), values };
    });
    return { ...list, id: newListId, schema, cards };
  });

  const constFields = normalized.constants.fields.map((f) => {
    const newId = genId("f");
    fieldIdMap.set(f.id, newId);
    return { ...f, id: newId };
  });
  const constValues: Record<string, FieldValue> = {};
  for (const [oldId, val] of Object.entries(normalized.constants.values)) {
    constValues[fieldIdMap.get(oldId) ?? oldId] = remapMediaAssetId(val);
  }

  const ts = nowIso();
  return normalizeDataset({
    id: genId("ds"),
    name: normalized.name.trim() || "Dataset",
    scope,
    projectId: scope === "local" ? projectId : undefined,
    lists,
    constants: { fields: constFields, values: constValues },
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  });
}

export type FolddataFilePayload = {
  format: typeof FOLDDER_FOLDDATA_FORMAT;
  version: number;
  assetMimes: string[];
  dataset: Dataset;
};

function safeFilenameBase(name: string): string {
  const base = name
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return base || "dataset";
}

export async function exportDatasetFolddataFile(args: {
  dataset: Dataset;
  filenameBase?: string;
}): Promise<void> {
  const normalized = normalizeDataset(args.dataset);
  const urls = collectMediaUrlsFromDataset(normalized);
  const blobs: Blob[] = [];
  const mimes: string[] = [];
  for (const u of urls) {
    const blob = await urlToBlob(u);
    blobs.push(blob);
    mimes.push(blob.type || "application/octet-stream");
  }

  const urlToToken = buildUrlToTokenMap(urls);
  const datasetClone = JSON.parse(JSON.stringify(normalized)) as Dataset;
  rewriteUrlStringsInValue(datasetClone, urlToToken);

  const payload: FolddataFilePayload = {
    format: FOLDDER_FOLDDATA_FORMAT,
    version: FOLDDER_FOLDDATA_VERSION,
    assetMimes: mimes,
    dataset: datasetClone,
  };

  const zip = new JSZip();
  zip.file(DATASET_ENTRY, JSON.stringify(payload));
  for (let i = 0; i < blobs.length; i++) {
    const ab = await blobs[i]!.arrayBuffer();
    zip.file(`assets/${i}`, ab);
  }

  const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const base = args.filenameBase?.replace(/\.folddata$/i, "") ?? safeFilenameBase(normalized.name);
  const name = `${base}${FOLDDER_FOLDDATA_EXTENSION}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(out);
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importDatasetFolddataFile(file: File): Promise<{ dataset: Dataset }> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file(DATASET_ENTRY);
  if (!entry) {
    throw new Error("No es un fichero .folddata válido (falta dataset.json).");
  }
  const text = await entry.async("string");
  const payload = JSON.parse(text) as FolddataFilePayload;
  if (payload.format !== FOLDDER_FOLDDATA_FORMAT || payload.version !== FOLDDER_FOLDDATA_VERSION) {
    throw new Error("Versión de .folddata no compatible. Actualiza la app o vuelve a exportar.");
  }
  if (!payload.dataset || typeof payload.dataset !== "object") {
    throw new Error("dataset.json corrupto: falta `dataset`.");
  }

  const tokenToObjectUrl = new Map<string, string>();
  const n = payload.assetMimes?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const assetEntry = zip.file(`assets/${i}`);
    if (!assetEntry) {
      throw new Error(`Falta el recurso empaquetado assets/${i}`);
    }
    const ab = await assetEntry.async("arraybuffer");
    const mime = payload.assetMimes[i] || "application/octet-stream";
    const blob = new Blob([ab], { type: mime });
    const url = URL.createObjectURL(blob);
    tokenToObjectUrl.set(assetToken(i), url);
  }

  const dataset = JSON.parse(JSON.stringify(payload.dataset)) as Dataset;
  resolveAssetTokensInValue(dataset, tokenToObjectUrl);

  return { dataset: normalizeDataset(dataset) };
}
