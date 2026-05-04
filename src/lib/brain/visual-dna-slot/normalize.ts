import type { BrainVisualImageAnalysis, KnowledgeDocumentEntry } from "@/app/spaces/project-assets-metadata";
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
import { normalizeVisualDnaMosaicIntelligence } from "./mosaic-intelligence";

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
  const mosaicIntelligence = normalizeVisualDnaMosaicIntelligence(o.mosaicIntelligence);

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
    ...(mosaicIntelligence ? { mosaicIntelligence } : {}),
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

function compactUniqueTextParts(parts: Array<string | undefined>, maxChars = 2000): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (!out.length) return undefined;
  return out.join(" · ").slice(0, maxChars);
}

function splitVisualNoteTokens(parts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const text = (raw ?? "").trim();
    if (!text) continue;
    for (const bit of text.split(/[·,;|/]+/u)) {
      const clean = bit.trim().replace(/\s+/g, " ");
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

const PERSON_OR_CLOTHING_RE =
  /\b(hombre|mujer|persona|personas|gente|rostro|cara|barba|sonrisa|sonriendo|edad|cauc[aá]s|modelo|m[uú]sico|cantante|traje|chaqueta|camisa|corbata|vestuario|vestimenta|ropa|cuello|manos?|portrait|people|person|man|woman|face|beard|smiling|musician|singer|jacket|shirt|suit|clothing|wardrobe|outfit)\b/i;
const TEXT_OR_BRAND_RE =
  /\b(texto|tipograf[ií]a|logo|logotipo|marca|slogan|copy|oaro|caption|typography|brand|watermark)\b/i;
const ENVIRONMENT_RE =
  /\b(entorno|fondo|espacio|escena|interior|exterior|edificio|arquitectura|oficina|sala|pasillo|terminal|aeropuerto|servidor|servidores|data\s*center|datacenter|ciudad|urbano|luz|ambiente|contexto|environment|background|space|interior|exterior|building|architecture|office|server|hall|terminal)\b/i;
const OBJECT_RE =
  /\b(objeto|producto|dispositivo|smartphone|tel[eé]fono|m[oó]vil|tablet|pantalla|tarjeta|qr|cadena|anillo|formas? geom[eé]tricas?|icono|prop|guitarra|instrumento|sombrero|botas?|serape|manta|textil|botella|vaso|taza|bolso|bolsa|zapato|zapatilla|bal[oó]n|pelota|object|product|device|phone|screen|card|chain|ring|shape|guitar|instrument|hat|boots?|blanket|textile|bottle|cup|bag|shoe|ball)\b/i;
const TEXTURE_RE =
  /\b(textura|material|superficie|metal|met[aá]lico|vidrio|cristal|papel|tela|tejido|fibra|grano|brillo|mate|gradiente|degradado|mesh|red|malla|texture|material|surface|metal|glass|fabric|grain|gradient)\b/i;

function withoutCategoryContamination(tokens: string[], kind: "object" | "environment" | "texture"): string[] {
  return tokens.filter((token) => {
    if (PERSON_OR_CLOTHING_RE.test(token)) return false;
    if (kind !== "object" && TEXT_OR_BRAND_RE.test(token)) return false;
    if (kind === "object") {
      if (/\b(designer|campañas?|branding|presentaciones?|generaci[oó]n|moodboard)\b/i.test(token)) return false;
      return OBJECT_RE.test(token) || (!ENVIRONMENT_RE.test(token) && !TEXTURE_RE.test(token) && !TEXT_OR_BRAND_RE.test(token));
    }
    if (kind === "environment") return ENVIRONMENT_RE.test(token) && !OBJECT_RE.test(token);
    return TEXTURE_RE.test(token) && !ENVIRONMENT_RE.test(token);
  });
}

function notesFromTokens(tokens: string[], fallback?: string): string | undefined {
  const clean = tokens.slice(0, 8);
  if (clean.length) return compactUniqueTextParts(clean);
  return fallback;
}

function visualAnalysisTextBlob(analysis: BrainVisualImageAnalysis): string {
  return [
    analysis.subject,
    ...(analysis.subjectTags ?? []),
    ...(analysis.composition ?? []),
    ...(analysis.visualStyle ?? []),
    ...(analysis.mood ?? []),
    analysis.people,
    analysis.clothingStyle,
    analysis.graphicStyle,
  ]
    .filter(Boolean)
    .join(" · ")
    .toLowerCase();
}

function enrichPeopleNotes(analysis: BrainVisualImageAnalysis): string | undefined {
  const blob = visualAnalysisTextBlob(analysis);
  const parts = [analysis.people?.trim()].filter(Boolean) as string[];
  if (/\b(guitarra|guitar|instrumento|instrument)\b/i.test(blob)) {
    parts.push("interacción musical con guitarra como gesto principal");
  }
  if (/\b(sombrero|hat|charro|serape|manta|poncho)\b/i.test(blob)) {
    parts.push("vestuario cultural con sombrero amplio, serape o textiles de rayas");
  }
  if (/\b(m[eé]xico|mexican|charro|mariachi|folcl[oó]ric|tradicional|cultura)\b/i.test(blob)) {
    parts.push("referencias de estilo de vida y celebración cultural mexicana, músicos o grupo festivo");
  }
  return compactUniqueTextParts(parts, 700) || undefined;
}

function enrichEnvironmentNotes(analysis: BrainVisualImageAnalysis, baseNotes?: string): string | undefined {
  const blob = visualAnalysisTextBlob(analysis);
  const parts = [baseNotes?.trim()].filter(Boolean) as string[];
  if (/\b(cactus|saguaro|desierto|desert|arena|duna|horizonte)\b/i.test(blob)) {
    parts.push("paisaje desértico cálido con cactus/saguaros, horizonte amplio, luz dorada y suelo terroso");
  }
  if (/\b(calle|street|fachada|fachadas|arquitectura|patio|pueblo|ciudad|muro|pared|casa|casas)\b/i.test(blob)) {
    parts.push("calle, patio o fachada de arquitectura colorida con muros vibrantes y sombras limpias");
  }
  if (/\b(fondo amarillo|pared amarilla|amarillo|suelo roj|rojo terroso|coral)\b/i.test(blob)) {
    parts.push("fondo amarillo texturizado combinado con suelo rojizo/coral y contraste fuerte figura-fondo");
  }
  if (/\b(m[eé]xico|mexican|charro|serape|sombrero)\b/i.test(blob)) {
    parts.push("ambiente editorial de inspiración mexicana: color intenso, exterior soleado, escala gráfica y cultural");
  }
  return compactUniqueTextParts(parts, 850) || undefined;
}

function enrichTextureNotes(analysis: BrainVisualImageAnalysis, baseNotes?: string): string | undefined {
  const blob = visualAnalysisTextBlob(analysis);
  const parts = [baseNotes?.trim()].filter(Boolean) as string[];
  if (/\b(cactus|saguaro)\b/i.test(blob)) {
    parts.push("estrías verticales, espinas finas y piel verde de cactus como textura orgánica");
  }
  if (/\b(serape|manta|poncho|rayas|raya|tejido|tela|textil|lana|fabric|woven|stripe)\b/i.test(blob)) {
    parts.push("tejido grueso multicolor tipo serape, rayas saturadas y trama visible");
  }
  if (/\b(grano|grain|pared|muro|fondo amarillo|estuco|texturiz|suelo|terroso|coral)\b/i.test(blob)) {
    parts.push("pared amarilla granulada, estuco mate y suelo terroso con grano fino");
  }
  return compactUniqueTextParts(parts, 850) || undefined;
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
  const srcS3Path = input.ref.s3Path?.trim();
  const subjectTokens = splitVisualNoteTokens([input.analysis.subject, ...(input.analysis.subjectTags ?? [])]);
  const compositionTokens = splitVisualNoteTokens(input.analysis.composition ?? []);
  const styleTokens = splitVisualNoteTokens([
    input.analysis.graphicStyle,
    ...(input.analysis.visualStyle ?? []),
    ...(input.analysis.mood ?? []),
  ]);
  const graphicTextureTokens = splitVisualNoteTokens(input.analysis.graphicDetail?.texture ?? []);
  const materialTokens = splitVisualNoteTokens([
    ...(input.analysis.clothingDetail?.textures ?? []),
    ...(input.analysis.colorPalette?.dominant ?? []),
  ]);
  const objectsNotes = notesFromTokens(
    withoutCategoryContamination(subjectTokens, "object"),
    "Objetos, producto o props visibles en la sección OBJETOS del mosaico.",
  );
  const environmentsNotes = notesFromTokens(
    withoutCategoryContamination([...compositionTokens, ...subjectTokens], "environment"),
    "Espacios, escala, luz y contexto visual de la sección ENTORNOS del mosaico.",
  );
  const texturesNotes = notesFromTokens(
    withoutCategoryContamination([...graphicTextureTokens, ...materialTokens, ...styleTokens], "texture"),
    "Superficies, materiales, grano y atmósfera táctil de la sección TEXTURAS del mosaico.",
  );
  const peopleNotes = enrichPeopleNotes(input.analysis);
  const richEnvironmentsNotes = enrichEnvironmentNotes(input.analysis, environmentsNotes);
  const richTexturesNotes = enrichTextureNotes(input.analysis, texturesNotes);

  return normalizeVisualDnaSlot({
    id: newId(),
    label: input.ref.name?.trim() || "Imagen Brain",
    sourceImageId: input.ref.id,
    sourceDocumentId: input.ref.id,
    ...(srcUrl ? { sourceImageUrl: srcUrl } : {}),
    ...(srcS3Path ? { sourceS3Path: srcS3Path } : {}),
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
    people: { notes: input.analysis.peopleDetail?.present ? peopleNotes : undefined },
    objects: { notes: objectsNotes },
    environments: { notes: richEnvironmentsNotes },
    textures: { notes: richTexturesNotes },
    confidence: confidenceFromAnalysis(input.analysis),
    analysisOrigin: analysisOriginFromVision(input.analysis),
  })!;
}

/**
 * Crea un slot visible para una cápsula recién subida aunque su análisis visual
 * todavía no haya terminado. No contiene ADN inferido ni dispara generación por sí solo:
 * solo mantiene la imagen trazable en la biblioteca mientras llega la fila `analyzed`.
 */
export function createPendingVisualDnaSlotFromKnowledgeDocument(input: {
  doc: KnowledgeDocumentEntry;
  brainMeta?: BrainMeta | null;
}): VisualDnaSlot {
  const now = new Date().toISOString();
  const sourceImageUrl =
    input.doc.dataUrl?.trim() ||
    (/^https:\/\//i.test(input.doc.originalSourceUrl?.trim() ?? "")
      ? input.doc.originalSourceUrl?.trim()
      : undefined);
  return normalizeVisualDnaSlot({
    id: newId(),
    label: input.doc.name?.trim() || "Look visual",
    sourceImageId: input.doc.id,
    sourceDocumentId: input.doc.id,
    ...(sourceImageUrl ? { sourceImageUrl } : {}),
    ...(input.doc.s3Path?.trim() ? { sourceS3Path: input.doc.s3Path.trim() } : {}),
    createdAt: now,
    updatedAt: now,
    brainVersion: getBrainVersion(input.brainMeta ?? undefined),
    status: "pending" as const,
    palette: { dominantColors: [] },
    hero: {
      description: "Preparando análisis visual…",
    },
    generalStyle: {
      title: input.doc.name?.trim() || "Look visual",
      summary: "Cápsula visual pendiente de análisis.",
    },
    people: {},
    objects: {},
    environments: {},
    textures: {},
    mosaic: {},
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
