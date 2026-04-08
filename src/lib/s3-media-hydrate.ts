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
      const k = resolveS3KeyFromNodeData(d);
      if (k) keys.add(k);
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
        const d = { ...(n.data || {}) } as Record<string, unknown>;
        const k = resolveS3KeyFromNodeData(d);
        if (k && urls[k]) {
          d.value = urls[k];
          d.s3Key = k;
        }
        return { ...n, data: d };
      }),
    };
  }
  return out;
}
