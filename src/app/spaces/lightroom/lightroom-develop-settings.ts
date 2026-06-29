/**
 * DevelopSettings — objeto serializable de ajustes no-destructivos (Fase 2+).
 * El motor WebGL aplica un AdjustmentSet sobre una región (imagen entera en Fase 2).
 */

/** Slider centrado en 0, rango −100…+140 (neutro = 0; tope positivo +40 %). */
export type LightroomSlider = number;

export const LIGHTROOM_SLIDER_MIN = -100;
export const LIGHTROOM_SLIDER_MAX = 140;
/** Referencia de escala del shader: ±100 = intensidad «estándar»; hasta 140 = +40 %. */
export const LIGHTROOM_SLIDER_SHADER_REF = 100;

export type HslColorChannel =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "aqua"
  | "blue"
  | "purple"
  | "magenta";

export const HSL_COLOR_CHANNELS: readonly HslColorChannel[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
] as const;

export type CurvePoint = { x: number; y: number };

export type HslChannelAdjust = {
  hue: LightroomSlider;
  saturation: LightroomSlider;
  luminance: LightroomSlider;
};

export type CreativeLutSettings = {
  lutId: string | null;
  enabled: boolean;
  /** 0…100 mezcla sin LUT → LUT completa */
  intensity: number;
};

export type DevelopSettings = {
  /** Perfil de cámara (built-in o .dcp cargado). */
  cameraProfileId: string;
  /** @deprecated usar cameraProfileId */
  profile: "neutral" | "canon-like";
  /** @deprecated usar cameraProfileId */
  profileBaseEnabled: boolean;
  /** LUT creativa .cube post-sRGB (acabado final). */
  creativeLut: CreativeLutSettings;
  basic: {
    temp: LightroomSlider;
    tint: LightroomSlider;
    exposure: LightroomSlider;
    contrast: LightroomSlider;
    highlights: LightroomSlider;
    shadows: LightroomSlider;
    whites: LightroomSlider;
    blacks: LightroomSlider;
    texture: LightroomSlider;
    clarity: LightroomSlider;
    dehaze: LightroomSlider;
    vibrance: LightroomSlider;
    saturation: LightroomSlider;
  };
  toneCurve: {
    paramShadows: LightroomSlider;
    paramDarks: LightroomSlider;
    paramLights: LightroomSlider;
    paramHighlights: LightroomSlider;
    masterPoints: CurvePoint[];
    rgbPoints: {
      r: CurvePoint[];
      g: CurvePoint[];
      b: CurvePoint[];
    };
  };
  hsl: Record<HslColorChannel, HslChannelAdjust>;
  detail: {
    sharpenAmount: LightroomSlider;
    sharpenRadius: LightroomSlider;
    sharpenDetail: LightroomSlider;
    sharpenMasking: LightroomSlider;
    noiseLuminance: LightroomSlider;
    noiseColor: LightroomSlider;
  };
};

export const DEFAULT_CURVE_POINTS: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

function defaultHsl(): Record<HslColorChannel, HslChannelAdjust> {
  return {
    red: { hue: 0, saturation: 0, luminance: 0 },
    orange: { hue: 0, saturation: 0, luminance: 0 },
    yellow: { hue: 0, saturation: 0, luminance: 0 },
    green: { hue: 0, saturation: 0, luminance: 0 },
    aqua: { hue: 0, saturation: 0, luminance: 0 },
    blue: { hue: 0, saturation: 0, luminance: 0 },
    purple: { hue: 0, saturation: 0, luminance: 0 },
    magenta: { hue: 0, saturation: 0, luminance: 0 },
  };
}

import { migrateLegacyProfile } from "./lightroom-profile-registry";

export const EMPTY_CREATIVE_LUT: CreativeLutSettings = {
  lutId: null,
  enabled: false,
  intensity: 100,
};

export const EMPTY_DEVELOP_SETTINGS: DevelopSettings = {
  cameraProfileId: "builtin:adobe-color",
  profile: "canon-like",
  profileBaseEnabled: true,
  creativeLut: { ...EMPTY_CREATIVE_LUT },
  basic: {
    temp: 0,
    tint: 0,
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    texture: 0,
    clarity: 0,
    dehaze: 0,
    vibrance: 0,
    saturation: 0,
  },
  toneCurve: {
    paramShadows: 0,
    paramDarks: 0,
    paramLights: 0,
    paramHighlights: 0,
    masterPoints: [...DEFAULT_CURVE_POINTS],
    rgbPoints: {
      r: [...DEFAULT_CURVE_POINTS],
      g: [...DEFAULT_CURVE_POINTS],
      b: [...DEFAULT_CURVE_POINTS],
    },
  },
  hsl: defaultHsl(),
  detail: {
    sharpenAmount: 0,
    sharpenRadius: 0,
    sharpenDetail: 0,
    sharpenMasking: 0,
    noiseLuminance: 0,
    noiseColor: 0,
  },
};

export function clampLightroomSlider(v: number): LightroomSlider {
  return Math.max(LIGHTROOM_SLIDER_MIN, Math.min(LIGHTROOM_SLIDER_MAX, Math.round(v)));
}

export function normalizeDevelopSettings(raw?: Partial<DevelopSettings> | null): DevelopSettings {
  const base = EMPTY_DEVELOP_SETTINGS;
  if (!raw) return structuredClone(base);
  const cameraProfileId = raw.cameraProfileId ?? migrateLegacyProfile(raw);
  return {
    cameraProfileId,
    profile: raw.profile === "neutral" ? "neutral" : (raw.profile ?? base.profile),
    profileBaseEnabled: raw.profileBaseEnabled ?? base.profileBaseEnabled,
    creativeLut: {
      ...base.creativeLut,
      ...raw.creativeLut,
      intensity: Math.max(0, Math.min(100, Math.round(raw.creativeLut?.intensity ?? base.creativeLut.intensity))),
    },
    basic: { ...base.basic, ...raw.basic },
    toneCurve: {
      ...base.toneCurve,
      ...raw.toneCurve,
      masterPoints: raw.toneCurve?.masterPoints?.length
        ? raw.toneCurve.masterPoints.map((p) => ({ ...p }))
        : [...base.toneCurve.masterPoints],
      rgbPoints: {
        r: raw.toneCurve?.rgbPoints?.r?.length
          ? raw.toneCurve.rgbPoints.r.map((p) => ({ ...p }))
          : [...base.toneCurve.rgbPoints.r],
        g: raw.toneCurve?.rgbPoints?.g?.length
          ? raw.toneCurve.rgbPoints.g.map((p) => ({ ...p }))
          : [...base.toneCurve.rgbPoints.g],
        b: raw.toneCurve?.rgbPoints?.b?.length
          ? raw.toneCurve.rgbPoints.b.map((p) => ({ ...p }))
          : [...base.toneCurve.rgbPoints.b],
      },
    },
    hsl: { ...base.hsl, ...raw.hsl },
    detail: { ...base.detail, ...raw.detail },
  };
}

export function sliderNorm(v: LightroomSlider): number {
  return clampLightroomSlider(v) / LIGHTROOM_SLIDER_SHADER_REF;
}

/** Estilo de relleno para sliders bidireccionales (centro en 0, rangos asimétricos). */
export function bidirectionalFillStyle(
  value: number,
  min: number = LIGHTROOM_SLIDER_MIN,
  max: number = LIGHTROOM_SLIDER_MAX,
): { left: string; width: string } {
  const v = Math.max(min, Math.min(max, Math.round(value)));
  const half = 50;
  if (v >= 0) {
    return { left: "50%", width: max > 0 ? `${(v / max) * half}%` : "0%" };
  }
  const negMin = Math.abs(min);
  const left = 50 + (v / negMin) * half;
  return { left: `${left}%`, width: `${(Math.abs(v) / negMin) * half}%` };
}

function curvePointsEqual(a: CurvePoint[], b: CurvePoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.x === b[i]?.x && p.y === b[i]?.y);
}

export function isDevelopSettingsDefault(settings: DevelopSettings): boolean {
  const d = EMPTY_DEVELOP_SETTINGS;
  if (settings.cameraProfileId !== d.cameraProfileId) return false;
  if (settings.creativeLut.lutId !== d.creativeLut.lutId) return false;
  if (settings.creativeLut.enabled !== d.creativeLut.enabled) return false;
  if (settings.creativeLut.intensity !== d.creativeLut.intensity) return false;
  for (const key of Object.keys(d.basic) as Array<keyof DevelopSettings["basic"]>) {
    if (settings.basic[key] !== d.basic[key]) return false;
  }
  for (const key of Object.keys(d.detail) as Array<keyof DevelopSettings["detail"]>) {
    if (settings.detail[key] !== d.detail[key]) return false;
  }
  const tc = settings.toneCurve;
  const dtc = d.toneCurve;
  if (
    tc.paramShadows !== dtc.paramShadows ||
    tc.paramDarks !== dtc.paramDarks ||
    tc.paramLights !== dtc.paramLights ||
    tc.paramHighlights !== dtc.paramHighlights
  ) {
    return false;
  }
  if (!curvePointsEqual(tc.masterPoints, dtc.masterPoints)) return false;
  if (!curvePointsEqual(tc.rgbPoints.r, dtc.rgbPoints.r)) return false;
  if (!curvePointsEqual(tc.rgbPoints.g, dtc.rgbPoints.g)) return false;
  if (!curvePointsEqual(tc.rgbPoints.b, dtc.rgbPoints.b)) return false;
  for (const ch of HSL_COLOR_CHANNELS) {
    const h = settings.hsl[ch];
    const dh = d.hsl[ch];
    if (h.hue !== dh.hue || h.saturation !== dh.saturation || h.luminance !== dh.luminance) return false;
  }
  return true;
}

export function patchDevelopSettings(
  current: DevelopSettings,
  patch: {
    cameraProfileId?: string;
    creativeLut?: Partial<CreativeLutSettings>;
    profile?: DevelopSettings["profile"];
    profileBaseEnabled?: boolean;
    basic?: Partial<DevelopSettings["basic"]>;
    toneCurve?: Partial<Omit<DevelopSettings["toneCurve"], "rgbPoints">> & {
      rgbPoints?: Partial<DevelopSettings["toneCurve"]["rgbPoints"]>;
    };
    hsl?: Partial<Record<HslColorChannel, Partial<HslChannelAdjust>>>;
    detail?: Partial<DevelopSettings["detail"]>;
  },
): DevelopSettings {
  return normalizeDevelopSettings({
    ...current,
    ...patch,
    creativeLut: patch.creativeLut ? { ...current.creativeLut, ...patch.creativeLut } : current.creativeLut,
    basic: patch.basic ? { ...current.basic, ...patch.basic } : current.basic,
    toneCurve: patch.toneCurve
      ? {
          ...current.toneCurve,
          ...patch.toneCurve,
          rgbPoints: patch.toneCurve.rgbPoints
            ? { ...current.toneCurve.rgbPoints, ...patch.toneCurve.rgbPoints }
            : current.toneCurve.rgbPoints,
        }
      : current.toneCurve,
    hsl: patch.hsl
      ? (Object.fromEntries(
          HSL_COLOR_CHANNELS.map((ch) => [
            ch,
            { ...current.hsl[ch], ...(patch.hsl?.[ch] ?? {}) },
          ]),
        ) as Record<HslColorChannel, HslChannelAdjust>)
      : current.hsl,
    detail: patch.detail ? { ...current.detail, ...patch.detail } : current.detail,
  });
}
