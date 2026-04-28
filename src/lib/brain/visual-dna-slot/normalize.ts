import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import type { BrainVisualAssetRef } from "@/lib/brain/brain-visual-analysis";
import { getBrainVersion } from "@/lib/brain/brain-meta";
import type { BrainMeta } from "@/lib/brain/brain-creative-memory-types";
import type {
  VisualDnaSlot,
  VisualDnaSlotAsset,
  VisualDnaSlotAnalysisOrigin,
  VisualDnaSlotMosaicProvider,
  VisualDnaSlotStatus,
} from "./types";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `vds_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function pickStr(v: unknown, max = 8000): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function normalizeAsset(raw: unknown): VisualDnaSlotAsset | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const role = o.role === "same" || o.role === "similar" ? o.role : undefined;
  const out: VisualDnaSlotAsset = {};
  const iu = pickStr(o.imageUrl, 120000);
  const sp = pickStr(o.s3Path, 2000);
  const pr = pickStr(o.prompt, 12000);
  const ds = pickStr(o.description, 8000);
  if (iu) out.imageUrl = iu;
  if (sp) out.s3Path = sp;
  if (pr) out.prompt = pr;
  if (ds) out.description = ds;
  if (role) out.role = role;
  if (typeof o.confidence === "number" && Number.isFinite(o.confidence)) out.confidence = o.confidence;
  return Object.keys(out).length ? out : undefined;
}

function normalizeSection(raw: unknown): {
  same?: VisualDnaSlotAsset;
  similar?: VisualDnaSlotAsset;
  notes?: string;
} {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    same: normalizeAsset(o.same),
    similar: normalizeAsset(o.similar),
    notes: pickStr(o.notes, 4000),
  };
}

const STATUS: readonly VisualDnaSlotStatus[] = ["pending", "generating", "ready", "failed", "stale"];
const ORIGIN: readonly VisualDnaSlotAnalysisOrigin[] = [
  "remote_ai",
  "local_heuristic",
  "fallback",
  "mock",
  "manual",
];
const PROVIDER: readonly VisualDnaSlotMosaicProvider[] = [
  "nano_banana",
  "gemini",
  "openai",
  "manual",
  "unknown",
];

export function normalizeVisualDnaSlot(raw: unknown): VisualDnaSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = pickStr(o.id, 120) ?? newId();
  const label = pickStr(o.label, 240) ?? "ADN visual";
  const createdAt = pickStr(o.createdAt, 40) ?? new Date().toISOString();
  const st = STATUS.includes(o.status as VisualDnaSlotStatus) ? (o.status as VisualDnaSlotStatus) : "pending";
  const paletteIn = o.palette && typeof o.palette === "object" ? (o.palette as Record<string, unknown>) : {};
  const dominantColors = Array.isArray(paletteIn.dominantColors)
    ? paletteIn.dominantColors.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 12)
    : [];
  const heroIn = o.hero && typeof o.hero === "object" ? (o.hero as Record<string, unknown>) : {};
  const mosaicIn = o.mosaic && typeof o.mosaic === "object" ? (o.mosaic as Record<string, unknown>) : {};
  const genIn =
    o.lastGenerationPrompts && typeof o.lastGenerationPrompts === "object"
      ? (o.lastGenerationPrompts as Record<string, unknown>)
      : {};
  const generalIn = o.generalStyle && typeof o.generalStyle === "object" ? (o.generalStyle as Record<string, unknown>) : {};

  const mosaic: VisualDnaSlot["mosaic"] = {};
  const miu = pickStr(mosaicIn.imageUrl, 120000);
  const msp = pickStr(mosaicIn.s3Path, 2000);
  const mp = pickStr(mosaicIn.prompt, 12000);
  if (miu) mosaic.imageUrl = miu;
  if (msp) mosaic.s3Path = msp;
  if (mp) mosaic.prompt = mp;
  if (PROVIDER.includes(mosaicIn.provider as VisualDnaSlotMosaicProvider)) {
    mosaic.provider = mosaicIn.provider as VisualDnaSlotMosaicProvider;
  }
  if ("diagnostics" in mosaicIn) mosaic.diagnostics = mosaicIn.diagnostics;

  const slot: VisualDnaSlot = {
    id,
    label,
    createdAt,
    ...(pickStr(o.updatedAt, 40) ? { updatedAt: o.updatedAt as string } : {}),
    ...(typeof o.brainVersion === "number" && Number.isFinite(o.brainVersion) ? { brainVersion: o.brainVersion } : {}),
    ...(pickStr(o.sourceImageId, 120) ? { sourceImageId: o.sourceImageId as string } : {}),
    ...(pickStr(o.sourceDocumentId, 120) ? { sourceDocumentId: o.sourceDocumentId as string } : {}),
    ...(pickStr(o.sourceImageUrl, 120000) ? { sourceImageUrl: o.sourceImageUrl as string } : {}),
    ...(pickStr(o.sourceS3Path, 2000) ? { sourceS3Path: o.sourceS3Path as string } : {}),
    status: st,
    palette: {
      dominantColors,
      ...(pickStr(paletteIn.colorNotes, 2000) ? { colorNotes: paletteIn.colorNotes as string } : {}),
    },
    hero: {
      ...(pickStr(heroIn.imageUrl, 120000) ? { imageUrl: heroIn.imageUrl as string } : {}),
      ...(pickStr(heroIn.prompt, 12000) ? { prompt: heroIn.prompt as string } : {}),
      ...(pickStr(heroIn.description, 8000) ? { description: heroIn.description as string } : {}),
      ...(pickStr(heroIn.conclusion, 8000) ? { conclusion: heroIn.conclusion as string } : {}),
    },
    people: normalizeSection(o.people),
    objects: normalizeSection(o.objects),
    environments: normalizeSection(o.environments),
    textures: normalizeSection(o.textures),
    generalStyle: {
      ...(pickStr(generalIn.title, 400) ? { title: generalIn.title as string } : {}),
      ...(pickStr(generalIn.summary, 8000) ? { summary: generalIn.summary as string } : {}),
      ...(Array.isArray(generalIn.mood)
        ? { mood: generalIn.mood.filter((x): x is string => typeof x === "string").slice(0, 24) }
        : {}),
      ...(Array.isArray(generalIn.lighting)
        ? { lighting: generalIn.lighting.filter((x): x is string => typeof x === "string").slice(0, 24) }
        : {}),
      ...(Array.isArray(generalIn.composition)
        ? { composition: generalIn.composition.filter((x): x is string => typeof x === "string").slice(0, 24) }
        : {}),
      ...(Array.isArray(generalIn.materiality)
        ? { materiality: generalIn.materiality.filter((x): x is string => typeof x === "string").slice(0, 24) }
        : {}),
      ...(Array.isArray(generalIn.avoid)
        ? { avoid: generalIn.avoid.filter((x): x is string => typeof x === "string").slice(0, 48) }
        : {}),
      ...(Array.isArray(generalIn.safeGenerationRules)
        ? {
            safeGenerationRules: generalIn.safeGenerationRules
              .filter((x): x is string => typeof x === "string")
              .slice(0, 48),
          }
        : {}),
    },
    mosaic,
    ...(Array.isArray(o.evidence) ? { evidence: o.evidence as VisualDnaSlot["evidence"] } : {}),
    ...(typeof o.confidence === "number" && Number.isFinite(o.confidence) ? { confidence: o.confidence } : {}),
    ...(ORIGIN.includes(o.analysisOrigin as VisualDnaSlotAnalysisOrigin)
      ? { analysisOrigin: o.analysisOrigin as VisualDnaSlotAnalysisOrigin }
      : {}),
    ...(pickStr(o.lastError, 2000) ? { lastError: o.lastError as string } : {}),
    ...(Array.isArray(o.staleReasons)
      ? { staleReasons: o.staleReasons.filter((x): x is string => typeof x === "string").slice(0, 24) }
      : {}),
  };

  const lgp: NonNullable<VisualDnaSlot["lastGenerationPrompts"]> = {};
  const up = pickStr(genIn.mosaicUserPrompt, 12000);
  const sn = pickStr(genIn.mosaicSystemNotes, 12000);
  const srd = Array.isArray(genIn.safeRulesDigest)
    ? genIn.safeRulesDigest.filter((x): x is string => typeof x === "string").slice(0, 64)
    : undefined;
  if (up) lgp.mosaicUserPrompt = up;
  if (sn) lgp.mosaicSystemNotes = sn;
  if (srd?.length) lgp.safeRulesDigest = srd;
  if (Object.keys(lgp).length) slot.lastGenerationPrompts = lgp;

  return slot;
}

export function normalizeVisualDnaSlots(raw: unknown): VisualDnaSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: VisualDnaSlot[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const s = normalizeVisualDnaSlot(row);
    if (!s) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

function analysisOriginFromVision(a: BrainVisualImageAnalysis): VisualDnaSlotAnalysisOrigin {
  if (a.fallbackUsed || a.visionProviderId === "mock") return "mock";
  if (a.visionProviderId === "gemini-vision" || a.visionProviderId === "openai-vision") return "remote_ai";
  return "local_heuristic";
}

function confidenceFromAnalysis(a: BrainVisualImageAnalysis): number {
  const c = typeof a.coherenceScore === "number" ? a.coherenceScore : 0.55;
  return Math.max(0, Math.min(1, c));
}

/**
 * Crea un slot nuevo para una imagen de conocimiento ya analizada (no persiste solo; usar patch).
 */
export function createVisualDnaSlotFromImage(input: {
  ref: BrainVisualAssetRef;
  analysis: BrainVisualImageAnalysis;
  brainMeta?: BrainMeta | null;
}): VisualDnaSlot {
  const now = new Date().toISOString();
  const bv = getBrainVersion(input.brainMeta ?? undefined);
  const dom = [...(input.analysis.colorPalette?.dominant ?? [])].filter(Boolean).slice(0, 3);
  const secondary = [...(input.analysis.colorPalette?.secondary ?? [])].filter(Boolean).slice(0, 3);
  const paletteColors = [...new Set([...dom, ...secondary])].slice(0, 6);
  const srcUrl = input.ref.imageUrlForVision?.trim();

  return normalizeVisualDnaSlot({
    id: newId(),
    label: input.ref.name?.trim() || "Imagen Brain",
    sourceImageId: input.ref.id,
    sourceDocumentId: input.ref.id,
    ...(srcUrl ? { sourceImageUrl: srcUrl } : {}),
    createdAt: now,
    brainVersion: bv,
    status: "pending" as const,
    palette: {
      dominantColors: paletteColors,
      colorNotes: [
        input.analysis.colorPalette?.temperature,
        input.analysis.colorPalette?.saturation,
        input.analysis.colorPalette?.contrast,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    },
    hero: {
      description: [input.analysis.subject, ...(input.analysis.subjectTags ?? [])].filter(Boolean).join(" · ").slice(0, 2000),
      conclusion: input.analysis.implicitBrandMessage ?? input.analysis.visualMessage?.join(" · "),
    },
    generalStyle: {
      mood: input.analysis.mood?.slice(0, 12),
      lighting: input.analysis.composition?.filter((x) => /luz|light|contraste|sombr/i.test(x)).slice(0, 8),
      composition: input.analysis.composition?.slice(0, 12),
      summary: [input.analysis.graphicStyle, input.analysis.people].filter(Boolean).join(" · ").slice(0, 2000),
      avoid: input.analysis.brandSignals?.slice(0, 12),
    },
    people: { notes: input.analysis.peopleDetail?.present ? input.analysis.people : undefined },
    confidence: confidenceFromAnalysis(input.analysis),
    analysisOrigin: analysisOriginFromVision(input.analysis),
  })!;
}

export function updateVisualDnaSlot(slots: VisualDnaSlot[], slotId: string, partial: Partial<VisualDnaSlot>): VisualDnaSlot[] {
  const norm = normalizeVisualDnaSlots(slots);
  return norm.map((s) => {
    if (s.id !== slotId) return s;
    return normalizeVisualDnaSlot({ ...s, ...partial, id: s.id }) ?? s;
  });
}

export function removeVisualDnaSlot(slots: VisualDnaSlot[], slotId: string): VisualDnaSlot[] {
  return normalizeVisualDnaSlots(slots).filter((s) => s.id !== slotId);
}

export function markVisualDnaSlotStale(
  slots: VisualDnaSlot[],
  slotId: string,
  reasons: string[],
): VisualDnaSlot[] {
  return updateVisualDnaSlot(slots, slotId, {
    status: "stale",
    staleReasons: reasons.slice(0, 12),
    updatedAt: new Date().toISOString(),
  });
}

export function markAllVisualDnaSlotsStale(slots: VisualDnaSlot[], reasons: string[]): VisualDnaSlot[] {
  const r = reasons.slice(0, 12);
  const now = new Date().toISOString();
  return normalizeVisualDnaSlots(slots).map((s) =>
    s.status === "ready" || s.status === "failed"
      ? (normalizeVisualDnaSlot({ ...s, status: "stale" as const, staleReasons: r, updatedAt: now }) ?? s)
      : s,
  );
}
