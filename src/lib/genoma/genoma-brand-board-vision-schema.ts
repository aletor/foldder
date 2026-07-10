import { z } from "zod";
import { Type } from "@google/genai";
import { isValidBox2d } from "./logo-intake/bbox";

const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const paletteRoleSchema = z.enum([
  "primary",
  "secondary",
  "accent",
  "background",
  "text",
  "neutral",
  "unknown",
]);

const typographyRoleSchema = z.enum(["display", "heading", "body", "label", "unknown"]);

const logoVariantSchema = z.enum(["full", "isotipo", "wordmark", "monocromo", "unknown"]);

export const BRAND_BOARD_VISION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    brandName: { type: Type.STRING, nullable: true },
    documentType: { type: Type.STRING, nullable: true },
    palette: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, nullable: true },
          hex: { type: Type.STRING },
          role: { type: Type.STRING },
        },
        required: ["hex", "role"],
      },
    },
    typography: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          family: { type: Type.STRING },
          role: { type: Type.STRING },
          sampleText: { type: Type.STRING, nullable: true },
        },
        required: ["family", "role"],
      },
    },
    logos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          variant: { type: Type.STRING },
          brand_text: { type: Type.STRING, nullable: true },
          is_primary: { type: Type.BOOLEAN },
          is_complete: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER },
          context: { type: Type.STRING, nullable: true },
        },
        required: ["box_2d", "variant", "is_primary", "is_complete", "confidence"],
      },
    },
  },
  required: ["palette", "typography", "logos"],
} as const;

const rawLogoSchema = z.object({
  box_2d: z.array(z.number()).length(4),
  variant: logoVariantSchema.or(z.string()),
  brand_text: z.string().nullable().optional(),
  is_primary: z.boolean(),
  is_complete: z.boolean(),
  confidence: z.number().min(0).max(1),
  context: z.string().nullable().optional(),
});

const rawPaletteSchema = z.object({
  name: z.string().nullable().optional(),
  hex: z.string(),
  role: z.string(),
});

const rawTypographySchema = z.object({
  family: z.string(),
  role: z.string(),
  sampleText: z.string().nullable().optional(),
});

export type BrandBoardVisionLogo = {
  box_2d: [number, number, number, number];
  variant: z.infer<typeof logoVariantSchema>;
  brand_text?: string;
  is_primary: boolean;
  is_complete: boolean;
  confidence: number;
  context?: string;
};

export type BrandBoardVisionPaletteSwatch = {
  name?: string;
  hex: string;
  role: z.infer<typeof paletteRoleSchema>;
};

export type BrandBoardVisionTypography = {
  family: string;
  role: z.infer<typeof typographyRoleSchema>;
  sampleText?: string;
};

export type BrandBoardVisionResult = {
  brandName?: string;
  documentType?: string;
  palette: BrandBoardVisionPaletteSwatch[];
  typography: BrandBoardVisionTypography[];
  logos: BrandBoardVisionLogo[];
};

function normalizeRole<T extends string>(
  raw: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const lower = raw.trim().toLowerCase();
  const hit = allowed.find((value) => value === lower);
  return hit ?? fallback;
}

export function parseBrandBoardVisionResponse(raw: unknown): BrandBoardVisionResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const brandNameRaw = typeof o.brandName === "string" ? o.brandName.trim() : "";
  const brandName = brandNameRaw && brandNameRaw.length >= 2 ? brandNameRaw.slice(0, 80) : undefined;

  const palette: BrandBoardVisionPaletteSwatch[] = [];
  if (Array.isArray(o.palette)) {
    for (const entry of o.palette) {
      const parsed = rawPaletteSchema.safeParse(entry);
      if (!parsed.success) continue;
      const hexMatch = hexSchema.safeParse(parsed.data.hex.trim());
      if (!hexMatch.success) continue;
      palette.push({
        name: parsed.data.name?.trim() || undefined,
        hex: hexMatch.data.toLowerCase(),
        role: normalizeRole(parsed.data.role, paletteRoleSchema.options, "unknown"),
      });
    }
  }

  const typography: BrandBoardVisionTypography[] = [];
  if (Array.isArray(o.typography)) {
    for (const entry of o.typography) {
      const parsed = rawTypographySchema.safeParse(entry);
      if (!parsed.success) continue;
      const family = parsed.data.family.trim();
      if (family.length < 2 || family.toLowerCase() === "unknown") continue;
      typography.push({
        family,
        role: normalizeRole(parsed.data.role, typographyRoleSchema.options, "unknown"),
        sampleText: parsed.data.sampleText?.trim() || undefined,
      });
    }
  }

  const logos: BrandBoardVisionLogo[] = [];
  if (Array.isArray(o.logos)) {
    for (const entry of o.logos) {
      const parsed = rawLogoSchema.safeParse(entry);
      if (!parsed.success || !isValidBox2d(parsed.data.box_2d)) continue;
      logos.push({
        box_2d: parsed.data.box_2d as [number, number, number, number],
        variant: normalizeRole(String(parsed.data.variant), logoVariantSchema.options, "unknown"),
        brand_text: parsed.data.brand_text?.trim() || undefined,
        is_primary: parsed.data.is_primary,
        is_complete: parsed.data.is_complete,
        confidence: parsed.data.confidence,
        context: parsed.data.context?.trim() || undefined,
      });
    }
  }

  logos.sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.is_complete !== b.is_complete) return a.is_complete ? -1 : 1;
    return b.confidence - a.confidence;
  });

  return {
    brandName,
    documentType: typeof o.documentType === "string" ? o.documentType : undefined,
    palette,
    typography,
    logos: logos.slice(0, 6),
  };
}
