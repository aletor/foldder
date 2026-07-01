export type StudioCanvasPresetIconKind =
  | "monitor"
  | "square"
  | "portrait"
  | "vertical"
  | "image"
  | "panoramic"
  | "landscape";

export type StudioCanvasPresetBrand =
  | "web"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "facebook"
  | "print";

export type StudioCanvasPresetDef = {
  id: string;
  icon: StudioCanvasPresetIconKind;
  category: string;
  title: string;
  width: number;
  height: number;
  brand?: StudioCanvasPresetBrand;
};

export const STUDIO_CANVAS_PRESETS_WEB: readonly StudioCanvasPresetDef[] = [
  { id: "web-small", icon: "monitor", category: "Monitor", title: "Web Small", width: 1024, height: 768, brand: "web" },
  { id: "web-common", icon: "monitor", category: "Monitor", title: "Web Common", width: 1366, height: 768, brand: "web" },
  { id: "web-large", icon: "monitor", category: "Monitor", title: "Web Large", width: 1920, height: 1080, brand: "web" },
  { id: "ig-post", icon: "square", category: "Cuadrado", title: "Instagram Post", width: 1080, height: 1080, brand: "instagram" },
  { id: "ig-portrait", icon: "portrait", category: "Retrato", title: "Instagram Portrait", width: 1080, height: 1350, brand: "instagram" },
  { id: "ig-reel", icon: "vertical", category: "Vertical", title: "Instagram Reel", width: 1080, height: 1920, brand: "instagram" },
  { id: "tiktok", icon: "vertical", category: "Vertical", title: "TikTok", width: 1080, height: 1920, brand: "tiktok" },
  { id: "yt-thumb", icon: "image", category: "Imagen", title: "YouTube Thumbnail", width: 1280, height: 720, brand: "youtube" },
  { id: "yt-banner", icon: "panoramic", category: "Panorámico", title: "YouTube Banner", width: 2560, height: 1440, brand: "youtube" },
  { id: "twitter", icon: "landscape", category: "Paisaje", title: "Twitter/X Post", width: 1600, height: 900, brand: "x" },
  { id: "fb-post", icon: "landscape", category: "Paisaje", title: "Facebook Post", width: 1200, height: 630, brand: "facebook" },
  { id: "fb-cover", icon: "panoramic", category: "Panorámico", title: "Facebook Cover", width: 1640, height: 624, brand: "facebook" },
] as const;

export const STUDIO_CANVAS_PRESETS_ART: readonly StudioCanvasPresetDef[] = [
  { id: "a4-v", icon: "portrait", category: "Retrato", title: "A4 Vertical", width: 2480, height: 3508, brand: "print" },
  { id: "a4-h", icon: "landscape", category: "Paisaje", title: "A4 Horizontal", width: 3508, height: 2480, brand: "print" },
  { id: "a3-v", icon: "portrait", category: "Retrato", title: "A3 Vertical", width: 3508, height: 4961, brand: "print" },
  { id: "a3-h", icon: "landscape", category: "Paisaje", title: "A3 Horizontal", width: 4961, height: 3508, brand: "print" },
] as const;

export const STUDIO_CANVAS_PRESET_BRAND_META: Record<
  StudioCanvasPresetBrand,
  { accent: string; tileBg: string; tileActiveBg: string; iconBg: string; iconColor: string }
> = {
  web: {
    accent: "#71449f",
    tileBg: "rgba(113, 68, 159, 0.06)",
    tileActiveBg: "rgba(113, 68, 159, 0.18)",
    iconBg: "#71449f",
    iconColor: "#ffffff",
  },
  instagram: {
    accent: "#E4405F",
    tileBg: "rgba(228, 64, 95, 0.08)",
    tileActiveBg: "rgba(228, 64, 95, 0.2)",
    iconBg: "linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCAF45 100%)",
    iconColor: "#ffffff",
  },
  tiktok: {
    accent: "#EE1D52",
    tileBg: "rgba(238, 29, 82, 0.08)",
    tileActiveBg: "rgba(238, 29, 82, 0.18)",
    iconBg: "#010101",
    iconColor: "#ffffff",
  },
  youtube: {
    accent: "#FF0000",
    tileBg: "rgba(255, 0, 0, 0.08)",
    tileActiveBg: "rgba(255, 0, 0, 0.18)",
    iconBg: "#FF0000",
    iconColor: "#ffffff",
  },
  x: {
    accent: "#ffffff",
    tileBg: "rgba(255, 255, 255, 0.05)",
    tileActiveBg: "rgba(255, 255, 255, 0.12)",
    iconBg: "#000000",
    iconColor: "#ffffff",
  },
  facebook: {
    accent: "#1877F2",
    tileBg: "rgba(24, 119, 242, 0.08)",
    tileActiveBg: "rgba(24, 119, 242, 0.2)",
    iconBg: "#1877F2",
    iconColor: "#ffffff",
  },
  print: {
    accent: "#c9a96e",
    tileBg: "rgba(201, 169, 110, 0.08)",
    tileActiveBg: "rgba(201, 169, 110, 0.18)",
    iconBg: "#3d3428",
    iconColor: "#f5e6c8",
  },
};

export function resolveStudioCanvasPresetBrand(p: StudioCanvasPresetDef): StudioCanvasPresetBrand {
  return p.brand ?? "web";
}

export function findStudioCanvasPresetById(id: string | null | undefined): StudioCanvasPresetDef | null {
  if (!id) return null;
  return (
    STUDIO_CANVAS_PRESETS_WEB.find((row) => row.id === id) ??
    STUDIO_CANVAS_PRESETS_ART.find((row) => row.id === id) ??
    null
  );
}

export function findStudioCanvasPresetIdForSize(w: number, h: number): string | null {
  for (const p of STUDIO_CANVAS_PRESETS_WEB) {
    if (p.width === w && p.height === h) return p.id;
  }
  for (const p of STUDIO_CANVAS_PRESETS_ART) {
    if (p.width === w && p.height === h) return p.id;
  }
  return null;
}

export function studioCanvasPresetTabForId(id: string | null): "web" | "art" {
  if (!id) return "web";
  return STUDIO_CANVAS_PRESETS_ART.some((p) => p.id === id) ? "art" : "web";
}

export function resolveStudioCanvasFormatDisplay(args: {
  width: number;
  height: number;
  presetId?: string | null;
}): {
  preset: StudioCanvasPresetDef | null;
  sizeLabel: string;
} {
  const byId = findStudioCanvasPresetById(args.presetId);
  const preset =
    byId && byId.width === args.width && byId.height === args.height
      ? byId
      : findStudioCanvasPresetById(findStudioCanvasPresetIdForSize(args.width, args.height));
  return {
    preset,
    sizeLabel: `${args.width}×${args.height}px`,
  };
}
