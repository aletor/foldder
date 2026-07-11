/**
 * Fase A — contrato JSON por página + validación dura post-parse (Zod).
 * Bbox unificado BBoxXYXY; instancias inválidas → rejected[]; raíz solo pageKind.
 * version/page los estampa el servidor tras el parse.
 */

import { z } from "zod";
import {
  bboxAreaXYXY,
  bboxOverlapRatioXYXY,
  bboxXYXYSchema,
  isViableLogoHarvestBbox,
  parseRawBBoxTuple,
  type BBoxXYXY,
} from "./page-vision-pass-bbox";
import { BRAND_KIT_PAGE_VISION_PASS_VERSION } from "./page-vision-pass-version";
import {
  normalizeContentTitleEntries,
  type PageVisionContentTitleEntry,
} from "./page-vision-content-titles";

const UNKNOWN = "unknown" as const;

const confidenceSchema = z.number().min(0).max(1);

const unknownableString = (max = 400) =>
  z.union([z.string().trim().min(1).max(max), z.literal(UNKNOWN)]);

const logoVariantSchema = z.enum(["horizontal", "isotipo", "vertical", "monocromo", UNKNOWN]);
const logoBackgroundSchema = z.enum(["claro", "oscuro", "fotografia", UNKNOWN]);
const logoCutEdgeSchema = z.enum(["top", "bottom", "left", "right", UNKNOWN]);

const logoInstanceFieldsSchema = z.object({
  variant: logoVariantSchema,
  onBackground: logoBackgroundSchema,
  textInLogo: unknownableString(200),
  isComplete: z.boolean(),
  cutEdges: z.array(logoCutEdgeSchema).max(4),
  confidence: confidenceSchema,
});

export const pageVisionLogoInstanceSchema = logoInstanceFieldsSchema.extend({
  bbox: bboxXYXYSchema,
});

export const brandNameEvidenceKindSchema = z.enum([
  "dominio_pie",
  "wordmark_logo",
  "titulo_prominente",
  "lista_indice",
  "seccion_documento",
  UNKNOWN,
]);

const brandNameEvidenceFieldsSchema = z.object({
  text: unknownableString(300),
  kind: brandNameEvidenceKindSchema,
});

export const pageVisionBrandNameEvidenceSchema = brandNameEvidenceFieldsSchema.extend({
  bbox: bboxXYXYSchema,
});

export const typographyRoleSchema = z.enum(["display", "titular", "cuerpo", "pie", "etiqueta", UNKNOWN]);

const typographyRoleFieldsSchema = z.object({
  role: typographyRoleSchema,
  sampleText: unknownableString(300),
  styleObserved: unknownableString(400),
});

export const pageVisionTypographyRoleSchema = typographyRoleFieldsSchema.extend({
  bbox: bboxXYXYSchema,
});

const hexOrUnknown = z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal(UNKNOWN)]);

export const visualDnaSchema = z.object({
  sujeto: unknownableString(400),
  ropa: unknownableString(400),
  lugar: unknownableString(400),
  animo: unknownableString(300),
  estiloArtistico: unknownableString(400),
  encuadre: unknownableString(300),
  luzTratamiento: unknownableString(400),
  paletaAprox: z.array(hexOrUnknown).max(8),
  texturas: unknownableString(300),
  vozVisual: unknownableString(300),
});

const imageObservationFieldsSchema = z.object({
  visualDna: visualDnaSchema,
  esFotoDeProducto: z.boolean(),
  confidence: confidenceSchema,
});

export const pageVisionImageSchema = imageObservationFieldsSchema.extend({
  bbox: bboxXYXYSchema,
});

export const pageKindSchema = z.enum([
  "portada",
  "indice",
  "ficha_contenido",
  "editorial",
  "contraportada",
  "asset_marca",
  "otro",
  UNKNOWN,
]);

export type PageKind = z.infer<typeof pageKindSchema>;

/** Normaliza pageKind del modelo (batch suele devolver inglés) al enum Fase A. */
export function normalizePageKindInput(raw: unknown): PageKind {
  if (typeof raw !== "string" || !raw.trim()) return UNKNOWN;
  const trimmed = raw.trim();
  if (pageKindSchema.safeParse(trimmed).success) {
    return pageKindSchema.parse(trimmed);
  }
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, PageKind> = {
    cover: "portada",
    title: "portada",
    title_page: "portada",
    title_slide: "portada",
    opening: "portada",
    introduction: "portada",
    presentation: "portada",
    deck: "portada",
    portada: "portada",
    index: "indice",
    indice: "indice",
    table_of_contents: "indice",
    toc: "indice",
    contents: "indice",
    content: "ficha_contenido",
    content_page: "ficha_contenido",
    ficha_contenido: "ficha_contenido",
    product: "ficha_contenido",
    slide: "ficha_contenido",
    section: "ficha_contenido",
    editorial: "editorial",
    back_cover: "contraportada",
    contraportada: "contraportada",
    closing: "contraportada",
    brand: "asset_marca",
    brand_asset: "asset_marca",
    asset_marca: "asset_marca",
    logo_page: "asset_marca",
    other: "otro",
    otro: "otro",
    unknown: UNKNOWN,
  };
  return aliases[key] ?? UNKNOWN;
}

/** Salida del modelo (sin version/page). */
export const pageVisionModelOutputSchema = z.object({
  logoInstances: z.array(pageVisionLogoInstanceSchema),
  brandNameEvidence: z.array(pageVisionBrandNameEvidenceSchema),
  /** Nivel 1 slim — títulos con kind (titulo_obra | seccion_documento). */
  contentTitles: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(200),
        kind: z.enum(["titulo_obra", "seccion_documento"]),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  typographyRoles: z.array(pageVisionTypographyRoleSchema),
  brandSurfaces: z.array(bboxXYXYSchema),
  images: z.array(pageVisionImageSchema),
  pageKind: pageKindSchema,
});

/** Resultado estampado por el servidor. */
export const pageVisionPassResultSchema = pageVisionModelOutputSchema.extend({
  version: z.literal(BRAND_KIT_PAGE_VISION_PASS_VERSION),
  page: z.number().int().min(1),
});

export type PageVisionModelOutput = z.infer<typeof pageVisionModelOutputSchema>;
export type PageVisionPassResult = z.infer<typeof pageVisionPassResultSchema>;
export type PageVisionLogoInstance = z.infer<typeof pageVisionLogoInstanceSchema>;
export type PageVisionBrandNameEvidence = z.infer<typeof pageVisionBrandNameEvidenceSchema>;
export type { PageVisionContentTitleEntry } from "./page-vision-content-titles";
export type PageVisionTypographyRole = z.infer<typeof pageVisionTypographyRoleSchema>;
export type PageVisionImageObservation = z.infer<typeof pageVisionImageSchema>;
export type VisualDna = z.infer<typeof visualDnaSchema>;

export type PageVisionParseRejection = {
  section:
    | "logoInstances"
    | "brandNameEvidence"
    | "typographyRoles"
    | "brandSurfaces"
    | "images";
  index: number;
  reason: "bbox_overlap" | "schema_invalid";
  detail?: string;
};

export type PageVisionPassWarning =
  | {
      type: "consistency_normalized";
      section: "logoInstances";
      field: "isComplete";
      instanceIndex: number;
    }
  | {
      type: "page_echo_mismatch";
      modelPage: number;
      expectedPage: number;
    };

export type ValidatePageVisionPassContext = {
  /** Página 1-based que el servidor está analizando — se estampa en el resultado. */
  pageNumber: number;
};

export type ValidatedPageVisionPass = {
  ok: true;
  result: PageVisionPassResult;
  /** Instancias eliminadas — nunca las que siguen en result. */
  rejected: PageVisionParseRejection[];
  /** Normalizaciones y discrepancias soft — la instancia sigue en result. */
  warnings: PageVisionPassWarning[];
};

export type FailedPageVisionPass = {
  ok: false;
  /** JSON malformado o pageKind inválido. */
  rootError: string;
  zodError?: z.ZodError;
  rejected: PageVisionParseRejection[];
};

const OVERLAP_DISCARD_RATIO = 0.9;
const BBOX_EPS = 1e-6;

const modelRootSchema = z.object({
  logoInstances: z.unknown().optional(),
  brandNameEvidence: z.unknown().optional(),
  contentTitles: z.unknown().optional(),
  typographyRoles: z.unknown().optional(),
  brandSurfaces: z.unknown().optional(),
  images: z.unknown().optional(),
  pageKind: z.unknown(),
  page: z.unknown().optional(),
  version: z.unknown().optional(),
});

function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function reject(
  section: PageVisionParseRejection["section"],
  index: number,
  reason: PageVisionParseRejection["reason"],
  detail: string,
): PageVisionParseRejection {
  return { section, index, reason, detail };
}

function parseLogoInstance(
  raw: unknown,
  index: number,
):
  | { ok: true; value: PageVisionLogoInstance; warnings: PageVisionPassWarning[] }
  | { ok: false; rejection: PageVisionParseRejection } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, rejection: reject("logoInstances", index, "schema_invalid", "not_object") };
  }
  const o = raw as Record<string, unknown>;
  const bboxParsed = parseRawBBoxTuple(o.bbox);
  if (!bboxParsed.ok) {
    return { ok: false, rejection: reject("logoInstances", index, "schema_invalid", bboxParsed.reason) };
  }
  const fields = logoInstanceFieldsSchema.safeParse(o);
  if (!fields.success) {
    return {
      ok: false,
      rejection: reject(
        "logoInstances",
        index,
        "schema_invalid",
        fields.error.issues[0]?.message ?? "invalid_fields",
      ),
    };
  }

  let logo: PageVisionLogoInstance = { ...fields.data, bbox: bboxParsed.bbox };
  if (!isViableLogoHarvestBbox(bboxParsed.bbox)) {
    return {
      ok: false,
      rejection: reject("logoInstances", index, "schema_invalid", "bbox_too_small"),
    };
  }
  const warnings: PageVisionPassWarning[] = [];
  if (logo.cutEdges.length > 0 && logo.isComplete) {
    logo = { ...logo, isComplete: false };
    warnings.push({
      type: "consistency_normalized",
      section: "logoInstances",
      field: "isComplete",
      instanceIndex: index,
    });
  }
  return { ok: true, value: logo, warnings };
}

function parseBrandNameEvidence(raw: unknown, index: number) {
  if (!raw || typeof raw !== "object") {
    return { ok: false as const, rejection: reject("brandNameEvidence", index, "schema_invalid", "not_object") };
  }
  const o = raw as Record<string, unknown>;
  const bboxParsed = parseRawBBoxTuple(o.bbox);
  if (!bboxParsed.ok) {
    return { ok: false as const, rejection: reject("brandNameEvidence", index, "schema_invalid", bboxParsed.reason) };
  }
  const fields = brandNameEvidenceFieldsSchema.safeParse(o);
  if (!fields.success) {
    return {
      ok: false as const,
      rejection: reject(
        "brandNameEvidence",
        index,
        "schema_invalid",
        fields.error.issues[0]?.message ?? "invalid_fields",
      ),
    };
  }
  return {
    ok: true as const,
    value: { ...fields.data, bbox: bboxParsed.bbox } satisfies PageVisionBrandNameEvidence,
  };
}

function parseTypographyRole(raw: unknown, index: number) {
  if (!raw || typeof raw !== "object") {
    return { ok: false as const, rejection: reject("typographyRoles", index, "schema_invalid", "not_object") };
  }
  const o = raw as Record<string, unknown>;
  const bboxParsed = parseRawBBoxTuple(o.bbox);
  if (!bboxParsed.ok) {
    return { ok: false as const, rejection: reject("typographyRoles", index, "schema_invalid", bboxParsed.reason) };
  }
  const fields = typographyRoleFieldsSchema.safeParse(o);
  if (!fields.success) {
    return {
      ok: false as const,
      rejection: reject(
        "typographyRoles",
        index,
        "schema_invalid",
        fields.error.issues[0]?.message ?? "invalid_fields",
      ),
    };
  }
  return {
    ok: true as const,
    value: { ...fields.data, bbox: bboxParsed.bbox } satisfies PageVisionTypographyRole,
  };
}

function parseBrandSurface(raw: unknown, index: number) {
  const bboxParsed = parseRawBBoxTuple(raw);
  if (!bboxParsed.ok) {
    return { ok: false as const, rejection: reject("brandSurfaces", index, "schema_invalid", bboxParsed.reason) };
  }
  return { ok: true as const, value: bboxParsed.bbox };
}

function parseImageObservation(raw: unknown, index: number) {
  if (!raw || typeof raw !== "object") {
    return { ok: false as const, rejection: reject("images", index, "schema_invalid", "not_object") };
  }
  const o = raw as Record<string, unknown>;
  const bboxParsed = parseRawBBoxTuple(o.bbox);
  if (!bboxParsed.ok) {
    return { ok: false as const, rejection: reject("images", index, "schema_invalid", bboxParsed.reason) };
  }
  const fields = imageObservationFieldsSchema.safeParse(o);
  if (!fields.success) {
    return {
      ok: false as const,
      rejection: reject("images", index, "schema_invalid", fields.error.issues[0]?.message ?? "invalid_fields"),
    };
  }
  return {
    ok: true as const,
    value: { ...fields.data, bbox: bboxParsed.bbox } satisfies PageVisionImageObservation,
  };
}

type OverlapCandidate = {
  bbox: BBoxXYXY;
  confidence?: number;
  sourceIndex: number;
};

/**
 * Desempate solapamiento >90%:
 * - Con confidence: mayor confidence; empate → mayor área; empate → menor sourceIndex (primera).
 * - Sin confidence: mayor área; empate → menor sourceIndex (primera).
 */
function compareOverlapCandidates(a: OverlapCandidate, b: OverlapCandidate, useConfidence: boolean): number {
  if (useConfidence) {
    const confA = a.confidence ?? -1;
    const confB = b.confidence ?? -1;
    if (confA !== confB) return confB - confA;
  }
  const areaA = bboxAreaXYXY(a.bbox);
  const areaB = bboxAreaXYXY(b.bbox);
  if (Math.abs(areaA - areaB) > BBOX_EPS) return areaB - areaA;
  return a.sourceIndex - b.sourceIndex;
}

function filterOverlappingInstances<T extends { bbox: BBoxXYXY; confidence?: number }>(
  section: PageVisionParseRejection["section"],
  items: T[],
  useConfidence: boolean,
): { kept: T[]; rejected: PageVisionParseRejection[] } {
  const indexed: OverlapCandidate[] = items.map((item, sourceIndex) => ({
    bbox: item.bbox,
    confidence: item.confidence,
    sourceIndex,
  }));
  const sorted = [...indexed].sort((a, b) => compareOverlapCandidates(a, b, useConfidence));
  const keptIndices = new Set<number>();

  for (const candidate of sorted) {
    let discard = false;
    for (const keptIndex of keptIndices) {
      const accepted = indexed[keptIndex]!;
      if (bboxOverlapRatioXYXY(candidate.bbox, accepted.bbox) > OVERLAP_DISCARD_RATIO) {
        discard = true;
        break;
      }
    }
    if (!discard) keptIndices.add(candidate.sourceIndex);
  }

  const kept = items.filter((_, i) => keptIndices.has(i));
  const rejected: PageVisionParseRejection[] = [];
  for (let i = 0; i < items.length; i += 1) {
    if (keptIndices.has(i)) continue;
    rejected.push({
      section,
      index: i,
      reason: "bbox_overlap",
      detail: useConfidence ? "overlap_gt_90pct_by_confidence_area_index" : "overlap_gt_90pct_by_area_index",
    });
  }
  return { kept, rejected };
}

/** Si el modelo omitió wordmark_logo pese a logoInstances legible, lo derivamos del bbox del logo. */
export function enrichBrandNameEvidenceFromLogos(
  logos: PageVisionLogoInstance[],
  evidence: PageVisionBrandNameEvidence[],
): PageVisionBrandNameEvidence[] {
  const out = [...evidence];
  for (const logo of logos) {
    const text = logo.textInLogo?.trim();
    if (!text || text.toLowerCase() === "unknown") continue;
    const normalized = text.toUpperCase();
    if (out.some((e) => e.kind === "wordmark_logo" && e.text.trim().toUpperCase() === normalized)) continue;
    out.push({ text, kind: "wordmark_logo", bbox: logo.bbox });
  }
  return out;
}

/**
 * Parse por instancia; el servidor estampa version + page.
 * Eco page/version del modelo: discrepancia de page → warnings[], nunca fallo de raíz.
 */
export function validatePageVisionPass(
  raw: unknown,
  context: ValidatePageVisionPassContext,
): ValidatedPageVisionPass | FailedPageVisionPass {
  if (!raw || typeof raw !== "object") {
    return { ok: false, rootError: "root_not_object", rejected: [] };
  }

  const root = modelRootSchema.safeParse(raw);
  if (!root.success) {
    return { ok: false, rootError: "root_shape_invalid", zodError: root.error, rejected: [] };
  }

  const pageKindParsed = pageKindSchema.safeParse(normalizePageKindInput(root.data.pageKind));
  if (!pageKindParsed.success) {
    return { ok: false, rootError: "pageKind_invalid", zodError: pageKindParsed.error, rejected: [] };
  }

  const warnings: PageVisionPassWarning[] = [];
  const modelPage = Number(root.data.page);
  if (Number.isInteger(modelPage) && modelPage >= 1 && modelPage !== context.pageNumber) {
    warnings.push({
      type: "page_echo_mismatch",
      modelPage,
      expectedPage: context.pageNumber,
    });
  }

  const rejected: PageVisionParseRejection[] = [];
  const logoInstances: PageVisionLogoInstance[] = [];
  for (let i = 0; i < asArray(root.data.logoInstances).length; i += 1) {
    const parsed = parseLogoInstance(asArray(root.data.logoInstances)[i], i);
    if (parsed.ok) {
      logoInstances.push(parsed.value);
      warnings.push(...parsed.warnings);
    } else rejected.push(parsed.rejection);
  }

  const brandNameEvidence: PageVisionBrandNameEvidence[] = [];
  for (let i = 0; i < asArray(root.data.brandNameEvidence).length; i += 1) {
    const parsed = parseBrandNameEvidence(asArray(root.data.brandNameEvidence)[i], i);
    if (parsed.ok) brandNameEvidence.push(parsed.value);
    else rejected.push(parsed.rejection);
  }

  const typographyRoles: PageVisionTypographyRole[] = [];
  for (let i = 0; i < asArray(root.data.typographyRoles).length; i += 1) {
    const parsed = parseTypographyRole(asArray(root.data.typographyRoles)[i], i);
    if (parsed.ok) typographyRoles.push(parsed.value);
    else rejected.push(parsed.rejection);
  }

  const brandSurfacesRaw: BBoxXYXY[] = [];
  for (let i = 0; i < asArray(root.data.brandSurfaces).length; i += 1) {
    const parsed = parseBrandSurface(asArray(root.data.brandSurfaces)[i], i);
    if (parsed.ok) brandSurfacesRaw.push(parsed.value);
    else rejected.push(parsed.rejection);
  }

  const images: PageVisionImageObservation[] = [];
  for (let i = 0; i < asArray(root.data.images).length; i += 1) {
    const parsed = parseImageObservation(asArray(root.data.images)[i], i);
    if (parsed.ok) images.push(parsed.value);
    else rejected.push(parsed.rejection);
  }

  const logoFiltered = filterOverlappingInstances("logoInstances", logoInstances, true);
  rejected.push(...logoFiltered.rejected);

  const brandEnriched = enrichBrandNameEvidenceFromLogos(logoFiltered.kept, brandNameEvidence);
  const brandFiltered = filterOverlappingInstances("brandNameEvidence", brandEnriched, false);
  rejected.push(...brandFiltered.rejected);

  const typoFiltered = filterOverlappingInstances("typographyRoles", typographyRoles, false);
  rejected.push(...typoFiltered.rejected);

  const imagesFiltered = filterOverlappingInstances("images", images, true);
  rejected.push(...imagesFiltered.rejected);

  const surfacesFiltered = filterOverlappingInstances(
    "brandSurfaces",
    brandSurfacesRaw.map((bbox, sourceIndex) => ({ bbox, sourceIndex })),
    false,
  );
  rejected.push(...surfacesFiltered.rejected);

  const contentTitles = normalizeContentTitleEntries(root.data.contentTitles, 20);

  return {
    ok: true,
    result: {
      version: BRAND_KIT_PAGE_VISION_PASS_VERSION,
      page: context.pageNumber,
      logoInstances: logoFiltered.kept,
      brandNameEvidence: brandFiltered.kept,
      contentTitles,
      typographyRoles: typoFiltered.kept,
      brandSurfaces: surfacesFiltered.kept.map((item) => item.bbox),
      images: imagesFiltered.kept,
      pageKind: pageKindParsed.data,
    },
    rejected,
    warnings,
  };
}

export { bboxOverlapRatioXYXY, type BBoxXYXY };
