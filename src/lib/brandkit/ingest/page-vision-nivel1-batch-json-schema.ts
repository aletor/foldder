/**
 * JSON responseSchema aplanado para flash-lite (Nivel 1 batch).
 * Separado del tool declaration — menos anidamiento que logoInstances completo.
 */

import { Type } from "@google/genai";

const BBOX = {
  type: Type.ARRAY,
  items: { type: Type.NUMBER },
  minItems: 4,
  maxItems: 4,
};

/** Schema mínimo para responseMimeType application/json en flash-lite. */
export function nivel1BatchJsonResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      docKind: { type: Type.STRING },
      emitterBrandHint: { type: Type.STRING },
      deepPassTriagedPages: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
      },
      pages: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pageTag: { type: Type.STRING },
            pageNumber: { type: Type.NUMBER },
            pageKind: { type: Type.STRING },
            logoInstances: {
              type: Type.ARRAY,
              maxItems: 3,
              items: {
                type: Type.OBJECT,
                properties: {
                  bbox: BBOX,
                  variant: {
                    type: Type.STRING,
                    enum: ["horizontal", "isotipo", "vertical", "monocromo", "unknown"],
                  },
                  onBackground: {
                    type: Type.STRING,
                    enum: ["claro", "oscuro", "fotografia", "unknown"],
                  },
                  textInLogo: { type: Type.STRING },
                  isComplete: { type: Type.BOOLEAN },
                  confidence: { type: Type.NUMBER },
                },
                required: ["bbox", "variant", "confidence"],
              },
            },
            brandNameEvidence: {
              type: Type.ARRAY,
              maxItems: 5,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  kind: {
                    type: Type.STRING,
                    enum: ["dominio_pie", "wordmark_logo", "titulo_prominente"],
                  },
                  bbox: BBOX,
                },
                required: ["text", "kind", "bbox"],
              },
            },
            contentTitles: {
              type: Type.ARRAY,
              maxItems: 20,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  kind: {
                    type: Type.STRING,
                    enum: ["titulo_obra"],
                  },
                },
                required: ["text", "kind"],
              },
            },
            typographyRoles: {
              type: Type.ARRAY,
              maxItems: 6,
              items: {
                type: Type.OBJECT,
                properties: {
                  role: { type: Type.STRING },
                  bbox: BBOX,
                  styleObserved: { type: Type.STRING },
                  sampleText: { type: Type.STRING },
                },
                required: ["role", "bbox"],
              },
            },
          },
          required: [
            "pageTag",
            "pageNumber",
            "pageKind",
            "logoInstances",
            "brandNameEvidence",
            "contentTitles",
            "typographyRoles",
          ],
        },
      },
    },
    required: ["pages"],
  };
}
