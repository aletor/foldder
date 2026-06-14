import type { Node } from "@xyflow/react";

const KNOWLEDGE_FILES_PREFIX = "knowledge-files/";

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Repara URLs rotas del tipo `/api/spaces/s3-fi-assets%2F{hash}%2F{file}`. */
function tryRepairCorruptedS3FileRouteUrl(url: string): string | null {
  const match = url.match(/\/api\/spaces\/s3-fi-assets(?:%2F|\/)([^/%]+)(?:%2F|\/)(.+)$/i);
  if (!match) return null;
  const ownerHash = safeDecodeUriComponent(match[1] ?? "");
  const filename = safeDecodeUriComponent((match[2] ?? "").split("?")[0] ?? "");
  if (!ownerHash || !filename || filename.includes("..")) return null;
  return `${KNOWLEDGE_FILES_PREFIX}user-assets/${ownerHash}/${filename}`;
}

/** Resuelve la clave S3 desde refs persistidas (`s3Key`, URL estable, clave directa). */
export function resolveKnowledgeFilesS3Key(...refs: Array<string | undefined | null>): string | null {
  for (const ref of refs) {
    if (!ref || typeof ref !== "string") continue;
    const trimmed = ref.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(KNOWLEDGE_FILES_PREFIX)) return trimmed;
    const fromUrl = tryExtractKnowledgeFilesKeyFromUrl(trimmed);
    if (fromUrl) return fromUrl;
    const repaired = tryRepairCorruptedS3FileRouteUrl(trimmed);
    if (repaired) return repaired;
  }
  return null;
}

/** Extrae la clave `knowledge-files/...` de una URL prefirmada del bucket. */
export function tryExtractKnowledgeFilesKeyFromUrl(url: string): string | null {
  if (!url || typeof url !== "string" || url.startsWith("blob:") || url.startsWith("data:")) {
    return null;
  }
  const trimmed = url.trim();
  if (trimmed.startsWith(KNOWLEDGE_FILES_PREFIX)) return trimmed;
  try {
    const u = new URL(trimmed, "http://foldder.local");
    const routeKey =
      u.pathname === "/api/spaces/s3-file" || u.pathname === "/api/spaces/s3-download"
        ? u.searchParams.get("key")?.trim()
        : "";
    if (routeKey?.startsWith(KNOWLEDGE_FILES_PREFIX)) return routeKey;
    const path = safeDecodeUriComponent(u.pathname.replace(/^\/+/, ""));
    // Virtual-hosted: knowledge-files/… | Path-style: bucket/knowledge-files/…
    const idx = path.indexOf(KNOWLEDGE_FILES_PREFIX);
    if (idx >= 0) return path.slice(idx);
    return null;
  } catch {
    return null;
  }
}

export function stableKnowledgeFileUrlFromKey(key: string): string | null {
  const clean = key.trim();
  if (!clean.startsWith(KNOWLEDGE_FILES_PREFIX) || clean.includes("..") || clean.includes("\0")) return null;
  return `/api/spaces/s3-file?key=${encodeURIComponent(clean)}`;
}

export function stableKnowledgeFileUrlFromMaybeUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/api/spaces/s3-file")) return raw;
  const key = tryExtractKnowledgeFilesKeyFromUrl(raw);
  if (key) return stableKnowledgeFileUrlFromKey(key);
  if (/^https:\/\//i.test(raw)) return raw;
  return null;
}

function resolveS3KeyFromNodeData(data: Record<string, unknown>): string | null {
  const sk = data.s3Key ?? data.key;
  if (typeof sk === "string" && sk.startsWith(KNOWLEDGE_FILES_PREFIX)) return sk;
  const v = data.value;
  if (typeof v === "string") {
    const fromUrl = tryExtractKnowledgeFilesKeyFromUrl(v);
    if (fromUrl) return fromUrl;
  }
  return null;
}

function collectS3KeysFromUnknown(value: unknown, keys: Set<string>): void {
  if (typeof value === "string") {
    const fromUrl = tryExtractKnowledgeFilesKeyFromUrl(value);
    if (fromUrl) keys.add(fromUrl);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectS3KeysFromUnknown(item, keys);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const item of Object.values(value as Record<string, unknown>)) {
    collectS3KeysFromUnknown(item, keys);
  }
}

/** Imágenes en marcos del nodo Designer (`data.pages[].objects[].imageFrameContent`). */
function collectDesignerImageKeysFromPages(d: Record<string, unknown>, keys: Set<string>) {
  const pages = d.pages;
  if (!Array.isArray(pages)) return;
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const objs = (page as { objects?: unknown[] }).objects;
    if (!Array.isArray(objs)) continue;
    for (const obj of objs) {
      if (!obj || typeof obj !== "object") continue;
      const o = obj as Record<string, unknown>;
      if (!o.isImageFrame) continue;
      const ifc = o.imageFrameContent;
      if (!ifc || typeof ifc !== "object") continue;
      const row = ifc as Record<string, unknown>;
      const skHr = row.s3KeyHr;
      if (typeof skHr === "string" && skHr.startsWith("knowledge-files/")) {
        keys.add(skHr);
      }
      const skOpt = row.s3KeyOpt;
      if (typeof skOpt === "string" && skOpt.startsWith("knowledge-files/")) {
        keys.add(skOpt);
      }
      const sk = row.s3Key;
      if (typeof sk === "string" && sk.startsWith("knowledge-files/")) {
        keys.add(sk);
        continue;
      }
      const src = row.src;
      if (typeof src === "string") {
        const fromUrl = tryExtractKnowledgeFilesKeyFromUrl(src);
        if (fromUrl) keys.add(fromUrl);
      }
    }
  }
}

function collectPresignKeysFromNodeData(d: Record<string, unknown>, keys: Set<string>) {
  const k = resolveS3KeyFromNodeData(d);
  if (k) keys.add(k);
  collectDesignerImageKeysFromPages(d, keys);
  const gh = d.generationHistory;
  if (Array.isArray(gh)) {
    for (const item of gh) {
      if (typeof item !== "string") continue;
      const fromUrl = tryExtractKnowledgeFilesKeyFromUrl(item);
      if (fromUrl) keys.add(fromUrl);
    }
  }
  const av = d._assetVersions;
  if (Array.isArray(av)) {
    for (const entry of av) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as { s3Key?: unknown; url?: unknown };
      if (typeof e.s3Key === "string" && e.s3Key.startsWith("knowledge-files/")) {
        keys.add(e.s3Key);
      } else if (typeof e.url === "string") {
        const fromUrl = tryExtractKnowledgeFilesKeyFromUrl(e.url);
        if (fromUrl) keys.add(fromUrl);
      }
    }
  }
}

/** All `knowledge-files/…` keys referenced by node data (current value, history, versions). */
export function collectS3KeysFromNodeData(d: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  collectS3KeysFromUnknown(d, keys);
  collectPresignKeysFromNodeData(d, keys);
  return [...keys];
}

export function collectS3KeysFromValue(value: unknown): string[] {
  const keys = new Set<string>();
  collectS3KeysFromUnknown(value, keys);
  return [...keys];
}

/** Collect keys from every node in a project's `spaces` map (for project DELETE). */
export function collectS3KeysFromProjectSpaces(spaces: Record<string, unknown>): string[] {
  const all = new Set<string>();
  for (const space of Object.values(spaces)) {
    const s = space as { nodes?: Array<{ data?: Record<string, unknown> }> };
    for (const n of s.nodes || []) {
      if (n.data) {
        for (const k of collectS3KeysFromNodeData(n.data)) {
          all.add(k);
        }
      }
    }
  }
  return [...all];
}

function hydrateGenerationHistoryUrls(
  d: Record<string, unknown>,
  urls: Record<string, string>
): Record<string, unknown> {
  const gh = d.generationHistory;
  if (!Array.isArray(gh) || gh.length === 0) return d;
  let changed = false;
  const next = gh.map((item) => {
    if (typeof item !== "string") return item;
    const kk = tryExtractKnowledgeFilesKeyFromUrl(item);
    if (kk && urls[kk]) {
      changed = true;
      return urls[kk];
    }
    return item;
  });
  return changed ? { ...d, generationHistory: next } : d;
}

function hydrateAssetVersionUrls(
  d: Record<string, unknown>,
  urls: Record<string, string>
): Record<string, unknown> {
  const av = d._assetVersions;
  if (!Array.isArray(av) || av.length === 0) return d;
  let changed = false;
  const next = av.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const e = entry as { s3Key?: string; url?: string };
    const key = typeof e.s3Key === "string" ? e.s3Key : null;
    const keyFromUrl = typeof e.url === "string" ? tryExtractKnowledgeFilesKeyFromUrl(e.url) : null;
    const resolvedKey = key || keyFromUrl;
    if (resolvedKey && urls[resolvedKey]) {
      changed = true;
      return { ...e, url: urls[resolvedKey], s3Key: resolvedKey };
    }
    return entry;
  });
  return changed ? { ...d, _assetVersions: next } : d;
}

function hydrateDesignerPagesInData(d: Record<string, unknown>, urls: Record<string, string>): Record<string, unknown> {
  const pages = d.pages;
  if (!Array.isArray(pages) || pages.length === 0) return d;
  let any = false;
  const nextPages = pages.map((page) => {
    if (!page || typeof page !== "object") return page;
    const p = page as { objects?: unknown[] };
    if (!Array.isArray(p.objects)) return page;
    const nextObjs = p.objects.map((obj) => {
      if (!obj || typeof obj !== "object") return obj;
      const o = obj as Record<string, unknown>;
      if (!o.isImageFrame) return obj;
      const ifc = o.imageFrameContent;
      if (!ifc || typeof ifc !== "object") return obj;
      const row = ifc as Record<string, unknown>;
      const skOpt = typeof row.s3KeyOpt === "string" ? row.s3KeyOpt : null;
      const skHr = typeof row.s3KeyHr === "string" ? row.s3KeyHr : null;
      const skLegacy = typeof row.s3Key === "string" ? row.s3Key : null;
      const keyFromUrl = typeof row.src === "string" ? tryExtractKnowledgeFilesKeyFromUrl(row.src) : null;
      const resolvedKey = skOpt || skHr || skLegacy || keyFromUrl;
      if (resolvedKey && urls[resolvedKey]) {
        any = true;
        const nextRow = {
          ...row,
          src: urls[resolvedKey],
          s3Key: resolvedKey,
          ...(skHr ? { s3KeyHr: skHr } : {}),
          ...(skOpt ? { s3KeyOpt: skOpt } : {}),
        };
        return {
          ...o,
          imageFrameContent: nextRow,
        };
      }
      return obj;
    });
    return { ...p, objects: nextObjs };
  });
  return any ? { ...d, pages: nextPages } : d;
}

function isS3KeyLikeField(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === "key" ||
    k === "s3key" ||
    k === "s3keyhr" ||
    k === "s3keyopt" ||
    k === "s3path" ||
    k.endsWith("s3key") ||
    k.endsWith("s3path")
  );
}

function hydrateGenericMediaUrls(value: unknown, urls: Record<string, string>, key = ""): unknown {
  if (typeof value === "string") {
    if (isS3KeyLikeField(key)) return value;
    const s3Key = tryExtractKnowledgeFilesKeyFromUrl(value);
    return s3Key && urls[s3Key] ? urls[s3Key] : value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const hydrated = hydrateGenericMediaUrls(item, urls, key);
      if (hydrated !== item) changed = true;
      return hydrated;
    });
    return changed ? next : value;
  }
  if (!value || typeof value !== "object") return value;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    const hydrated = hydrateGenericMediaUrls(childValue, urls, childKey);
    if (hydrated !== childValue) changed = true;
    out[childKey] = hydrated;
  }
  return changed ? out : value;
}

/**
 * Tras cargar un proyecto: renueva `data.value` con URLs prefirmadas válidas usando `s3Key`
 * o la clave inferida de una URL antigua del mismo prefijo.
 */
export async function hydrateSpacesMapWithFreshUrls(
  spaces: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const keys = new Set<string>();
  for (const space of Object.values(spaces)) {
    const s = space as { nodes?: Node[] };
    for (const n of s.nodes || []) {
      const d = (n.data || {}) as Record<string, unknown>;
      collectPresignKeysFromNodeData(d, keys);
    }
  }
  if (keys.size === 0) return spaces;

  const res = await fetch("/api/spaces/s3-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: [...keys] }),
  });
  if (!res.ok) {
    console.warn("[hydrate-s3] presign failed", await res.text());
    return spaces;
  }
  const payload = (await res.json()) as { urls?: Record<string, string> };
  const urls = payload.urls;
  if (!urls || typeof urls !== "object") return spaces;

  const out: Record<string, unknown> = { ...spaces };
  for (const spaceKey of Object.keys(out)) {
    const space = out[spaceKey] as { nodes?: Node[] };
    if (!space?.nodes) continue;
    out[spaceKey] = {
      ...space,
      nodes: space.nodes.map((n) => {
        let d = { ...(n.data || {}) } as Record<string, unknown>;
        const k = resolveS3KeyFromNodeData(d);
        if (k && urls[k]) {
          d.value = urls[k];
          d.s3Key = k;
        }
        d = hydrateGenerationHistoryUrls(d, urls);
        d = hydrateAssetVersionUrls(d, urls);
        d = hydrateDesignerPagesInData(d, urls);
        d = hydrateGenericMediaUrls(d, urls) as Record<string, unknown>;
        return { ...n, data: d };
      }),
    };
  }
  return out;
}
