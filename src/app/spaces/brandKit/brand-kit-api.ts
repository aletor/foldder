import type { GalleryValue, BrandKitDocument } from "@/lib/brandkit/brand-kit-types";
import { applyGalleryMediaMirrors, externalGalleryMediaUrls } from "@/lib/brandkit/brand-kit-gallery-media";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import { mergeSlotStreamPatch } from "@/lib/brandkit/brand-kit-stream-merge";
import { setSourceAuthoritative } from "@/lib/brandkit/brand-kit-source-policy";
import { normalizeBrandKitUrlInput } from "@/lib/brandkit/crawl/url-utils";
import type { BrandKitStreamEvent } from "@/lib/brandkit/crawl/types";
import { compileBrandKit } from "@/lib/brandkit/compile-brand-kit";
import { confirmBrandKitV2IngestCost } from "@/lib/brandkit/ingest/brand-kit-ingest-preflight";
import {
  fetchPostWithWalletPreflight,
  FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER,
  notifyWalletFromApiResponse,
} from "@/lib/wallet-fetch-preflight";

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

export function applyBrandKitStreamEvent(
  doc: BrandKitDocument,
  event: BrandKitStreamEvent,
  options?: { respectLocks?: boolean },
): BrandKitDocument {
  if (event.type === "brand_name") {
    if (options?.respectLocks && doc.brandName?.provenance?.type === "user_input") {
      return doc;
    }
    return {
      ...doc,
      brandName: { value: event.value, provenance: event.provenance },
      updatedAt: NOW(),
    };
  }

  if (event.type === "source_added") {
    return {
      ...doc,
      sources: [
        ...doc.sources,
        {
          kind: event.kind,
          ref: event.ref,
          ts: NOW(),
          contentSha256: event.contentSha256,
          pdfStorageKey: event.pdfStorageKey,
          pageCount: event.pageCount,
        },
      ],
      updatedAt: NOW(),
    };
  }

  if (event.type === "slot_update") {
    const current = doc.slots[event.slotId] ?? createEmptyBrandKit().slots[event.slotId];
    const merged = options?.respectLocks
      ? mergeSlotStreamPatch(event.slotId, current, event.patch, {
          respectLocks: true,
          sources: doc.sources,
        })
      : {
          ...current,
          id: event.slotId,
          ...event.patch,
          updatedAt: event.patch.updatedAt ?? NOW(),
        };
    if (!merged) return doc;
    return {
      ...doc,
      slots: { ...doc.slots, [event.slotId]: merged },
      updatedAt: NOW(),
    };
  }

  return doc;
}

export function applySourceAuthoritative(
  doc: BrandKitDocument,
  sourceRef: string,
  authoritative: boolean,
): BrandKitDocument {
  return setSourceAuthoritative(doc, sourceRef, authoritative);
}

export async function applyBrandKitCompile(doc: BrandKitDocument): Promise<BrandKitDocument> {
  const { compiled, compiledHash } = await compileBrandKit(doc);
  return { ...doc, compiled, compiledHash, updatedAt: new Date().toISOString() };
}

async function consumeNdjsonStream(
  res: Response,
  onEvent: (event: BrandKitStreamEvent) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sourceError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as BrandKitStreamEvent;
      onEvent(event);
      if (event.type === "error") return { ok: false, message: event.message };
      if (event.type === "source_error") sourceError = event.message;
    }
  }

  if (sourceError) return { ok: false, message: sourceError };
  return { ok: true };
}

export async function streamBrandKitCrawl(
  url: string,
  onEvent: (event: BrandKitStreamEvent) => void,
  options?: { enableLlm?: boolean },
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const normalized = normalizeBrandKitUrlInput(url);
  if (!normalized.ok) return { ok: false, message: normalized.message };

  const enableLlm = options?.enableLlm !== false;
  const res = await fetch("/api/spaces/brandKit/crawl", {
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

export async function streamBrandKitIngest(
  files: File[],
  onEvent: (event: BrandKitStreamEvent) => void,
  options?: { enableLlm?: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!files.length) return { ok: false, message: "No hay archivos" };

  const enableLlm = options?.enableLlm !== false;
  const costDecision = await confirmBrandKitV2IngestCost({ files, enableLlm, language: "es" });
  if (!costDecision.allowed) {
    return {
      ok: false,
      message:
        costDecision.reason === "insufficient_balance"
          ? "Saldo insuficiente para esta ingesta."
          : "Ingesta cancelada.",
    };
  }

  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (!enableLlm) form.append("enableLlm", "false");

  const res = await fetch("/api/spaces/brandKit/ingest", {
    method: "POST",
    body: form,
    headers: { [FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER]: "1" },
  });

  if (!res.ok || !res.body) {
    await notifyWalletFromApiResponse(res);
    return { ok: false, message: await parseApiError(res) };
  }

  const streamed = await consumeNdjsonStream(res, onEvent);
  if (streamed.ok) await notifyWalletFromApiResponse(res);
  return streamed;
}

export type BrandKitGalleryGenerateProgress = {
  index: number;
  total: number;
  category: import("@/lib/brandkit/brand-kit-gallery-plan").GalleryGenerateCategory | null;
  categoryLabel: string;
  message: string;
  toneExplanation?: string;
  completedItems: import("@/lib/brandkit/brand-kit-types").GalleryValue["generated"];
};

export async function streamBrandKitGallery(
  brandKit: BrandKitDocument,
  stylePromptVersion: number | undefined,
  onEvent: (event: import("@/lib/brandkit/run-gallery-generate").BrandKitGalleryStreamEvent) => void,
  options?: {
    category?: import("@/lib/brandkit/brand-kit-gallery-plan").GalleryGenerateCategory;
    variantIndex?: number;
  },
): Promise<
  | { ok: true; gallery: import("@/lib/brandkit/brand-kit-types").GalleryValue; addedCount: number }
  | { ok: false; message: string }
> {
  const res = await fetchPostWithWalletPreflight(
    "/api/spaces/brandKit/gallery/generate",
    { brandKit, stylePromptVersion, category: options?.category, variantIndex: options?.variantIndex },
    { headers: { Accept: "application/x-ndjson" } },
  );
  await notifyWalletFromApiResponse(res);

  if (!res.ok || !res.body) {
    return { ok: false, message: await parseApiError(res) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastGallery: import("@/lib/brandkit/brand-kit-types").GalleryValue | null = null;
  let addedCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as import("@/lib/brandkit/run-gallery-generate").BrandKitGalleryStreamEvent;
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

export async function analyzeBrandKitGalleryBriefs(
  brandKit: BrandKitDocument,
): Promise<{ ok: true; gallery: GalleryValue } | { ok: false; message: string }> {
  const res = await fetchPostWithWalletPreflight("/api/spaces/brandKit/gallery/analyze-briefs", { brandKit });
  await notifyWalletFromApiResponse(res);
  if (!res.ok) return { ok: false, message: await parseApiError(res) };
  const body = (await res.json()) as { gallery?: GalleryValue };
  if (!body.gallery) return { ok: false, message: "Sin briefs de galería" };
  return { ok: true, gallery: body.gallery };
}

/** Punto de partida para añadir una fuente sin borrar el ADN existente. */
export function prepareDocForAdditiveSource(doc: BrandKitDocument): BrandKitDocument {
  return { ...doc, updatedAt: NOW() };
}

/** Persiste en S3 las imágenes de cosecha que siguen siendo URLs externas. */
export async function hydrateBrandKitGalleryMedia(doc: BrandKitDocument): Promise<BrandKitDocument> {
  const gallery = doc.slots.gallery?.value as GalleryValue | undefined;
  const urls = externalGalleryMediaUrls(gallery);
  if (!urls.length) return doc;

  try {
    const res = await fetch("/api/spaces/brandKit/hydrate-gallery", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (!res.ok) return doc;
    const body = (await res.json()) as { mirrored?: Record<string, string> };
    if (!body.mirrored || !Object.keys(body.mirrored).length) return doc;

    const nextGallery = applyGalleryMediaMirrors(gallery!, body.mirrored);
    if (nextGallery === gallery) return doc;

    return {
      ...doc,
      slots: {
        ...doc.slots,
        gallery: {
          ...doc.slots.gallery,
          value: nextGallery,
          updatedAt: NOW(),
        },
      },
      updatedAt: NOW(),
    };
  } catch {
    return doc;
  }
}
