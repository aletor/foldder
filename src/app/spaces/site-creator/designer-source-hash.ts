import type { DesignerPageState } from "../designer/DesignerNode";

/** Canonical JSON estable (claves ordenadas, sin undefined). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function fnv1a64Hex(input: string): string {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

const lastDataUrlDigest = { src: null as string | null, digest: null as string | null };

function normalizeHashLeaf(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("data:")) {
    if (lastDataUrlDigest.src === value && lastDataUrlDigest.digest) {
      return `data:${lastDataUrlDigest.digest}`;
    }
    const digest = fnv1a64Hex(value);
    lastDataUrlDigest.src = value;
    lastDataUrlDigest.digest = digest;
    return `data:${digest}`;
  }
  return value;
}

/** Clona superficialmente para hash sin duplicar blobs base64 en JSON intermedio. */
function cloneForHash(value: unknown): unknown {
  const leaf = normalizeHashLeaf(value);
  if (leaf !== value) return leaf;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => cloneForHash(item));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    out[key] = cloneForHash(entry);
  }
  return out;
}

/** Campos de página que no afectan al render estático SVG del snapshot. */
export function designerPageHashPayload(page: DesignerPageState): Record<string, unknown> {
  const payload = cloneForHash(page) as DesignerPageState & Record<string, unknown>;
  delete payload.presenterGroupSteps;
  delete payload.presenterSkipSlide;
  delete payload.datasetRowIndex;
  delete payload.datasetLoopListId;
  delete payload.datasetLoopCardId;
  return payload;
}

/** Hash determinista del contenido renderizable de una página Designer. */
export function computeDesignerPageContentHash(page: DesignerPageState): string {
  const canonical = stableStringify(designerPageHashPayload(page));
  const a = fnv1a64Hex(canonical);
  const b = fnv1a64Hex(`${canonical}\0`);
  return `${a}${b}`;
}
