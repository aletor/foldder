/**
 * Colores de aristas / handles por tipo de dato (mismo criterio que `spaces.css` .handle-*).
 */

export const HANDLE_COLORS: Record<string, string> = {
  prompt: "#3b82f6",
  video: "#f43f5e",
  image: "#ec4899",
  image2: "#ec4899",
  image3: "#ec4899",
  image4: "#ec4899",
  sound: "#a855f7",
  mask: "#06b6d4",
  pdf: "#f97316",
  txt: "#f59e0b",
  url: "#10b981",
  rose: "#f43f5e",
  emerald: "#10b981",
};

export const DEFAULT_EDGE_COLOR = "#94a3b8";

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
