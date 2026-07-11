import { Type } from "@google/genai";

const BRAND_COLOR_REGION_KINDS = [
  "palette_swatch",
  "logo",
  "display_text",
  "brand_block",
  "graphic_element",
] as const;

export const LOGO_INTAKE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    images: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          docIndex: { type: Type.INTEGER },
          pageNumber: { type: Type.INTEGER },
          brand_color_regions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                kind: { type: Type.STRING, enum: [...BRAND_COLOR_REGION_KINDS] },
                prominence: { type: Type.INTEGER },
                label_text: { type: Type.STRING, nullable: true },
              },
              required: ["box_2d", "kind", "prominence"],
            },
          },
          logos: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                is_document_issuer_logo: { type: Type.BOOLEAN },
                is_complete: { type: Type.BOOLEAN },
                cut_edges: { type: Type.BOOLEAN },
                variant: {
                  type: Type.STRING,
                  enum: ["full", "isotype", "wordmark", "unknown"],
                },
                brand_text: { type: Type.STRING, nullable: true },
                variant_label: { type: Type.STRING, nullable: true },
                is_prohibited: { type: Type.BOOLEAN },
                confidence: { type: Type.NUMBER },
              },
              required: [
                "box_2d",
                "is_document_issuer_logo",
                "is_complete",
                "cut_edges",
                "variant",
                "confidence",
              ],
            },
          },
        },
        required: ["docIndex", "pageNumber", "logos"],
      },
    },
  },
  required: ["images"],
} as const;

export type ParsedVisionBrandColorRegion = {
  box_2d: [number, number, number, number];
  kind: "palette_swatch" | "logo" | "display_text" | "brand_block" | "graphic_element";
  prominence: number;
  label_text?: string | null;
};

export type ParsedVisionLogo = {
  box_2d: [number, number, number, number];
  is_document_issuer_logo: boolean;
  is_complete: boolean;
  cut_edges: boolean;
  variant: "full" | "isotype" | "wordmark" | "unknown";
  brand_text: string | null;
  variant_label?: string | null;
  is_prohibited?: boolean;
  confidence: number;
};

export type ParsedVisionImage = {
  docIndex: number;
  pageNumber: number;
  brand_color_regions?: ParsedVisionBrandColorRegion[];
  logos: ParsedVisionLogo[];
};

export type ParsedVisionResponse = {
  images: ParsedVisionImage[];
};
