import type { DevelopSettings, LightroomSlider } from "../lightroom-develop-settings";
import { EMPTY_DEVELOP_SETTINGS, LIGHTROOM_SLIDER_MAX, LIGHTROOM_SLIDER_MIN } from "../lightroom-develop-settings";

export type DevelopPreset = {
  id: string;
  name: string;
  /** CSS gradient para miniatura en la lista */
  thumb: string;
  settings: DevelopSettings;
};

export const BUILTIN_DEVELOP_PRESETS: DevelopPreset[] = [
  {
    id: "default",
    name: "Predeterminado",
    thumb: "linear-gradient(135deg, #64748b, #cbd5e1)",
    settings: structuredClone(EMPTY_DEVELOP_SETTINGS),
  },
  {
    id: "natural",
    name: "Natural",
    thumb: "linear-gradient(135deg, #8b7355, #d4c4a8)",
    settings: {
      ...structuredClone(EMPTY_DEVELOP_SETTINGS),
      basic: {
        ...EMPTY_DEVELOP_SETTINGS.basic,
        contrast: 8,
        shadows: 12,
        vibrance: 10,
      },
    },
  },
  {
    id: "vivid",
    name: "Vívido",
    thumb: "linear-gradient(135deg, #e11d48, #f97316, #eab308)",
    settings: {
      ...structuredClone(EMPTY_DEVELOP_SETTINGS),
      basic: {
        ...EMPTY_DEVELOP_SETTINGS.basic,
        contrast: 18,
        saturation: 22,
        vibrance: 35,
        clarity: 12,
      },
    },
  },
  {
    id: "soft",
    name: "Suave",
    thumb: "linear-gradient(135deg, #a8a29e, #fafaf9)",
    settings: {
      ...structuredClone(EMPTY_DEVELOP_SETTINGS),
      basic: {
        ...EMPTY_DEVELOP_SETTINGS.basic,
        contrast: -12,
        highlights: -15,
        shadows: 18,
        texture: -8,
      },
    },
  },
  {
    id: "bw",
    name: "B&N suave",
    thumb: "linear-gradient(135deg, #171717, #737373, #fafafa)",
    settings: {
      ...structuredClone(EMPTY_DEVELOP_SETTINGS),
      basic: {
        ...EMPTY_DEVELOP_SETTINGS.basic,
        saturation: -100,
        contrast: 15,
        clarity: 8,
      },
    },
  },
];

export type WbPresetId = "auto" | "daylight" | "shade" | "tungsten" | "fluorescent" | "flash";

export type WbPreset = {
  id: WbPresetId;
  label: string;
  temp: LightroomSlider;
  tint: LightroomSlider;
};

export const WB_PRESETS: WbPreset[] = [
  { id: "auto", label: "Auto", temp: 0, tint: 0 },
  { id: "daylight", label: "Luz día", temp: 15, tint: 0 },
  { id: "shade", label: "Sombra", temp: 28, tint: 8 },
  { id: "tungsten", label: "Tungsteno", temp: -35, tint: 0 },
  { id: "fluorescent", label: "Fluorescente", temp: -12, tint: 18 },
  { id: "flash", label: "Flash", temp: 12, tint: 0 },
];

export type ProfileOption = {
  id: DevelopSettings["profile"];
  label: string;
  thumb: string;
  profileBaseEnabled: boolean;
};

export const PROFILE_OPTIONS: ProfileOption[] = [
  {
    id: "canon-like",
    label: "Adobe Color",
    thumb: "linear-gradient(135deg, #1e3a5f, #c4a882, #f0e6d3)",
    profileBaseEnabled: true,
  },
  {
    id: "canon-like",
    label: "Camera Standard",
    thumb: "linear-gradient(135deg, #334155, #94a3b8, #f1f5f9)",
    profileBaseEnabled: false,
  },
  {
    id: "neutral",
    label: "Plano (lineal)",
    thumb: "linear-gradient(135deg, #475569, #64748b)",
    profileBaseEnabled: false,
  },
];

/** Heurística simple: clic en gris neutro → temp/tint. */
export function wbFromNeutralSample(r: number, g: number, b: number): { temp: LightroomSlider; tint: LightroomSlider } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const avg = (rn + gn + bn) / 3;
  if (avg < 0.01) return { temp: 0, tint: 0 };
  const rRatio = rn / avg;
  const bRatio = bn / avg;
  const gRatio = gn / avg;
  const temp = Math.round(Math.max(LIGHTROOM_SLIDER_MIN, Math.min(LIGHTROOM_SLIDER_MAX, (rRatio - bRatio) * 120)));
  const tint = Math.round(Math.max(LIGHTROOM_SLIDER_MIN, Math.min(LIGHTROOM_SLIDER_MAX, (gRatio - 1) * 140)));
  return { temp, tint };
}
