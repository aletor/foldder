export type ViewportPreset = "desktop" | "tablet" | "phone";

export type ViewportPresetConfig = {
  width: number;
  height: number;
  label: string;
  fluid?: boolean;
};

export const VIEWPORT_PRESETS: Record<ViewportPreset, ViewportPresetConfig> = {
  desktop: { width: 1080, height: 800, label: "Escritorio", fluid: true },
  tablet: { width: 834, height: 1024, label: "Tablet" },
  phone: { width: 390, height: 844, label: "Teléfono" },
};

export const VIEWPORT_ORDER: ViewportPreset[] = ["desktop", "tablet", "phone"];

export function isFluidViewport(preset: ViewportPreset) {
  return VIEWPORT_PRESETS[preset].fluid === true;
}
