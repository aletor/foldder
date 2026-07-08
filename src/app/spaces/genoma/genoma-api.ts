import type { GenomaDocument, Provenance, SlotId, SlotState } from "@/lib/genoma/genoma-types";
import { GENOMA_SLOT_IDS } from "@/lib/genoma/genoma-types";
import { createEmptyGenoma } from "@/lib/genoma/genoma-defaults";
import { normalizeGenomaUrlInput } from "@/lib/genoma/crawl/url-utils";
import type { GenomaStreamEvent } from "@/lib/genoma/crawl/types";
import { compileGenoma } from "@/lib/genoma/compile-genoma";
import { fetchPostWithWalletPreflight, notifyWalletFromApiResponse } from "@/lib/wallet-fetch-preflight";

const NOW = () => new Date().toISOString();

async function parseApiError(res: Response): Promise<string> {
  let message = res.status === 401 ? "Sesión requerida" : `Error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    if (body.error) message = body.error;
    if (res.status === 402) message = body.error ?? "Saldo insuficiente";
    if (res.status === 409 || body.code === "wallet_preflight_cancelled") message = body.error ?? "Operación cancelada";
    if (res.status === 503) message = body.error ?? "Servicio no disponible";
  } catch {
    // keep default
  }
  return message;
}

export function applyGenomaStreamEvent(
  doc: GenomaDocument,
  event: GenomaStreamEvent,
  options?: { respectLocks?: boolean },
): GenomaDocument {
  if (event.type === "brand_name") {
    return {
      ...doc,
      brandName: { value: event.value, provenance: event.provenance },
      updatedAt: NOW(),
    };
  }

  if (event.type === "source_added") {
    return {
      ...doc,
      sources: [...doc.sources, { kind: event.kind, ref: event.ref, ts: NOW() }],
      updatedAt: NOW(),
    };
  }

  if (event.type === "slot_update") {
    const current = doc.slots[event.slotId] ?? createEmptyGenoma().slots[event.slotId];
    if (options?.respectLocks && current.locked) return doc;
    const merged: SlotState<unknown> = {
      ...current,
      id: event.slotId,
      ...event.patch,
      updatedAt: event.patch.updatedAt ?? NOW(),
    };
    return {
      ...doc,
      slots: { ...doc.slots, [event.slotId]: merged },
      updatedAt: NOW(),
    };
  }

  return doc;
}

export async function applyGenomaCompile(doc: GenomaDocument): Promise<GenomaDocument> {
  const { compiled, compiledHash } = await compileGenoma(doc);
  return { ...doc, compiled, compiledHash, updatedAt: new Date().toISOString() };
}

async function consumeNdjsonStream(
  res: Response,
  onEvent: (event: GenomaStreamEvent) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as GenomaStreamEvent;
      onEvent(event);
      if (event.type === "error") return { ok: false, message: event.message };
    }
  }

  return { ok: true };
}

export async function streamGenomaCrawl(
  url: string,
  onEvent: (event: GenomaStreamEvent) => void,
  options?: { enableLlm?: boolean },
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const normalized = normalizeGenomaUrlInput(url);
  if (!normalized.ok) return { ok: false, message: normalized.message };

  const enableLlm = options?.enableLlm !== false;
  const res = await fetch("/api/spaces/genoma/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: normalized.url, enableLlm }),
  });

  if (!res.ok || !res.body) {
    return { ok: false, message: await parseApiError(res) };
  }

  const streamed = await consumeNdjsonStream(res, onEvent);
  if (!streamed.ok) return streamed;
  return { ok: true, url: normalized.url };
}

export async function streamGenomaIngest(
  files: File[],
  onEvent: (event: GenomaStreamEvent) => void,
  options?: { enableLlm?: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!files.length) return { ok: false, message: "No hay archivos" };

  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (options?.enableLlm === false) form.append("enableLlm", "false");

  const res = await fetch("/api/spaces/genoma/ingest", {
    method: "POST",
    body: form,
  });

  if (!res.ok || !res.body) {
    return { ok: false, message: await parseApiError(res) };
  }

  return consumeNdjsonStream(res, onEvent);
}

export type GenomaGalleryGenerateProgress = {
  index: number;
  total: number;
  categoryLabel: string;
  message: string;
  toneExplanation?: string;
  completedItems: import("@/lib/genoma/genoma-types").GalleryValue["generated"];
};

export async function streamGenomaGallery(
  genoma: GenomaDocument,
  stylePromptVersion: number | undefined,
  onEvent: (event: import("@/lib/genoma/run-gallery-generate").GenomaGalleryStreamEvent) => void,
): Promise<
  | { ok: true; gallery: import("@/lib/genoma/genoma-types").GalleryValue; addedCount: number }
  | { ok: false; message: string }
> {
  const res = await fetchPostWithWalletPreflight(
    "/api/spaces/genoma/gallery/generate",
    { genoma, stylePromptVersion },
    { headers: { Accept: "application/x-ndjson" } },
  );
  await notifyWalletFromApiResponse(res);

  if (!res.ok || !res.body) {
    return { ok: false, message: await parseApiError(res) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastGallery: import("@/lib/genoma/genoma-types").GalleryValue | null = null;
  let addedCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as import("@/lib/genoma/run-gallery-generate").GenomaGalleryStreamEvent;
      onEvent(event);
      if (event.type === "error") return { ok: false, message: event.message };
      if (event.type === "done") {
        lastGallery = event.gallery;
        addedCount = event.addedCount;
      }
    }
  }

  if (!lastGallery) return { ok: false, message: "Sin galería generada" };
  return { ok: true, gallery: lastGallery, addedCount };
}

/** @deprecated Usar streamGenomaGallery */
export async function generateGenomaGallery(
  genoma: GenomaDocument,
  stylePromptVersion?: number,
): Promise<
  | { ok: true; gallery: import("@/lib/genoma/genoma-types").GalleryValue; addedCount: number }
  | { ok: false; message: string }
> {
  return streamGenomaGallery(genoma, stylePromptVersion, () => undefined);
}

export function resetSlotsForCrawl(doc: GenomaDocument): GenomaDocument {
  const next = createEmptyGenoma();
  const slots = Object.fromEntries(
    GENOMA_SLOT_IDS.map((id) => [
      id,
      {
        ...next.slots[id],
        status: "pending" as const,
        updatedAt: NOW(),
      },
    ]),
  ) as GenomaDocument["slots"];

  return {
    ...doc,
    slots,
    compiled: null,
    compiledHash: undefined,
    updatedAt: NOW(),
  };
}

export function pendingSlotIds(doc: GenomaDocument): SlotId[] {
  return GENOMA_SLOT_IDS.filter((id) => {
    const status = doc.slots[id]?.status;
    return status === "pending" || status === "candidates" || status === "needs_user";
  });
}
