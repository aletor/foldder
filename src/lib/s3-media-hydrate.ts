import type { Node } from "@xyflow/react";

/** Extrae la clave `knowledge-files/...` de una URL prefirmada del bucket. */
export function tryExtractKnowledgeFilesKeyFromUrl(url: string): string | null {
  if (!url || typeof url !== "string" || url.startsWith("blob:") || url.startsWith("data:")) {
    return null;
  }
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, "");
    if (path.startsWith("knowledge-files/")) return path;
    return null;
  } catch {
    return null;
  }
}

function resolveS3KeyFromNodeData(data: Record<string, unknown>): string | null {
  const sk = data.s3Key ?? data.key;
  if (typeof sk === "string" && sk.startsWith("knowledge-files/")) return sk;
  const v = data.value;
  if (typeof v === "string") {
    const fromUrl = tryExtractKnowledgeFilesKeyFromUrl(v);
    if (fromUrl) return fromUrl;
  }
  return null;
}

function collectPresignKeysFromNodeData(d: Record<string, unknown>, keys: Set<string>) {
  const k = resolveS3KeyFromNodeData(d);
  if (k) keys.add(k);
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
  collectPresignKeysFromNodeData(d, keys);
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
        return { ...n, data: d };
      }),
    };
  }
  return out;
}
