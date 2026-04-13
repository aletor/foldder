/**
 * Colores de aristas / handles por tipo de dato (mismo criterio que `spaces.css` .handle-*).
 */

import { NODE_REGISTRY, type HandleType } from "./nodeRegistry";

/** Color del icono F del logo (login SVG). Imagen y vídeo en el lienzo comparten este acento. */
export const FOLDDER_LOGO_BLUE = "#6C5CE7";

export const HANDLE_COLORS: Record<string, string> = {
  prompt: "#3b82f6",
  video: FOLDDER_LOGO_BLUE,
  image: FOLDDER_LOGO_BLUE,
  image2: FOLDDER_LOGO_BLUE,
  image3: FOLDDER_LOGO_BLUE,
  image4: FOLDDER_LOGO_BLUE,
  sound: "#a855f7",
  mask: "#06b6d4",
  pdf: "#f97316",
  txt: "#f59e0b",
  url: "#10b981",
  rose: "#f43f5e",
  emerald: "#10b981",
};

export const DEFAULT_EDGE_COLOR = "#94a3b8";

/** Nodos que conservan el acento (logo) en vidrio/cabecera/botón; el resto igual que Image Export. */
const ACCENT_SURFACE_NODE_TYPES = new Set<string>(["nanoBanana", "geminiVideo", "vfxGenerator", "grokProcessor"]);

/** Salida “principal” para el anillo del nodo: prioriza imagen/vídeo/prompt frente a mask/json cuando hay varias. */
const PRIMARY_OUTPUT_PRIORITY: HandleType[] = [
  "image",
  "video",
  "prompt",
  "mask",
  "url",
  "audio",
  "txt",
  "pdf",
  "json",
];

function pickPrimaryOutputType(outputs: { type: HandleType }[]): HandleType | undefined {
  if (!outputs?.length) return undefined;
  for (const p of PRIMARY_OUTPUT_PRIORITY) {
    const found = outputs.find((o) => o.type === p);
    if (found) return found.type;
  }
  return outputs[0].type;
}

function handleTypeToBorderColor(t: HandleType): string {
  if (t === "audio") return HANDLE_COLORS.sound;
  if (t === "json") return HANDLE_COLORS.txt;
  return HANDLE_COLORS[t as keyof typeof HANDLE_COLORS] ?? DEFAULT_EDGE_COLOR;
}

/**
 * Color del borde discontinuo del lienzo (leyenda / handles).
 * `mediaInput`: sigue `data.type` cuando hay contenido; si aún no hay tipo, gris neutro.
 */
export function getFoldderNodeOutputBorderColor(node: {
  type?: string;
  data?: Record<string, unknown> | null;
}): string {
  const rfType = node.type;
  if (!rfType) return DEFAULT_EDGE_COLOR;

  if (rfType === "mediaInput") {
    const mt = node.data?.type;
    if (typeof mt !== "string" || !mt) return DEFAULT_EDGE_COLOR;
    switch (mt) {
      case "image":
        return HANDLE_COLORS.image;
      case "video":
        return HANDLE_COLORS.video;
      case "audio":
        return HANDLE_COLORS.sound;
      case "pdf":
        return HANDLE_COLORS.pdf;
      case "txt":
        return HANDLE_COLORS.txt;
      case "url":
        return HANDLE_COLORS.url;
      default:
        return DEFAULT_EDGE_COLOR;
    }
  }

  const meta = NODE_REGISTRY[rfType];
  if (meta?.outputs?.length) {
    const pt = pickPrimaryOutputType(meta.outputs);
    if (pt) return handleTypeToBorderColor(pt);
  }

  return DEFAULT_EDGE_COLOR;
}

/**
 * Tinte de vidrio + cabecera + botón principal: gris como Image Export, salvo Nano Banana, Gemini Video y Grok.
 */
export function getFoldderNodeHeaderTintColor(node: {
  type?: string;
  data?: Record<string, unknown> | null;
}): string {
  const rfType = node.type;
  if (!rfType) return DEFAULT_EDGE_COLOR;

  if (ACCENT_SURFACE_NODE_TYPES.has(rfType)) {
    return getFoldderNodeOutputBorderColor(node);
  }

  return DEFAULT_EDGE_COLOR;
}

/** Entradas únicas para la leyenda (español). */
export const HANDLE_TYPE_LEGEND: { id: string; label: string; color: string }[] = [
  { id: "prompt", label: "Prompt", color: HANDLE_COLORS.prompt },
  { id: "image", label: "Imagen", color: HANDLE_COLORS.image },
  { id: "video", label: "Vídeo", color: HANDLE_COLORS.video },
  { id: "sound", label: "Audio", color: HANDLE_COLORS.sound },
  { id: "mask", label: "Máscara", color: HANDLE_COLORS.mask },
  { id: "url", label: "URL / media", color: HANDLE_COLORS.url },
  { id: "txt", label: "Texto / datos", color: HANDLE_COLORS.txt },
  { id: "pdf", label: "PDF", color: HANDLE_COLORS.pdf },
];
