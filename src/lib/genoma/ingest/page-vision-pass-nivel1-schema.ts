/**
 * Nivel 1 slim-4 — brandNameEvidence solo emisor (con bbox); contentTitles plano para índice.
 */

import { z } from "zod";
import {
  normalizePageKindInput,
  pageKindSchema,
  type PageVisionBrandNameEvidence,
  type PageVisionTypographyRole,
  validatePageVisionPass,
  type ValidatePageVisionPassContext,
  type ValidatedPageVisionPass,
  type FailedPageVisionPass,
} from "./page-vision-pass-schema";
import { normalizeContentTitleEntries } from "./page-vision-content-titles";
import {
  GENOMA_PAGE_VISION_NIVEL1_VERSION,
  PAGE_VISION_NIVEL1_CONTENT_TITLES_MAX,
  PAGE_VISION_NIVEL1_EMITTER_BNE_MAX,
} from "./page-vision-pass-version";

const UNKNOWN = "unknown" as const;

const SLIM_EMITTER_BNE_KINDS = new Set(["dominio_pie", "wordmark_logo", "titulo_prominente"]);

const TYPOGRAPHY_ROLES = new Set(["display", "titular", "cuerpo", "pie", "etiqueta", UNKNOWN]);

function truncateOptionalString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

import { normalizeModelBboxTuple } from "./page-vision-pass-bbox";

function coerceBbox(value: unknown): [number, number, number, number] | null {
  const parsed = normalizeModelBboxTuple(value);
  if (!parsed.ok) return null;
  return [...parsed.bbox] as [number, number, number, number];
}

const LOGO_VARIANTS = new Set(["horizontal", "isotipo", "vertical", "monocromo", UNKNOWN]);

function normalizeSlimLogoInstance(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const bbox = coerceBbox(o.bbox);
  if (!bbox) return value;
  let variant = typeof o.variant === "string" ? o.variant.trim() : UNKNOWN;
  let textInLogo = typeof o.textInLogo === "string" ? o.textInLogo.trim() : UNKNOWN;
  if (!LOGO_VARIANTS.has(variant)) {
    if ((textInLogo === UNKNOWN || textInLogo.toLowerCase() === "unknown") && variant.length > 1) {
      textInLogo = variant;
    }
    variant = UNKNOWN;
  }
  return {
    ...o,
    bbox,
    variant,
    textInLogo: textInLogo || UNKNOWN,
    cutEdges: Array.isArray(o.cutEdges) ? o.cutEdges : [],
    isComplete: typeof o.isComplete === "boolean" ? o.isComplete : true,
    onBackground:
      typeof o.onBackground === "string" &&
      ["claro", "oscuro", "fotografia", UNKNOWN].includes(o.onBackground)
        ? o.onBackground
        : UNKNOWN,
    confidence: typeof o.confidence === "number" ? o.confidence : 0.5,
  };
}

function normalizeSlimBne(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const bbox = coerceBbox(o.bbox);
  if (!bbox) return value;
  return { ...o, bbox };
}

function normalizeSlimTypographyRole(value: unknown): z.infer<typeof slimTypographyRoleSchema> | null {
  if (!value || typeof value !== "object") return null;
  const roleRaw = (value as { role?: unknown }).role;
  const role =
    typeof roleRaw === "string" && TYPOGRAPHY_ROLES.has(roleRaw as typeof UNKNOWN)
      ? (roleRaw as z.infer<typeof slimTypographyRoleSchema>["role"])
      : UNKNOWN;
  const bbox = coerceBbox((value as { bbox?: unknown }).bbox);
  if (!bbox) return null;
  return {
    role,
    bbox,
    styleObserved: truncateOptionalString((value as { styleObserved?: unknown }).styleObserved, 80),
    sampleText: truncateOptionalString((value as { sampleText?: unknown }).sampleText, 120),
  };
}

/** Coerce forma — no inyecta pageTag ni atribuye por índice. */
export function normalizeSlimPageRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const page = raw as Record<string, unknown>;
  const typographyRoles = Array.isArray(page.typographyRoles)
    ? page.typographyRoles
        .map(normalizeSlimTypographyRole)
        .filter((t): t is z.infer<typeof slimTypographyRoleSchema> => t != null)
    : [];
  return {
    ...page,
    logoInstances: Array.isArray(page.logoInstances)
      ? page.logoInstances.map(normalizeSlimLogoInstance)
      : [],
    brandNameEvidence: Array.isArray(page.brandNameEvidence)
      ? page.brandNameEvidence.map(normalizeSlimBne)
      : [],
    contentTitles: normalizeContentTitleEntries(page.contentTitles, PAGE_VISION_NIVEL1_CONTENT_TITLES_MAX),
    typographyRoles,
  };
}

const slimEmitterBneSchema = z.object({
  text: z.string().trim().min(1).max(300),
  kind: z.enum(["dominio_pie", "wordmark_logo", "titulo_prominente"]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

const slimTypographyRoleSchema = z.object({
  role: z.enum(["display", "titular", "cuerpo", "pie", "etiqueta", UNKNOWN]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  styleObserved: z.string().trim().max(80).optional(),
  sampleText: z.string().trim().max(120).optional(),
});

const slimPageSchema = z.object({
  pageTag: z.string().min(1),
  pageNumber: z.number().int().min(1),
  logoInstances: z.array(z.unknown()).default([]),
  brandNameEvidence: z.array(slimEmitterBneSchema).max(PAGE_VISION_NIVEL1_EMITTER_BNE_MAX).default([]),
  contentTitles: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(200),
        kind: z.enum(["titulo_obra", "seccion_documento"]),
      }),
    )
    .max(PAGE_VISION_NIVEL1_CONTENT_TITLES_MAX)
    .default([]),
  typographyRoles: z.array(slimTypographyRoleSchema).default([]),
  pageKind: z.unknown(),
});

export type Nivel1DeepPassImageRef = {
  pageNumber: number;
  bbox: [number, number, number, number];
  tag?: string;
};

export type Nivel1BatchRoot = {
  docKind?: string;
  emitterBrandHint?: string;
  deepPassTriagedPages?: number[];
  deepPassTriagedImages?: Nivel1DeepPassImageRef[];
  pages: Array<z.infer<typeof slimPageSchema>>;
};

/** Fallback Nivel 0: typography → bne solo si no hay contentTitles. */
export function enrichIndexBrandNameEvidenceFromTypography(input: {
  pageKind: z.infer<typeof pageKindSchema>;
  brandNameEvidence: PageVisionBrandNameEvidence[];
  typographyRoles: PageVisionTypographyRole[];
  contentTitles?: string[];
}): PageVisionBrandNameEvidence[] {
  if (input.contentTitles?.length) return input.brandNameEvidence;
  if (input.pageKind !== "indice" && input.pageKind !== "ficha_contenido") {
    return input.brandNameEvidence;
  }
  if (input.brandNameEvidence.length > 0) return input.brandNameEvidence;

  const out: PageVisionBrandNameEvidence[] = [];
  for (const typo of input.typographyRoles) {
    const text = typo.sampleText?.trim();
    if (!text || text === UNKNOWN) continue;
    const kind =
      typo.role === "titular" || typo.role === "display" ? "titulo_prominente" : "lista_indice";
    out.push({ text, kind, bbox: typo.bbox });
  }
  return out.slice(0, PAGE_VISION_NIVEL1_CONTENT_TITLES_MAX);
}

function expandSlimPageToFullModel(raw: z.infer<typeof slimPageSchema>): Record<string, unknown> {
  const pageKind = normalizePageKindInput(raw.pageKind);
  const typographyRoles = raw.typographyRoles.map((t) => ({
    role: t.role,
    bbox: t.bbox,
    sampleText: t.sampleText?.trim() || UNKNOWN,
    styleObserved: t.styleObserved?.trim()?.slice(0, 80) || UNKNOWN,
  }));
  const brandNameEvidence = raw.brandNameEvidence.filter((e) => SLIM_EMITTER_BNE_KINDS.has(e.kind));
  return {
    logoInstances: raw.logoInstances,
    brandNameEvidence,
    contentTitles: raw.contentTitles,
    typographyRoles,
    brandSurfaces: [],
    images: [],
    pageKind,
  };
}

export function validateNivel1SlimPage(
  raw: unknown,
  context: ValidatePageVisionPassContext,
): ValidatedPageVisionPass | FailedPageVisionPass {
  const slim = slimPageSchema.safeParse(normalizeSlimPageRaw(raw));
  if (!slim.success) {
    return { ok: false, rootError: "nivel1_slim_shape_invalid", zodError: slim.error, rejected: [] };
  }
  const validated = validatePageVisionPass(expandSlimPageToFullModel(slim.data), context);
  if (!validated.ok) return validated;

  const enrichedBne = enrichIndexBrandNameEvidenceFromTypography({
    pageKind: validated.result.pageKind,
    brandNameEvidence: validated.result.brandNameEvidence,
    typographyRoles: validated.result.typographyRoles,
    contentTitles: validated.result.contentTitles,
  });

  const contentTitles = slim.data.contentTitles;
  const validatedContentTitles = validated.result.contentTitles ?? [];

  if (
    enrichedBne.length === validated.result.brandNameEvidence.length &&
    contentTitles.length === validatedContentTitles.length
  ) {
    return validated;
  }

  return {
    ...validated,
    result: {
      ...validated.result,
      brandNameEvidence: enrichedBne,
      contentTitles,
    },
  };
}

export function parseNivel1BatchRoot(raw: unknown): Nivel1BatchRoot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.pages)) return null;
  return {
    docKind: typeof o.docKind === "string" ? o.docKind : undefined,
    emitterBrandHint: typeof o.emitterBrandHint === "string" ? o.emitterBrandHint : undefined,
    deepPassTriagedPages: Array.isArray(o.deepPassTriagedPages)
      ? o.deepPassTriagedPages.filter((n): n is number => typeof n === "number")
      : undefined,
    deepPassTriagedImages: Array.isArray(o.deepPassTriagedImages)
      ? (o.deepPassTriagedImages as Nivel1DeepPassImageRef[])
      : undefined,
    pages: o.pages as Nivel1BatchRoot["pages"],
  };
}

export { GENOMA_PAGE_VISION_NIVEL1_VERSION };
