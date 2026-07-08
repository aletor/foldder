/**
 * Fase A — system instruction + user prompt por página.
 * Placeholders obviamente falsos — sin anclaje de marca real.
 * version/page los estampa el servidor — no van en la salida del modelo.
 */

import { PAGE_VISION_PROMPT_PLACEHOLDER_LITERALS } from "./page-vision-pass-anchoring";

export const PAGE_VISION_PASS_PROMPT_SNAPSHOT_PAGE = 12;
export const PAGE_VISION_PASS_PROMPT_SNAPSHOT_TOTAL = 130;

export const PAGE_VISION_PASS_SYSTEM_INSTRUCTION = `Eres analista de identidad visual y maquetación editorial.
Invoca la herramienta report_page_vision_analysis con el schema acordado.
Si no hay evidencia clara, usa "unknown" y baja confidence. Nunca inventes logos, textos, hex ni bbox.
El código downstream extrae binarios, fuentes embebidas y hex exactos — tú solo localizas y describes.
Todos los bbox son [x1, y1, x2, y2] normalizados 0–1 (esquinas opuestas), nunca width/height.`;

/** Reglas de índice Nivel 1 slim-6 — recorta output denso (EINF) y corrige catalogo26. */
export const PAGE_VISION_NIVEL1_INDEX_RULES = `Reglas PÁGINA ÍNDICE (pageKind=indice):
- Cabeceras de sección numeradas ("1. Carta del Presidente", "7.2 Entorno de mercado", capítulos de informe) NO se listan — son estructura editorial, no obra ni marca: OMÍTELAS por completo (no contentTitles, no typographyRoles.sampleText).
- Solo contentTitles con kind=titulo_obra para obras/productos/campañas comercializables — ej. catálogo: "Física o Química"=titulo_obra; informe: "Carta del Presidente"=omitir.
- Índice sin obras comerciales (informe anual): contentTitles: [] es correcto.
- typographyRoles.sampleText = espécimen tipográfico (estilo/fuente), NO títulos de obras; si no hay espécimen, sampleText: "unknown".`;

const CONTRACT_EXAMPLE = `{
  "logoInstances": [{
    "bbox": [0.06, 0.02, 0.28, 0.09],
    "variant": "horizontal",
    "onBackground": "oscuro",
    "textInLogo": "MARCA-EJEMPLO",
    "isComplete": true,
    "cutEdges": [],
    "confidence": 0.93
  }],
  "brandNameEvidence": [{
    "text": "dominio-ejemplo.invalid",
    "kind": "dominio_pie",
    "bbox": [0.30, 0.96, 0.70, 0.985]
  }, {
    "text": "MARCA-EJEMPLO",
    "kind": "wordmark_logo",
    "bbox": [0.06, 0.02, 0.28, 0.09]
  }],
  "typographyRoles": [{
    "role": "display",
    "sampleText": "TITULAR DE MUESTRA",
    "bbox": [0.1, 0.4, 0.6, 0.5],
    "styleObserved": "texto de muestra para estilo tipográfico"
  }],
  "brandSurfaces": [[0.0, 0.90, 1.0, 1.0]],
  "images": [{
    "bbox": [0.05, 0.10, 0.48, 0.55],
    "visualDna": {
      "sujeto": "descripción de sujeto de muestra",
      "ropa": "prenda de muestra",
      "lugar": "entorno de muestra",
      "animo": "ánimo de muestra",
      "estiloArtistico": "estilo artístico de muestra",
      "encuadre": "encuadre de muestra",
      "luzTratamiento": "luz de muestra",
      "paletaAprox": ["#000001", "#000002", "#000003"],
      "texturas": "textura de muestra",
      "vozVisual": "voz visual de muestra"
    },
    "esFotoDeProducto": true,
    "confidence": 0.88
  }],
  "pageKind": "ficha_contenido"
}`;

const CONTRACT_RULES = `Reglas del contrato (no negociables):

1. TODOS los bbox (logoInstances, brandNameEvidence, typographyRoles, images, brandSurfaces): [x1, y1, x2, y2] normalizado 0–1, esquinas opuestas, con x2 > x1 e y2 > y1. NUNCA uses [x, y, width, height].
2. brandSurfaces: superficies de color de MARCA (bandas de plantilla, fondos corporativos). NO incluyas áreas de fotografías.
3. Cualquier campo de texto admite "unknown" si no hay evidencia clara.
4. confidence obligatoria (0–1) en logoInstances e images.
5. Enums cerrados:
   - logoInstances.variant: horizontal | isotipo | vertical | monocromo | unknown
   - logoInstances.onBackground: claro | oscuro | fotografia | unknown
   - logoInstances.cutEdges[]: top | bottom | left | right | unknown
   - brandNameEvidence.kind: dominio_pie | wordmark_logo | titulo_prominente | lista_indice | unknown
   - typographyRoles.role: display | titular | cuerpo | pie | etiqueta | unknown
   - pageKind: portada | indice | ficha_contenido | editorial | contraportada | asset_marca | otro | unknown
6. pageKind es clave de arbitraje:
   - asset_marca = archivo de imagen suelto o página que es puro asset de marca.
   - otro = página vista que no encaja en ninguna categoría (separador, publicidad, en blanco…).
   - En ficha_contenido o indice, titulares grandes suelen ser PRODUCTO/CONTENIDO, no marca emisora.
   - kind lista_indice o titulares en listados → producto, nunca nombre de marca.
   - wordmark_logo y dominio_pie en plantilla recurrente → señal de marca emisora.
7. logoInstances: solo logotipos completos o casi completos de la marca emisora — NO iconos de sección, NO marcas de terceros salvo empaquetado claro.
8. brandNameEvidence (OBLIGATORIO — misma prioridad que logoInstances):
   - Si logoInstances no está vacío: incluye al menos una entrada kind=wordmark_logo con text=textInLogo del logo principal y bbox alineado con su logoInstances[0].bbox.
   - Si hay email, dominio web o URL en pie de página: incluye kind=dominio_pie con el texto literal y bbox del pie.
   - No dejes brandNameEvidence vacío en portada, asset_marca o contraportada si hay logo o pie de contacto visible.
   - En indice/ficha_contenido: lista_indice para títulos de producto; NO confundir con marca emisora.
9. images + visualDna: solo fotografías/ilustraciones de referencia o material de producto dentro del bbox. Rellena solo lo observable en el bbox; usa "unknown" cuando no veas el detalle — es respuesta correcta, no fallo. paletaAprox son pistas (#RRGGBB o "unknown"), no fuente de verdad.
10. esFotoDeProducto=true = fotografía/ilustración de producto, contenido editorial o referencia de estilo de marca; false = textura decorativa, fondo abstracto o elemento no fotográfico.
11. Si no hay logos: logoInstances: []. Si no hay imágenes: images: []. Arrays vacíos, no null.
12. Los strings del ejemplo (${PAGE_VISION_PROMPT_PLACEHOLDER_LITERALS.slice(0, 3).join(", ")}, etc.) son PLACEHOLDERS — nunca los copies; describe solo lo visible en la página adjunta.`;

export type BuildPageVisionPassPromptInput = {
  pageNumber: number;
  totalPages: number;
};

export function buildPageVisionPassUserPrompt(input: BuildPageVisionPassPromptInput): string {
  return `Analiza UNA sola página renderizada de un documento PDF de marca (deck, manual, catálogo).
Página ${input.pageNumber} de ${input.totalPages} del documento.

Invoca report_page_vision_analysis con esta forma (SOLO estructura — valores del ejemplo son ficticios):

${CONTRACT_EXAMPLE}

${CONTRACT_RULES}

Recuerda: bbox siempre [x1,y1,x2,y2]. Si dudas, "unknown" y confidence baja.`;
}

/** Texto canónico para candado anti-deriva (snapshot SHA-256). */
export function canonicalPageVisionPassPromptText(
  pageNumber = PAGE_VISION_PASS_PROMPT_SNAPSHOT_PAGE,
  totalPages = PAGE_VISION_PASS_PROMPT_SNAPSHOT_TOTAL,
): string {
  return `${PAGE_VISION_PASS_SYSTEM_INSTRUCTION}\n---\n${buildPageVisionPassUserPrompt({ pageNumber, totalPages })}`;
}

/** SHA-256 de canonicalPageVisionPassPromptText() — bump GENOMA_PAGE_VISION_PASS_VERSION si cambia el prompt. */
export const PAGE_VISION_PASS_PROMPT_SHA256 =
  "dd74f65a146e5e00ea7cff94aaddd9b0cd353d100d207c6b1ffae43327b73352";

export const PAGE_VISION_PASS_TOOL_NAME = "report_page_vision_analysis";

export const pageVisionPassToolDeclaration = {
  name: PAGE_VISION_PASS_TOOL_NAME,
  description:
    "Informe estructurado de una página PDF: logos, evidencia de marca, tipografía observada, superficies de color de plantilla e imágenes con ADN visual denso.",
  parameters: {
    type: "object",
    required: ["logoInstances", "brandNameEvidence", "typographyRoles", "brandSurfaces", "images", "pageKind"],
    properties: {
      logoInstances: {
        type: "array",
        items: {
          type: "object",
          required: [
            "bbox",
            "variant",
            "onBackground",
            "textInLogo",
            "isComplete",
            "cutEdges",
            "confidence",
          ],
          properties: {
            bbox: {
              type: "array",
              description: "[x1, y1, x2, y2] normalized 0-1, x2>x1, y2>y1",
              items: { type: "number", minimum: 0, maximum: 1 },
              minItems: 4,
              maxItems: 4,
            },
            variant: {
              type: "string",
              enum: ["horizontal", "isotipo", "vertical", "monocromo", "unknown"],
            },
            onBackground: {
              type: "string",
              enum: ["claro", "oscuro", "fotografia", "unknown"],
            },
            textInLogo: { type: "string" },
            isComplete: { type: "boolean" },
            cutEdges: {
              type: "array",
              items: { type: "string", enum: ["top", "bottom", "left", "right", "unknown"] },
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      brandNameEvidence: {
        type: "array",
        items: {
          type: "object",
          required: ["text", "kind", "bbox"],
          properties: {
            text: { type: "string" },
            kind: {
              type: "string",
              enum: ["dominio_pie", "wordmark_logo", "titulo_prominente", "lista_indice", "seccion_documento", "unknown"],
            },
            bbox: {
              type: "array",
              items: { type: "number", minimum: 0, maximum: 1 },
              minItems: 4,
              maxItems: 4,
            },
          },
        },
      },
      typographyRoles: {
        type: "array",
        items: {
          type: "object",
          required: ["role", "sampleText", "bbox", "styleObserved"],
          properties: {
            role: {
              type: "string",
              enum: ["display", "titular", "cuerpo", "pie", "etiqueta", "unknown"],
            },
            sampleText: { type: "string" },
            bbox: {
              type: "array",
              items: { type: "number", minimum: 0, maximum: 1 },
              minItems: 4,
              maxItems: 4,
            },
            styleObserved: { type: "string" },
          },
        },
      },
      brandSurfaces: {
        type: "array",
        items: {
          type: "array",
          description: "[x1, y1, x2, y2] normalized",
          items: { type: "number", minimum: 0, maximum: 1 },
          minItems: 4,
          maxItems: 4,
        },
      },
      images: {
        type: "array",
        items: {
          type: "object",
          required: ["bbox", "visualDna", "esFotoDeProducto", "confidence"],
          properties: {
            bbox: {
              type: "array",
              items: { type: "number", minimum: 0, maximum: 1 },
              minItems: 4,
              maxItems: 4,
            },
            visualDna: {
              type: "object",
              required: [
                "sujeto",
                "ropa",
                "lugar",
                "animo",
                "estiloArtistico",
                "encuadre",
                "luzTratamiento",
                "paletaAprox",
                "texturas",
                "vozVisual",
              ],
              properties: {
                sujeto: { type: "string" },
                ropa: { type: "string" },
                lugar: { type: "string" },
                animo: { type: "string" },
                estiloArtistico: { type: "string" },
                encuadre: { type: "string" },
                luzTratamiento: { type: "string" },
                paletaAprox: { type: "array", items: { type: "string" } },
                texturas: { type: "string" },
                vozVisual: { type: "string" },
              },
            },
            esFotoDeProducto: { type: "boolean" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      pageKind: {
        type: "string",
        enum: [
          "portada",
          "indice",
          "ficha_contenido",
          "editorial",
          "contraportada",
          "asset_marca",
          "otro",
          "unknown",
        ],
      },
    },
  },
} as const;

export const PAGE_VISION_BATCH_TOOL_NAME = "report_page_vision_batch_analysis";

const slimTypographyItem = {
  type: "object",
  required: ["role", "bbox"],
  properties: {
    role: {
      type: "string",
      enum: ["display", "titular", "cuerpo", "pie", "etiqueta", "unknown"],
    },
    bbox: {
      type: "array",
      items: { type: "number" },
      minItems: 4,
      maxItems: 4,
    },
    styleObserved: { type: "string", description: "≤80 chars, opcional" },
    sampleText: {
      type: "string",
      description:
        '≤120 chars; espécimen tipográfico (estilo/fuente). En índice: "unknown" salvo espécimen real — NUNCA títulos de obras del índice',
    },
  },
} as const;

const slimEmitterBneItem = {
  type: "object",
  required: ["text", "kind", "bbox"],
  properties: {
    text: { type: "string", description: "≤300 chars" },
    kind: {
      type: "string",
      enum: ["dominio_pie", "wordmark_logo", "titulo_prominente"],
      description: "Solo evidencia emisora con bbox — NO títulos de índice",
    },
    bbox: {
      type: "array",
      items: { type: "number" },
      minItems: 4,
      maxItems: 4,
    },
  },
} as const;

/** Schema batch Nivel 1 slim-4 — contentTitles plano; BNE solo emisor. */
export const pageVisionNivel1BatchToolDeclaration = {
  name: PAGE_VISION_BATCH_TOOL_NAME,
  description:
    "Ingesta Nivel 1: logos, evidencia emisora con bbox, contentTitles sin bbox, tipografía mínima, triaje profundo.",
  parameters: {
    type: "object",
    required: ["pages"],
    properties: {
      docKind: { type: "string" },
      emitterBrandHint: { type: "string" },
      deepPassTriagedPages: { type: "array", items: { type: "number" } },
      deepPassTriagedImages: {
        type: "array",
        items: {
          type: "object",
          required: ["pageNumber", "bbox"],
          properties: {
            pageNumber: { type: "number" },
            bbox: {
              type: "array",
              items: { type: "number" },
              minItems: 4,
              maxItems: 4,
            },
            tag: { type: "string" },
          },
        },
      },
      pages: {
        type: "array",
        items: {
          type: "object",
          required: [
            "pageTag",
            "pageNumber",
            "logoInstances",
            "brandNameEvidence",
            "contentTitles",
            "typographyRoles",
            "pageKind",
          ],
          properties: {
            pageTag: { type: "string" },
            pageNumber: { type: "number" },
            logoInstances: pageVisionPassToolDeclaration.parameters.properties.logoInstances,
            brandNameEvidence: {
              type: "array",
              items: slimEmitterBneItem,
              maxItems: 5,
            },
            contentTitles: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                required: ["text", "kind"],
                properties: {
                  text: { type: "string", description: "Título de obra/producto/campaña" },
                  kind: {
                    type: "string",
                    enum: ["titulo_obra"],
                    description:
                      "Solo obras/productos/campañas — NO cabeceras numeradas de sección (omitir por completo)",
                  },
                },
              },
              description:
                "Índice/ficha: solo titulo_obra para obras comercializables; cabeceras de sección numeradas se omiten — max 20.",
            },
            typographyRoles: { type: "array", items: slimTypographyItem },
            pageKind: pageVisionPassToolDeclaration.parameters.properties.pageKind,
          },
        },
      },
    },
  },
} as const;

/** @deprecated usar pageVisionNivel1BatchToolDeclaration */
export const pageVisionBatchToolDeclaration = pageVisionNivel1BatchToolDeclaration;
