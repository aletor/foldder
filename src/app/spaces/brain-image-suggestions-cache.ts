"use client";

import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import type { BrainImageSuggestionDiagnostics } from "@/lib/brain/build-brain-visual-prompt-context";

export type { BrainImageSuggestionDiagnostics };

export type BrainImageSuggestion = {
  id: string;
  label: string;
  prompt: string;
  src: string;
  visualDiagnostics?: BrainImageSuggestionDiagnostics;
};

export type BrainImageSuggestionEntry = {
  loading: boolean;
  tried: boolean;
  suggestions: BrainImageSuggestion[];
  error: string | null;
  updatedAt: number;
};

type EnsureArgs = {
  key: string;
  plans: Array<{ id: string; label: string; prompt: string; visualDiagnostics?: BrainImageSuggestionDiagnostics }>;
  aspectRatio: string;
  logoRefs: string[];
  force?: boolean;
};

const STORAGE_KEY = "foldder_brain_image_suggestions_v1";
const FORCE_LOCK_KEY = "foldder_brain_image_suggestions_force_lock_v1";
const LEGACY_CLEANUP_MARK_KEY = "foldder_brain_image_suggestions_legacy_cleanup_v1";
const FORCE_COOLDOWN_MS = 45_000;
const PRESIGN_REFRESH_COOLDOWN_MS = 60_000;
const cache = new Map<string, BrainImageSuggestionEntry>();
const inFlight = new Map<string, Promise<BrainImageSuggestionEntry>>();
const forceLockUntil = new Map<string, number>();
const presignRefreshUntil = new Map<string, number>();
let hydrated = false;

function isScopedBrainKey(key: string): boolean {
  return /^scope:[^:]+::.+::.+$/.test((key || "").trim());
}

function pruneLegacyUnscopedEntries(raw: string | null): { value: Record<string, unknown>; changed: boolean } {
  if (!raw) return { value: {}, changed: false };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { value: {}, changed: true };
    const next: Record<string, unknown> = {};
    let changed = false;
    for (const [k, v] of Object.entries(parsed)) {
      if (!isScopedBrainKey(k)) {
        changed = true;
        continue;
      }
      next[k] = v;
    }
    return { value: next, changed };
  } catch {
    return { value: {}, changed: true };
  }
}

export function cleanupLegacyUnscopedBrainSuggestionStorageOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(LEGACY_CLEANUP_MARK_KEY) === "done") return;
  } catch {
    return;
  }

  try {
    const rawEntries = window.localStorage.getItem(STORAGE_KEY);
    const prunedEntries = pruneLegacyUnscopedEntries(rawEntries);
    if (prunedEntries.changed) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prunedEntries.value));
    }
  } catch {
    // ignore legacy cleanup failures
  }

  try {
    const rawLocks = window.localStorage.getItem(FORCE_LOCK_KEY);
    const prunedLocks = pruneLegacyUnscopedEntries(rawLocks);
    if (prunedLocks.changed) {
      window.localStorage.setItem(FORCE_LOCK_KEY, JSON.stringify(prunedLocks.value));
    }
  } catch {
    // ignore legacy cleanup failures
  }

  // Barrido de claves legacy antiguas sin scope en localStorage.
  try {
    const removeKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const normalized = k.trim();
      if (
        normalized.startsWith("foldder_brain_image_suggestions::") ||
        normalized.startsWith("foldder_brain_image_suggestion::") ||
        normalized.startsWith("brain_image_suggestions::")
      ) {
        removeKeys.push(k);
      }
    }
    for (const k of removeKeys) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // ignore legacy cleanup failures
  }

  try {
    window.localStorage.setItem(LEGACY_CLEANUP_MARK_KEY, "done");
  } catch {
    // ignore marker failures
  }
}

function emitUpdate(key: string, entry: BrainImageSuggestionEntry) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("foldder-brain-image-suggestions-updated", {
      detail: { key, entry },
    }),
  );
}

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  cleanupLegacyUnscopedBrainSuggestionStorageOnce();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, BrainImageSuggestionEntry>;
    for (const [key, val] of Object.entries(parsed)) {
      if (!val || typeof val !== "object") continue;
      const rawSuggestions = Array.isArray(val.suggestions) ? val.suggestions : [];
      const normalizedSuggestions: BrainImageSuggestion[] = rawSuggestions
        .map((item, idx) => normalizeSuggestion(item, idx))
        .filter((x): x is BrainImageSuggestion => !!x);
      cache.set(key, {
        loading: false,
        tried: !!val.tried,
        suggestions: normalizedSuggestions,
        error: typeof val.error === "string" ? val.error : null,
        updatedAt: Number.isFinite(val.updatedAt) ? Number(val.updatedAt) : Date.now(),
      });
    }
  } catch {
    // ignore storage corruption
  }
  try {
    const rawLocks = window.localStorage.getItem(FORCE_LOCK_KEY);
    if (!rawLocks) return;
    const parsedLocks = JSON.parse(rawLocks) as Record<string, number>;
    const now = Date.now();
    for (const [key, lock] of Object.entries(parsedLocks)) {
      if (!Number.isFinite(lock)) continue;
      if (Number(lock) <= now) continue;
      forceLockUntil.set(key, Number(lock));
    }
  } catch {
    // ignore lock storage corruption
  }
}

function normalizeSuggestion(item: unknown, index: number): BrainImageSuggestion | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const rawSrc =
    typeof row.src === "string"
      ? row.src
      : typeof row.url === "string"
        ? row.url
        : typeof row.output === "string"
          ? row.output
          : "";
  const src = rawSrc.trim();
  if (!isRenderableImageSrc(src)) return null;
  const vdRaw = row.visualDiagnostics;
  let visualDiagnostics: BrainImageSuggestionDiagnostics | undefined;
  if (vdRaw && typeof vdRaw === "object") {
    const v = vdRaw as Record<string, unknown>;
    const vsu = v.visualSourcesUsed;
    visualDiagnostics = {
      finalPromptUsed: typeof v.finalPromptUsed === "string" ? v.finalPromptUsed : "",
      visualSourcesUsed:
        vsu && typeof vsu === "object"
          ? {
              confirmedUserVisualDna: !!(vsu as Record<string, unknown>).confirmedUserVisualDna,
              coreVisualReferenceAnalysis: !!(vsu as Record<string, unknown>).coreVisualReferenceAnalysis,
              projectVisualReferenceAnalysis: !!(vsu as Record<string, unknown>).projectVisualReferenceAnalysis,
              aggregatedPatternsTrusted: !!(vsu as Record<string, unknown>).aggregatedPatternsTrusted,
              visionDerivedVisualStyleSlots: !!(vsu as Record<string, unknown>).visionDerivedVisualStyleSlots,
              secondaryBrandStrategyText: !!(vsu as Record<string, unknown>).secondaryBrandStrategyText,
            }
          : {
              confirmedUserVisualDna: false,
              coreVisualReferenceAnalysis: false,
              projectVisualReferenceAnalysis: false,
              aggregatedPatternsTrusted: false,
              visionDerivedVisualStyleSlots: false,
              secondaryBrandStrategyText: false,
            },
      visualReferenceAnalysisRealCount:
        typeof v.visualReferenceAnalysisRealCount === "number" ? v.visualReferenceAnalysisRealCount : 0,
      confirmedVisualDnaUsed: !!v.confirmedVisualDnaUsed,
      patternSummaryUsed: !!v.patternSummaryUsed,
      fallbackDefaultUsed: !!v.fallbackDefaultUsed,
      textOnlyGeneration: !!v.textOnlyGeneration,
      secondaryBrandProductCopy: !!v.secondaryBrandProductCopy,
      ...(typeof v.familyUsed === "string" ? { familyUsed: v.familyUsed as BrainImageSuggestionDiagnostics["familyUsed"] } : {}),
      ...(typeof v.varietyMode === "string" ? { varietyMode: v.varietyMode as BrainImageSuggestionDiagnostics["varietyMode"] } : {}),
      ...(typeof v.repeatedElementsAvoided === "boolean" ? { repeatedElementsAvoided: v.repeatedElementsAvoided } : {}),
      ...(v.chosenVariationAxes && typeof v.chosenVariationAxes === "object"
        ? { chosenVariationAxes: v.chosenVariationAxes as BrainImageSuggestionDiagnostics["chosenVariationAxes"] }
        : {}),
      ...(Array.isArray(v.coreLockedFields) ? { coreLockedFields: v.coreLockedFields as BrainImageSuggestionDiagnostics["coreLockedFields"] } : {}),
      ...(typeof v.visualTerritory === "string"
        ? { visualTerritory: v.visualTerritory as BrainImageSuggestionDiagnostics["visualTerritory"] }
        : {}),
      ...(typeof v.axisPoolUsed === "string" ? { axisPoolUsed: v.axisPoolUsed } : {}),
      ...(typeof v.excludedAxesNote === "string" ? { excludedAxesNote: v.excludedAxesNote } : {}),
      ...(Array.isArray(v.incompatibleAxesWarnings)
        ? { incompatibleAxesWarnings: v.incompatibleAxesWarnings as string[] }
        : {}),
      ...(typeof v.corporateContextTruncatedForVisual === "boolean"
        ? { corporateContextTruncatedForVisual: v.corporateContextTruncatedForVisual }
        : {}),
      ...(typeof v.variationValidationAttempts === "number"
        ? { variationValidationAttempts: v.variationValidationAttempts }
        : {}),
      ...(typeof v.dominantPeopleSignals === "string" ? { dominantPeopleSignals: v.dominantPeopleSignals } : {}),
      ...(typeof v.dominantSpaceSignals === "string" ? { dominantSpaceSignals: v.dominantSpaceSignals } : {}),
      ...(typeof v.dominantClothingSignals === "string" ? { dominantClothingSignals: v.dominantClothingSignals } : {}),
      ...(typeof v.dominantObjectSignals === "string" ? { dominantObjectSignals: v.dominantObjectSignals } : {}),
      ...(typeof v.dominantTextureSignals === "string" ? { dominantTextureSignals: v.dominantTextureSignals } : {}),
      ...(typeof v.dominantLightingSignals === "string" ? { dominantLightingSignals: v.dominantLightingSignals } : {}),
      ...(typeof v.dominantCompositionSignals === "string"
        ? { dominantCompositionSignals: v.dominantCompositionSignals }
        : {}),
      ...(typeof v.dominantCulturalSignals === "string" ? { dominantCulturalSignals: v.dominantCulturalSignals } : {}),
      ...(typeof v.dominantActivitySignals === "string" ? { dominantActivitySignals: v.dominantActivitySignals } : {}),
      ...(Array.isArray(v.dangerousWordsRemoved) ? { dangerousWordsRemoved: v.dangerousWordsRemoved as string[] } : {}),
      ...(typeof v.promptLength === "number" ? { promptLength: v.promptLength } : {}),
      ...(Array.isArray(v.dangerousWordsRemovedInPrompt)
        ? { dangerousWordsRemovedInPrompt: v.dangerousWordsRemovedInPrompt as string[] }
        : {}),
      ...(typeof v.corporateContextUsed === "boolean" ? { corporateContextUsed: v.corporateContextUsed } : {}),
      ...(typeof v.corporateContextLength === "number" ? { corporateContextLength: v.corporateContextLength } : {}),
      ...(typeof v.numberOfRequiredObjects === "number" ? { numberOfRequiredObjects: v.numberOfRequiredObjects } : {}),
      ...(typeof v.variationFocus === "string" ? { variationFocus: v.variationFocus } : {}),
      ...(Array.isArray(v.contaminationWarnings)
        ? { contaminationWarnings: v.contaminationWarnings as string[] }
        : {}),
      ...(typeof v.finalPromptWasRewritten === "boolean" ? { finalPromptWasRewritten: v.finalPromptWasRewritten } : {}),
      ...(typeof v.promptBeforeSanitize === "string" ? { promptBeforeSanitize: v.promptBeforeSanitize } : {}),
      ...(Array.isArray(v.visualAvoidUsed) ? { visualAvoidUsed: v.visualAvoidUsed as string[] } : {}),
    };
  }
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : `brain-img-${index + 1}`,
    label: typeof row.label === "string" ? row.label : "Sugerencia",
    prompt: typeof row.prompt === "string" ? row.prompt : "",
    src,
    ...(visualDiagnostics ? { visualDiagnostics } : {}),
  };
}

function isRenderableImageSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("data:image/")) return true;
  return /^https?:\/\//i.test(src);
}

async function refreshEntryPresignedUrls(
  key: string,
  entry: BrainImageSuggestionEntry,
): Promise<BrainImageSuggestionEntry> {
  if (!entry.suggestions.length || typeof window === "undefined") return entry;
  const now = Date.now();
  const lockUntil = presignRefreshUntil.get(key) ?? 0;
  if (lockUntil > now) return entry;
  presignRefreshUntil.set(key, now + PRESIGN_REFRESH_COOLDOWN_MS);

  const s3Keys = Array.from(
    new Set(
      entry.suggestions
        .map((s) => tryExtractKnowledgeFilesKeyFromUrl(s.src))
        .filter((k): k is string => !!k),
    ),
  );
  if (s3Keys.length === 0) return entry;

  try {
    const res = await fetch("/api/spaces/s3-presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: s3Keys }),
    });
    if (!res.ok) return entry;
    const json = (await res.json().catch(() => ({}))) as { urls?: Record<string, string> };
    const urls = json.urls;
    if (!urls || typeof urls !== "object") return entry;

    let changed = false;
    const nextSuggestions = entry.suggestions.map((s) => {
      const k = tryExtractKnowledgeFilesKeyFromUrl(s.src);
      if (!k || !urls[k] || urls[k] === s.src) return s;
      changed = true;
      return { ...s, src: urls[k] };
    });
    if (!changed) return entry;
    const next: BrainImageSuggestionEntry = {
      ...entry,
      suggestions: nextSuggestions,
      updatedAt: Date.now(),
    };
    setEntry(key, next);
    return next;
  } catch {
    return entry;
  }
}

function persistToStorage() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, BrainImageSuggestionEntry> = {};
    for (const [k, v] of cache.entries()) {
      obj[k] = v;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // storage full or unavailable
  }
  try {
    const now = Date.now();
    const locksObj: Record<string, number> = {};
    for (const [k, until] of forceLockUntil.entries()) {
      if (until > now) locksObj[k] = until;
    }
    window.localStorage.setItem(FORCE_LOCK_KEY, JSON.stringify(locksObj));
  } catch {
    // ignore lock persistence failures
  }
}

function setEntry(key: string, entry: BrainImageSuggestionEntry) {
  cache.set(key, entry);
  persistToStorage();
  emitUpdate(key, entry);
}

async function callGeminiGenerate(prompt: string, refs: string[], aspectRatio: string): Promise<string> {
  const resp = await fetch("/api/gemini/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      images: refs,
      model: "flash31",
      resolution: "0.5k",
      aspect_ratio: aspectRatio,
    }),
  });
  const json = (await resp.json().catch(() => ({}))) as {
    output?: string;
    error?: string;
    details?: string;
  };
  if (!resp.ok || !json?.output) {
    throw new Error(json?.error || json?.details || `HTTP ${resp.status}`);
  }
  return json.output;
}

async function runGeneration(args: EnsureArgs): Promise<BrainImageSuggestionEntry> {
  const created: BrainImageSuggestion[] = [];
  let lastErrorDetail: string | null = null;

  for (const plan of args.plans.slice(0, 2)) {
    const attempts: Array<{ refs: string[]; prompt: string }> =
      args.logoRefs.length > 0
        ? [
            { refs: args.logoRefs, prompt: plan.prompt },
            {
              refs: [],
              prompt: `${plan.prompt} Prioriza paleta y estilo de marca aunque no haya logo de referencia.`,
            },
          ]
        : [{ refs: [], prompt: plan.prompt }];

    let success = false;
    for (const attempt of attempts) {
      try {
        const src = await callGeminiGenerate(attempt.prompt, attempt.refs, args.aspectRatio);
        const diag = plan.visualDiagnostics
          ? {
              ...plan.visualDiagnostics,
              finalPromptUsed: attempt.prompt,
            }
          : undefined;
        created.push({ id: plan.id, label: plan.label, prompt: attempt.prompt, src, ...(diag ? { visualDiagnostics: diag } : {}) });
        success = true;
        break;
      } catch (err) {
        lastErrorDetail = err instanceof Error ? err.message : String(err);
      }
    }
    if (!success) continue;
  }

  const error = created.length === 0 ? "No se pudo generar sugerencia visual con Brain." : null;
  return {
    loading: false,
    tried: true,
    suggestions: created,
    error: error
      ? (lastErrorDetail ? `${error} (${lastErrorDetail.slice(0, 140)})` : error)
      : null,
    updatedAt: Date.now(),
  };
}

const DEFAULT_SCOPE_ID = "__local__";

function normalizeScopeId(scopeId?: string | null): string {
  const raw = (scopeId ?? "").trim();
  if (!raw) return DEFAULT_SCOPE_ID;
  return raw.replace(/[^\w.-]+/g, "_").slice(0, 120) || DEFAULT_SCOPE_ID;
}

function scopePrefix(scopeId?: string | null): string {
  return `scope:${normalizeScopeId(scopeId)}::`;
}

function fnv1a32Hex(parts: readonly string[]): string {
  const raw = parts.join("\n---\n");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Huella del texto final de planes (tests / depuración); no usar sola como clave de caché (incluye rotación de variedad). */
export function fingerprintBrainImagePromptPlans(
  plans: ReadonlyArray<{ id: string; prompt: string }>,
): string {
  if (!plans.length) return "empty";
  return fnv1a32Hex(plans.map((p) => `${String(p.id)}\n${String(p.prompt)}`));
}

/**
 * Huella estable para clave de caché de sugerencias: ADN visual + contexto de página + opciones de generación.
 * Debe ignorar el historial de combinaciones de variedad y cambios de identidad de arrays por re-render.
 */
export function fingerprintBrainImageSuggestionStablePayload(parts: readonly string[]): string {
  if (!parts.length) return "empty";
  return fnv1a32Hex(parts);
}

export function brainSuggestionsKeyForField(
  scopeId: string | null | undefined,
  nodeId: string,
  fieldId: string,
  promptPlansFingerprint?: string | null,
): string {
  const fp = (promptPlansFingerprint ?? "").trim();
  const safeFp = fp.replace(/[^\w-]+/g, "_").slice(0, 40);
  const tail = safeFp && safeFp !== "empty" ? `${nodeId}::${fieldId}::p_${safeFp}` : `${nodeId}::${fieldId}`;
  return `${scopePrefix(scopeId)}${tail}`;
}

export function getBrainImageSuggestionEntry(key: string): BrainImageSuggestionEntry | undefined {
  hydrateFromStorage();
  return cache.get(key);
}

export function listAllBrainGeneratedSuggestionUrls(scopeId?: string | null): string[] {
  hydrateFromStorage();
  const out: string[] = [];
  const seen = new Set<string>();
  const prefix = scopePrefix(scopeId);
  for (const [k, entry] of cache.entries()) {
    if (!k.startsWith(prefix)) continue;
    for (const s of entry.suggestions) {
      const u = (s.src || "").trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

export function getBrainImageSuggestionForceCooldownMs(key: string): number {
  hydrateFromStorage();
  const now = Date.now();
  const until = forceLockUntil.get(key) ?? 0;
  if (until <= now) {
    if (until > 0) {
      forceLockUntil.delete(key);
      persistToStorage();
    }
    return 0;
  }
  return until - now;
}

export function ensureBrainImageSuggestions(args: EnsureArgs): Promise<BrainImageSuggestionEntry> {
  hydrateFromStorage();
  const existing = cache.get(args.key);
  if (!args.force && existing?.tried && !existing.loading) {
    const hasRenderable = existing.suggestions.some((s) => isRenderableImageSrc((s.src || "").trim()));
    if (!hasRenderable) {
      // Cache corrupta o antigua: permitimos regeneración sin fuerza explícita.
    } else {
      return refreshEntryPresignedUrls(args.key, existing);
    }
  }

  if (!args.force) {
    const running = inFlight.get(args.key);
    if (running) return running;
  }
  if (args.force) {
    const waitMs = getBrainImageSuggestionForceCooldownMs(args.key);
    if (waitMs > 0) {
      const base: BrainImageSuggestionEntry = existing ?? {
        loading: false,
        tried: true,
        suggestions: [],
        error: null,
        updatedAt: Date.now(),
      };
      const blockedEntry: BrainImageSuggestionEntry = {
        ...base,
        loading: false,
        error: `Espera ${Math.ceil(waitMs / 1000)}s antes de solicitar otra imagen.`,
        updatedAt: Date.now(),
      };
      setEntry(args.key, blockedEntry);
      return Promise.resolve(blockedEntry);
    }
    forceLockUntil.set(args.key, Date.now() + FORCE_COOLDOWN_MS);
    persistToStorage();
  }

  const loadingEntry: BrainImageSuggestionEntry = {
    loading: true,
    tried: true,
    suggestions: args.force ? [] : existing?.suggestions ?? [],
    error: null,
    updatedAt: Date.now(),
  };
  setEntry(args.key, loadingEntry);

  const p = runGeneration(args)
    .then((entry) => {
      setEntry(args.key, entry);
      inFlight.delete(args.key);
      return entry;
    })
    .catch((err) => {
      const fallback: BrainImageSuggestionEntry = {
        loading: false,
        tried: true,
        suggestions: [],
        error: err instanceof Error ? err.message : "No se pudo generar sugerencia visual con Brain.",
        updatedAt: Date.now(),
      };
      setEntry(args.key, fallback);
      inFlight.delete(args.key);
      return fallback;
    });

  inFlight.set(args.key, p);
  return p;
}
