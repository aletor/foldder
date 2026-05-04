"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import type { VisualDnaSlot } from "@/lib/brain/visual-dna-slot/types";
import type { BrainVisualImageAnalysis, VisualCapsuleStatus } from "@/app/spaces/project-assets-metadata";
import {
  stableKnowledgeFileUrlFromMaybeUrl,
  tryExtractKnowledgeFilesKeyFromUrl,
} from "@/lib/s3-media-hydrate";

type VisualCapsuleLibraryMeta = {
  id: string;
  status: VisualCapsuleStatus;
  analysisStatus?: "analyzing" | "ready" | "incomplete" | "error";
  lastError?: string;
};

export type VisualDnaSlotsLibraryProps = {
  slots: VisualDnaSlot[];
  busySlotIds: Readonly<Record<string, boolean>>;
  onRegenerate: (slotId: string) => void;
  onDelete: (slotId: string) => void;
  onRename: (slotId: string, label: string) => void;
  analysisStatusBySourceDocumentId?: Readonly<Record<string, BrainVisualImageAnalysis["analysisStatus"] | undefined>>;
  capsuleMetaBySourceDocumentId?: Readonly<Record<string, VisualCapsuleLibraryMeta | undefined>>;
  onSetCapsuleStatus?: (capsuleId: string, status: VisualCapsuleStatus) => void;
  /** true = rail bajo la franja de ingesta (siempre visible). false = bloque ancho en otra sección. */
  belowIngest?: boolean;
};

function tryExtractKnowledgeFilesKeyFromVisualDnaUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  return raw ? tryExtractKnowledgeFilesKeyFromUrl(raw) : null;
}

function visualDnaSlotSourceS3Key(slot: VisualDnaSlot): string | null {
  return slot.sourceS3Path?.trim() || tryExtractKnowledgeFilesKeyFromVisualDnaUrl(slot.sourceImageUrl);
}

function visualDnaSlotMosaicS3Key(slot: VisualDnaSlot): string | null {
  return slot.mosaic.s3Path?.trim() || tryExtractKnowledgeFilesKeyFromVisualDnaUrl(slot.mosaic.imageUrl);
}

function displayVisualDnaImageUrl(signedUrl: string | undefined, rawUrl: string | undefined): string | null {
  return stableKnowledgeFileUrlFromMaybeUrl(rawUrl) || signedUrl?.trim() || null;
}

const VISUAL_DNA_S3_URL_TTL_MS = 4 * 60 * 1000;
const visualDnaPresignedUrlCache = new Map<string, { url: string; expiresAt: number }>();

async function presignVisualDnaS3Key(key: string): Promise<string | null> {
  const clean = key.trim();
  if (!clean) return null;
  const cached = visualDnaPresignedUrlCache.get(clean);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  try {
    const res = await fetch("/api/spaces/s3-presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: [clean] }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { urls?: Record<string, string> };
    const url = json.urls?.[clean]?.trim();
    if (!url) return null;
    visualDnaPresignedUrlCache.set(clean, { url, expiresAt: Date.now() + VISUAL_DNA_S3_URL_TTL_MS });
    return url;
  } catch {
    return null;
  }
}

function resolvePaletteSwatchStyle(colorLabel: string): CSSProperties {
  const t = (colorLabel || "").trim();
  const hexMatch = t.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  if (hexMatch?.[0]) return { backgroundColor: hexMatch[0] };
  const hasCssSupports = typeof window !== "undefined" && typeof window.CSS !== "undefined" && typeof window.CSS.supports === "function";
  const isValidCssColor = hasCssSupports ? window.CSS.supports("color", t) : /^#[0-9A-Fa-f]{6}$/.test(t);
  if (isValidCssColor) return { backgroundColor: t };
  return {
    background:
      "linear-gradient(135deg, rgba(244,244,245,1) 0%, rgba(228,228,231,1) 45%, rgba(212,212,216,1) 100%)",
  };
}

const MISPLACED_PERSON_OR_CLOTHING_RE =
  /\b(hombre|mujer|persona|personas|rostro|cara|barba|sonrisa|sonriendo|cauc[aá]s|modelo|m[uú]sico|cantante|traje|chaqueta|camisa|corbata|vestuario|vestimenta|ropa|cuello|manos?|people|person|man|woman|face|beard|musician|singer|jacket|shirt|suit|clothing|wardrobe|outfit)\b/i;
const OBJECT_SIGNAL_RE =
  /\b(smartphone|tel[eé]fono|m[oó]vil|dispositivo|producto|objeto|pantalla|tarjeta|qr|cadena|anillo|formas? geom[eé]tricas?|guitarra|instrumento|sombrero|botas?|serape|manta|textil|botella|vaso|taza|bolso|bolsa|zapato|zapatilla|bal[oó]n|pelota|device|phone|object|product|screen|chain|ring|guitar|instrument|hat|boots?|blanket|textile|bottle|cup|bag|shoe|ball)\b/i;
const ENV_SIGNAL_RE =
  /\b(entorno|fondo|espacio|interior|exterior|edificio|arquitectura|oficina|sala|pasillo|terminal|aeropuerto|servidor|data\s*center|datacenter|luz|ambiente|paisaje|desierto|cactus|saguaro|calle|fachada|patio|pueblo|muro|pared|suelo|horizonte|environment|background|building|office|server|landscape|desert|street|facade|courtyard|wall)\b/i;
const TEXTURE_SIGNAL_RE =
  /\b(textura|material|superficie|metal|vidrio|tela|tejido|fibra|grano|gradiente|degradado|malla|red|cactus|saguaro|espinas?|estr[ií]as?|serape|manta|rayas?|lana|estuco|terroso|granulada|texture|material|surface|metal|glass|fabric|grain|gradient|spines?|stripes?|woven|stucco)\b/i;

function isGenericVisualSectionFallback(text: string): boolean {
  const key = text.trim().toLowerCase();
  return (
    key.includes("visibles en la sección objetos del mosaico") ||
    key.includes("visibles en la seccion objetos del mosaico") ||
    key.includes("visibles en la sección entornos del mosaico") ||
    key.includes("visibles en la seccion entornos del mosaico") ||
    key.includes("visibles en la sección texturas del mosaico") ||
    key.includes("visibles en la seccion texturas del mosaico")
  );
}

function formatMosaicAdviceForDisplay(slot: VisualDnaSlot, kind: "people" | "objects" | "environments" | "textures"): string | undefined {
  const items =
    kind === "people"
      ? slot.mosaicIntelligence?.people
      : kind === "objects"
        ? slot.mosaicIntelligence?.objects
        : kind === "environments"
          ? slot.mosaicIntelligence?.environments
          : slot.mosaicIntelligence?.textures;
  if (!items?.length) return undefined;
  return items
    .slice(0, 2)
    .map((item, index) => {
      const title = item.title?.trim() ? `${index + 1}. ${item.title.trim()}` : `${index + 1}. Ejemplo`;
      const observed = item.observed?.trim();
      const use = item.creativeUse?.trim();
      return [title, observed, use ? `Uso: ${use}` : ""].filter(Boolean).join(": ");
    })
    .join("\n\n");
}

function slotAssetNotes(section: VisualDnaSlot["people"] | undefined): string | undefined {
  const rows = [section?.same, section?.similar]
    .map((asset, index) => {
      const text = [asset?.description, asset?.prompt].filter(Boolean).join(" · ").trim();
      return text ? `${index + 1}. ${text}` : "";
    })
    .filter(Boolean);
  return rows.length ? rows.join("\n\n") : undefined;
}

function cleanVisualSectionNotes(
  raw: string | undefined,
  kind: "people" | "objects" | "environments" | "textures",
  hasMosaic: boolean,
  backupRaw?: string,
): string | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  if (kind === "people") return text;
  if (!isGenericVisualSectionFallback(text) && (text.includes("Uso:") || /\b1\.\s/.test(text))) return text;
  const tokensFrom = (value?: string) =>
    (value ?? "")
    .split(/[·,;|/]+/u)
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter((x) => !MISPLACED_PERSON_OR_CLOTHING_RE.test(x));
  const filterTokens = (tokens: string[]) => tokens.filter((x) => {
    if (kind === "objects") return OBJECT_SIGNAL_RE.test(x);
    if (kind === "environments") return ENV_SIGNAL_RE.test(x);
    return TEXTURE_SIGNAL_RE.test(x);
  });
  let filtered = filterTokens(tokensFrom(text));
  if (!filtered.length && backupRaw) {
    filtered = filterTokens(tokensFrom(backupRaw));
  }
  if (filtered.length) return Array.from(new Set(filtered)).slice(0, 8).join(" · ");
  if (!hasMosaic) return text;
  if (kind === "objects") return "Objetos, producto y detalles físicos visibles en la sección OBJETOS del mosaico.";
  if (kind === "environments") return "Espacios, luz, escala y contexto visual visibles en la sección ENTORNOS del mosaico.";
  return "Superficies, materiales, grano y tactilidad visual visibles en la sección TEXTURAS del mosaico.";
}

export function VisualDnaSlotsLibrary({
  slots,
  busySlotIds,
  onRegenerate,
  onDelete,
  onRename,
  analysisStatusBySourceDocumentId,
  capsuleMetaBySourceDocumentId,
  onSetCapsuleStatus,
  belowIngest = false,
}: VisualDnaSlotsLibraryProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [signedMosaicUrls, setSignedMosaicUrls] = useState<Record<string, string>>({});
  const [signedSourceUrls, setSignedSourceUrls] = useState<Record<string, string>>({});
  const scrollerRef = useRef<HTMLUListElement>(null);

  const mosaicS3Signature = useMemo(
    () =>
      slots
        .map((slot) => `${slot.id}:${visualDnaSlotMosaicS3Key(slot) ?? ""}`)
        .join("|"),
    [slots],
  );
  const sourceS3Signature = useMemo(
    () =>
      slots
        .map((slot) => `${slot.id}:${visualDnaSlotSourceS3Key(slot) ?? ""}`)
        .join("|"),
    [slots],
  );

  useEffect(() => {
    let cancelled = false;
    const missing = slots
      .map((slot) => ({ id: slot.id, key: visualDnaSlotMosaicS3Key(slot) }))
      .filter((row): row is { id: string; key: string } => Boolean(row.key) && !signedMosaicUrls[row.id]);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (row) => {
        const url = await presignVisualDnaS3Key(row.key);
        return url ? { id: row.id, url } : null;
      }),
    ).then((rows) => {
      if (cancelled) return;
      const valid = rows.filter((row): row is { id: string; url: string } => Boolean(row));
      if (!valid.length) return;
      setSignedMosaicUrls((prev) => {
        const next = { ...prev };
        for (const row of valid) next[row.id] = row.url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mosaicS3Signature, signedMosaicUrls, slots]);

  useEffect(() => {
    let cancelled = false;
    const missing = slots
      .map((slot) => ({ id: slot.id, key: visualDnaSlotSourceS3Key(slot) }))
      .filter((row): row is { id: string; key: string } => Boolean(row.key) && !signedSourceUrls[row.id]);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (row) => {
        const url = await presignVisualDnaS3Key(row.key);
        return url ? { id: row.id, url } : null;
      }),
    ).then((rows) => {
      if (cancelled) return;
      const valid = rows.filter((row): row is { id: string; url: string } => Boolean(row));
      if (!valid.length) return;
      setSignedSourceUrls((prev) => {
        const next = { ...prev };
        for (const row of valid) next[row.id] = row.url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sourceS3Signature, signedSourceUrls, slots]);

  const scrollSlots = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = Math.max(240, (card?.getBoundingClientRect().width ?? 280) + 12);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  const open = slots.find((s) => s.id === openId) ?? null;
  const openAnalysisStatus = open?.sourceDocumentId
    ? analysisStatusBySourceDocumentId?.[open.sourceDocumentId]
    : undefined;
  const openAnalysisReady = !openAnalysisStatus || openAnalysisStatus === "analyzed";
  const openHasMosaic = Boolean(open && (open.mosaic.imageUrl?.trim() || visualDnaSlotMosaicS3Key(open)));

  return (
    <div
      className={`min-w-0 space-y-2 rounded-[5px] border border-violet-200/90 bg-gradient-to-b from-violet-50/60 to-white ${
        belowIngest ? "p-2 sm:p-2.5" : "p-2 sm:p-3"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-800">
            {belowIngest ? "ADN por imagen (esta subida)" : "Biblioteca ADN por imagen"}
          </p>
          <p className="mt-0.5 max-w-3xl text-[10.5px] leading-snug text-zinc-600">
            {belowIngest
              ? "Por cada imagen del pozo con vista previa se genera un slot: fuente a la izquierda y mosaico de sugerencias a la derecha. Desliza horizontalmente o usa las flechas si hay varios."
              : "Cada imagen analizada del pozo puede tener su propio slot con mosaico de sugerencias. Desliza horizontalmente o usa las flechas si hay varios."}
          </p>
        </div>
      </div>
      {slots.length === 0 ? (
        <p className="rounded-[5px] border border-dashed border-violet-200 bg-white/80 px-3 py-2 text-[11px] text-zinc-600">
          {belowIngest
            ? "Tras subir, el pozo puede guardar la imagen en S3: hace falta sesión y API para URL firmada y visión. Cuando exista fila de análisis y URL de vista, verás aquí «fuente · sugerencias». Si no aparece, revisa la consola de red o «Reanalizar imágenes» en Referencias visuales."
            : "Aún no hay slots. Se crean cuando una imagen del pozo ya tiene análisis visual completado y aún no existe una cápsula para ese documento."}
        </p>
      ) : (
        <div className="flex min-w-0 items-stretch gap-1">
          <button
            type="button"
            aria-label="Slots anteriores"
            onClick={() => scrollSlots(-1)}
            className="hidden shrink-0 self-center rounded-[4px] border border-violet-200 bg-white p-1.5 text-violet-800 shadow-sm hover:bg-violet-50 sm:inline-flex"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <ul
            ref={scrollerRef}
            className="flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible scroll-smooth pb-1.5 pt-0.5 [scrollbar-width:thin]"
          >
          {slots.map((slot) => {
            const src = displayVisualDnaImageUrl(
              signedSourceUrls[slot.id],
              slot.sourceImageUrl || visualDnaSlotSourceS3Key(slot) || undefined,
            );
            const mos = displayVisualDnaImageUrl(
              signedMosaicUrls[slot.id],
              slot.mosaic.imageUrl || visualDnaSlotMosaicS3Key(slot) || undefined,
            );
            const busy = Boolean(busySlotIds[slot.id]);
            const analysisStatus = slot.sourceDocumentId
              ? analysisStatusBySourceDocumentId?.[slot.sourceDocumentId]
              : undefined;
            const capsuleMeta = slot.sourceDocumentId ? capsuleMetaBySourceDocumentId?.[slot.sourceDocumentId] : undefined;
            const canGenerateFromSourceOnly = Boolean(capsuleMeta && (src || slot.sourceImageUrl?.trim() || visualDnaSlotSourceS3Key(slot)));
            const analysisReady = !analysisStatus || analysisStatus === "analyzed" || canGenerateFromSourceOnly;
            const statusDetail =
              busy
                ? "Generando tablero ADN…"
                : analysisStatus === "queued"
                  ? "En cola de análisis visual…"
                  : analysisStatus === "pending"
                    ? "Preparando análisis visual…"
                    : analysisStatus === "analyzing"
                      ? "Analizando imagen con visión remota…"
                      : analysisStatus === "failed" && canGenerateFromSourceOnly
                        ? "Se generará desde la imagen fuente."
                      : slot.status === "generating"
                        ? "Generando tablero ADN…"
                        : null;
            return (
              <li
                key={slot.id}
                className="flex w-[min(100%,calc(100vw-5.5rem))] shrink-0 snap-start flex-col rounded-[5px] border border-violet-200/80 bg-white p-2 shadow-sm sm:w-[280px]"
              >
                <button
                  type="button"
                  title={`${slot.label} · doble click para renombrar`}
                  onDoubleClick={() => {
                    const v = window.prompt("Nombre del look visual", slot.label)?.trim();
                    if (v && v !== slot.label) onRename(slot.id, v);
                  }}
                  className="mb-1.5 flex w-full items-center gap-2 rounded-[4px] border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-left"
                  aria-label={`Preview del look visual ${slot.label}`}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-[4px] border border-zinc-200 bg-white">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-zinc-400" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 text-[9px] font-black uppercase tracking-[0.12em] text-violet-800">
                    Cápsula visual
                  </span>
                </button>
                <div className="grid min-h-[112px] grid-cols-2 gap-1.5">
                  <div className="relative min-h-0 overflow-hidden rounded-[4px] border border-zinc-200 bg-zinc-100">
                    <span className="absolute left-1 top-1 z-[1] rounded bg-black/60 px-1 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">
                      Fuente
                    </span>
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="h-full min-h-[104px] w-full object-cover" />
                    ) : (
                      <div className="flex min-h-[104px] w-full items-center justify-center text-zinc-400">
                        <ImageIcon className="h-6 w-6" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="relative min-h-0 overflow-hidden rounded-[4px] border border-zinc-200 bg-zinc-50">
                    <span className="absolute left-1 top-1 z-[1] rounded bg-black/60 px-1 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">
                      Sugerencias
                    </span>
                    {mos ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mos}
                        alt="Tablero ADN sugerido"
                        className="h-full min-h-[104px] w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex min-h-[104px] w-full flex-col items-center justify-center gap-1 px-1 text-center text-[9px] text-zinc-500">
                        {busy ? (
                          <span className="flex items-center gap-1 font-medium text-violet-800">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            {statusDetail ?? "Generando tablero…"}
                          </span>
                        ) : statusDetail ? (
                          <span className="text-violet-800">{statusDetail}</span>
                        ) : slot.status === "failed" ? (
                          <span className="text-rose-700">{slot.lastError?.slice(0, 72) ?? "Error"}</span>
                        ) : (
                          "Aquí aparecerá el mosaico de sugerencias."
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-[8px] text-zinc-500">
                  {new Date(slot.createdAt).toLocaleString("es")} ·{" "}
                  <span className="font-semibold text-zinc-700">{slot.status}</span>
                  {capsuleMeta ? (
                    <span className="ml-1">· cápsula {capsuleMeta.status}</span>
                  ) : null}
                  {slot.status === "stale" ? (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      stale
                    </span>
                  ) : null}
                  {typeof slot.confidence === "number" ? (
                    <span className="ml-1">· {(slot.confidence * 100).toFixed(0)}% conf.</span>
                  ) : null}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {slot.palette.dominantColors.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="h-3.5 w-3.5 rounded-sm border border-zinc-200"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenId(slot.id)}
                    className="rounded-[4px] border border-violet-300 bg-violet-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-900 hover:bg-violet-100"
                  >
                    Ver ADN
                  </button>
                  <button
                    type="button"
                    disabled={busy || !analysisReady}
                    title={!analysisReady ? "Espera a que termine el análisis visual antes de generar el mosaico." : undefined}
                    onClick={() => onRegenerate(slot.id)}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
                    Regenerar
                  </button>
                  {capsuleMeta && onSetCapsuleStatus && capsuleMeta.status !== "generative" && capsuleMeta.status !== "archived" ? (
                    <button
                      type="button"
                      onClick={() => onSetCapsuleStatus(capsuleMeta.id, "generative")}
                      className="rounded-[4px] border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-900 hover:bg-violet-100"
                    >
                      Disponible para generar
                    </button>
                  ) : null}
                  {capsuleMeta && onSetCapsuleStatus ? (
                    capsuleMeta.status === "archived" ? (
                      <button
                        type="button"
                        onClick={() => onSetCapsuleStatus(capsuleMeta.id, "reference")}
                        className="rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
                      >
                        Restaurar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSetCapsuleStatus(capsuleMeta.id, "archived")}
                        className="rounded-[4px] border border-zinc-300 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
                      >
                        Archivar
                      </button>
                    )
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm("¿Eliminar esta cápsula visual? Se retirará de Looks visuales y no volverá a recrearse automáticamente.")) return;
                      onDelete(slot.id);
                      if (openId === slot.id) setOpenId(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Eliminar
                  </button>
                </div>
              </li>
            );
          })}
          </ul>
          <button
            type="button"
            aria-label="Slots siguientes"
            onClick={() => scrollSlots(1)}
            className="hidden shrink-0 self-center rounded-[4px] border border-violet-200 bg-white p-1.5 text-violet-800 shadow-sm hover:bg-violet-50 sm:inline-flex"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-3"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[5px] border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-wide text-zinc-800">ADN visual · {open.label}</p>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-[4px] border border-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[calc(90vh-48px)] overflow-y-auto p-3">
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <p className="mb-1 text-[9px] font-black uppercase text-zinc-500">Imagen fuente</p>
                  <div className="overflow-hidden rounded-[5px] border border-zinc-200 bg-zinc-50">
                    {displayVisualDnaImageUrl(signedSourceUrls[open.id], open.sourceImageUrl || visualDnaSlotSourceS3Key(open) || undefined) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayVisualDnaImageUrl(signedSourceUrls[open.id], open.sourceImageUrl || visualDnaSlotSourceS3Key(open) || undefined) || ""} alt="" className="w-full object-contain" />
                    ) : (
                      <p className="p-4 text-[11px] text-zinc-500">Sin vista previa (sube con data URL o URL https).</p>
                    )}
                  </div>
                </div>
                <div className="lg:col-span-8">
                  <p className="mb-1 text-[9px] font-black uppercase text-zinc-500">Mosaico de sugerencias</p>
                  <div className="overflow-hidden rounded-[5px] border border-zinc-200 bg-zinc-50">
                    {displayVisualDnaImageUrl(signedMosaicUrls[open.id], open.mosaic.imageUrl || visualDnaSlotMosaicS3Key(open) || undefined) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayVisualDnaImageUrl(signedMosaicUrls[open.id], open.mosaic.imageUrl || visualDnaSlotMosaicS3Key(open) || undefined) || ""} alt="Mosaico" className="w-full object-contain" />
                    ) : (
                      <p className="p-4 text-[11px] text-zinc-500">Sin mosaico generado.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Paleta</p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                  {open.palette.dominantColors.map((c) => (
                    <li key={c} className="flex items-center gap-1 text-[10px]">
                        <span className="h-5 w-5 rounded border border-zinc-200" style={resolvePaletteSwatchStyle(c)} />
                        {c}
                    </li>
                  ))}
                  </ul>
                  {open.palette.colorNotes ? (
                    <p className="mt-1 text-[10px] text-zinc-600">{open.palette.colorNotes}</p>
                  ) : null}
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Héroe / conclusión</p>
                  <p className="mt-1 text-[10px] text-zinc-800">{open.hero.description ?? "—"}</p>
                  {open.hero.conclusion ? (
                    <p className="mt-1 text-[10px] text-zinc-600">{open.hero.conclusion}</p>
                  ) : null}
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Personas</p>
                  <p className="whitespace-pre-line text-[10px] text-zinc-700">
                    {formatMosaicAdviceForDisplay(open, "people") ||
                      slotAssetNotes(open.people) ||
                      cleanVisualSectionNotes(open.people.notes, "people", openHasMosaic) ||
                      "—"}
                  </p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Objetos / producto</p>
                  <p className="whitespace-pre-line text-[10px] text-zinc-700">
                    {formatMosaicAdviceForDisplay(open, "objects") ||
                      slotAssetNotes(open.objects) ||
                      cleanVisualSectionNotes(open.objects.notes, "objects", openHasMosaic, open.hero.description) ||
                      "—"}
                  </p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Entornos</p>
                  <p className="whitespace-pre-line text-[10px] text-zinc-700">
                    {formatMosaicAdviceForDisplay(open, "environments") ||
                      slotAssetNotes(open.environments) ||
                      cleanVisualSectionNotes(open.environments.notes, "environments", openHasMosaic) ||
                      "—"}
                  </p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Texturas</p>
                  <p className="whitespace-pre-line text-[10px] text-zinc-700">
                    {formatMosaicAdviceForDisplay(open, "textures") ||
                      slotAssetNotes(open.textures) ||
                      cleanVisualSectionNotes(open.textures.notes, "textures", openHasMosaic) ||
                      "—"}
                  </p>
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2 sm:col-span-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Estilo general</p>
                  <p className="mt-1 text-[10px] text-zinc-800">{open.generalStyle.summary ?? "—"}</p>
                  {open.generalStyle.mood?.length ? (
                    <p className="mt-1 text-[10px] text-zinc-600">Mood: {open.generalStyle.mood.join(", ")}</p>
                  ) : null}
                </section>
                <section className="rounded-[5px] border border-zinc-100 bg-zinc-50/80 p-2 sm:col-span-2">
                  <p className="text-[9px] font-black uppercase text-zinc-600">Safe rules (última generación)</p>
                  <ul className="mt-1 list-inside list-disc text-[10px] text-zinc-700">
                    {(open.lastGenerationPrompts?.safeRulesDigest ?? []).slice(0, 12).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                    {!(open.lastGenerationPrompts?.safeRulesDigest ?? []).length ? <li>—</li> : null}
                  </ul>
                </section>
                {open.mosaic.diagnostics ? (
                  <section className="rounded-[5px] border border-amber-100 bg-amber-50/80 p-2 sm:col-span-2">
                    <p className="text-[9px] font-black uppercase text-amber-900">Diagnóstico / dev</p>
                    <pre className="mt-1 max-h-40 overflow-auto text-[9px] leading-relaxed text-amber-950">
                      {JSON.stringify(open.mosaic.diagnostics, null, 2)}
                    </pre>
                  </section>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                <button
                  type="button"
                  disabled={Boolean(busySlotIds[open.id]) || !openAnalysisReady}
                  title={!openAnalysisReady ? "Espera a que termine el análisis visual antes de regenerar." : undefined}
                  onClick={() => onRegenerate(open.id)}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-zinc-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-zinc-800 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Regenerar este slot
                </button>
                {open.mosaic.prompt ? (
                  <p className="text-[9px] text-zinc-500">
                    Prompt interno guardado ({open.mosaic.prompt.length} caracteres).{" "}
                    <button
                      type="button"
                      className="font-semibold text-violet-700 underline"
                      onClick={() => {
                        void navigator.clipboard.writeText(open.mosaic.prompt ?? "");
                      }}
                    >
                      Copiar
                    </button>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
