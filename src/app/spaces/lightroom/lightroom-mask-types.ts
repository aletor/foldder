/**
 * Máscaras manuales — contenedor de componentes (modelo Lightroom).
 * Cada capa (`MaskAdjustmentLayer`) agrupa componentes con mode add/subtract.
 */

import type { DevelopSettings } from "./lightroom-develop-settings";
import { EMPTY_DEVELOP_SETTINGS, isDevelopSettingsDefault, normalizeDevelopSettings } from "./lightroom-develop-settings";

/** Modo de composición del componente dentro de la máscara. */
export type ComponentMode = "add" | "subtract";

/** @deprecated usar ComponentMode; intersect no se expone en UI */
export type MaskCombineOp = ComponentMode | "intersect";

export type MaskComponentType = "brush" | "linear" | "radial" | "colorRange" | "luminanceRange";

export type MaskTool = MaskComponentType | "none";

/** Punto normalizado 0…1 en espacio imagen. */
export type NormalizedPoint = { x: number; y: number };

type ComponentBase = {
  id: string;
  combine: MaskCombineOp;
};

export type LinearGradientMask = ComponentBase & {
  type: "linear";
  a: NormalizedPoint;
  b: NormalizedPoint;
  feather: number;
  invert: boolean;
};

export type RadialGradientMask = ComponentBase & {
  type: "radial";
  center: NormalizedPoint;
  radius: number;
  feather: number;
  invert: boolean;
};

export type BrushMask = ComponentBase & {
  type: "brush";
  alphaDataUrl?: string;
  size: number;
  hardness: number;
  flow: number;
  density: number;
};

export type ColorRangeMask = ComponentBase & {
  type: "colorRange";
  color: { r: number; g: number; b: number };
  tolerance: number;
  smoothness: number;
  invert: boolean;
};

export type LuminanceRangeMask = ComponentBase & {
  type: "luminanceRange";
  min: number;
  max: number;
  smoothness: number;
  invert: boolean;
};

export type MaskPrimitive =
  | LinearGradientMask
  | RadialGradientMask
  | BrushMask
  | ColorRangeMask
  | LuminanceRangeMask;

export type MaskAdjustmentLayer = {
  id: string;
  name: string;
  enabled: boolean;
  /** Invierte el alfa compuesto de la máscara. */
  inverted: boolean;
  /** Intensidad global del efecto local 0…100. */
  amount: number;
  settings: DevelopSettings;
  masks: MaskPrimitive[];
};

export type LightroomDevelopDocument = {
  global: DevelopSettings;
  maskLayers: MaskAdjustmentLayer[];
};

export const MASK_TYPE_LABELS: Record<MaskComponentType, string> = {
  brush: "Pincel",
  linear: "Degradado lineal",
  radial: "Degradado radial",
  colorRange: "Rango de color",
  luminanceRange: "Rango de luminancia",
};

export const EMPTY_DEVELOP_DOCUMENT: LightroomDevelopDocument = {
  global: EMPTY_DEVELOP_SETTINGS,
  maskLayers: [],
};

export function componentMode(mask: MaskPrimitive): ComponentMode {
  return mask.combine === "subtract" ? "subtract" : "add";
}

export function createMaskLayer(name?: string): MaskAdjustmentLayer {
  return {
    id: crypto.randomUUID(),
    name: name ?? `Máscara ${Date.now().toString(36).slice(-4)}`,
    enabled: true,
    inverted: false,
    amount: 100,
    settings: structuredClone(EMPTY_DEVELOP_SETTINGS),
    masks: [],
  };
}

export function createMaskPrimitive(type: MaskComponentType, mode: ComponentMode = "add"): MaskPrimitive {
  const combine: MaskCombineOp = mode;
  const id = crypto.randomUUID();
  switch (type) {
    case "linear":
      return { ...defaultLinearMask(), id, combine };
    case "radial":
      return { ...defaultRadialMask(), id, combine };
    case "brush":
      return { ...defaultBrushMask(), id, combine };
    case "colorRange":
      return { ...defaultColorRangeMask(), id, combine };
    case "luminanceRange":
      return { ...defaultLuminanceRangeMask(), id, combine };
  }
}

export function primaryMaskType(layer: MaskAdjustmentLayer): MaskComponentType | null {
  return layer.masks[0]?.type ?? null;
}

export function defaultLinearMask(): Omit<LinearGradientMask, "id"> {
  return {
    type: "linear",
    a: { x: 0.15, y: 0.5 },
    b: { x: 0.85, y: 0.5 },
    feather: 0.35,
    invert: false,
    combine: "add",
  };
}

export function defaultRadialMask(): Omit<RadialGradientMask, "id"> {
  return {
    type: "radial",
    center: { x: 0.5, y: 0.5 },
    radius: 0.25,
    feather: 0.4,
    invert: false,
    combine: "add",
  };
}

export function defaultBrushMask(): Omit<BrushMask, "id"> {
  return {
    type: "brush",
    size: 40,
    hardness: 0.7,
    flow: 0.8,
    density: 1,
    combine: "add",
  };
}

export function defaultColorRangeMask(): Omit<ColorRangeMask, "id"> {
  return {
    type: "colorRange",
    color: { r: 0.5, g: 0.5, b: 0.5 },
    tolerance: 35,
    smoothness: 0.25,
    invert: false,
    combine: "add",
  };
}

export function defaultLuminanceRangeMask(): Omit<LuminanceRangeMask, "id"> {
  return {
    type: "luminanceRange",
    min: 25,
    max: 75,
    smoothness: 0.2,
    invert: false,
    combine: "add",
  };
}

function normalizePrimitive(raw: MaskPrimitive): MaskPrimitive {
  const combine: MaskCombineOp =
    raw.combine === "subtract" ? "subtract" : raw.combine === "intersect" ? "add" : "add";
  return {
    ...raw,
    id: raw.id ?? crypto.randomUUID(),
    combine,
  } as MaskPrimitive;
}

export function normalizeDevelopDocument(raw?: Partial<LightroomDevelopDocument> | null): LightroomDevelopDocument {
  if (!raw) return structuredClone(EMPTY_DEVELOP_DOCUMENT);
  return {
    global: normalizeDevelopSettings(raw.global),
    maskLayers: (raw.maskLayers ?? []).map((layer, i) => ({
      id: layer.id ?? crypto.randomUUID(),
      name: layer.name?.startsWith("Capa") ? `Máscara ${i + 1}` : (layer.name ?? `Máscara ${i + 1}`),
      enabled: layer.enabled ?? true,
      inverted: layer.inverted ?? false,
      amount: typeof layer.amount === "number" ? Math.max(0, Math.min(100, layer.amount)) : 100,
      settings: layer.settings ? normalizeDevelopSettings(layer.settings) : structuredClone(EMPTY_DEVELOP_SETTINGS),
      masks: (layer.masks ?? []).map((m) => normalizePrimitive(m as MaskPrimitive)),
    })),
  };
}

export function isDevelopDocumentDefault(doc: LightroomDevelopDocument): boolean {
  if (!isDevelopSettingsDefault(doc.global)) return false;
  if (doc.maskLayers.length === 0) return true;
  return doc.maskLayers.every(
    (layer) =>
      !layer.enabled ||
      (layer.masks.length === 0 && isDevelopSettingsDefault(layer.settings) && !layer.inverted && layer.amount === 100),
  );
}

export function developDocumentFromNode(
  global?: DevelopSettings | null,
  maskLayers?: MaskAdjustmentLayer[] | null,
): LightroomDevelopDocument {
  return normalizeDevelopDocument({
    global: normalizeDevelopSettings(global),
    maskLayers: maskLayers ?? [],
  });
}

export function duplicateMaskPrimitive(mask: MaskPrimitive): MaskPrimitive {
  const copy = structuredClone(mask);
  copy.id = crypto.randomUUID();
  return copy;
}
