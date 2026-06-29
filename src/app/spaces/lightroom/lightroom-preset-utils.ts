import {
  EMPTY_DEVELOP_SETTINGS,
  normalizeDevelopSettings,
  patchDevelopSettings,
  type DevelopSettings,
} from "./lightroom-develop-settings";

/** Qué secciones incluye un preset (como Lightroom Classic al guardar). */
export type PresetIncludeFlags = {
  profile: boolean;
  whiteBalance: boolean;
  basic: boolean;
  toneCurve: boolean;
  hsl: boolean;
  detail: boolean;
  creativeLut: boolean;
};

export const ALL_PRESET_INCLUDES: PresetIncludeFlags = {
  profile: true,
  whiteBalance: true,
  basic: true,
  toneCurve: true,
  hsl: true,
  detail: true,
  creativeLut: true,
};

export const PRESET_INCLUDE_LABELS: Record<keyof PresetIncludeFlags, string> = {
  profile: "Perfil / tratamiento de color",
  whiteBalance: "Balance de blancos",
  basic: "Tono básico",
  toneCurve: "Curva de tonos",
  hsl: "Color (HSL)",
  detail: "Detalle (nitidez / ruido)",
  creativeLut: "Look / LUT creativa",
};

export type StoredDevelopPreset = {
  id: string;
  name: string;
  groupId: string;
  thumb: string;
  includes: PresetIncludeFlags;
  settings: DevelopSettings;
  createdAt: number;
  updatedAt: number;
};

export type DevelopPresetGroup = {
  id: string;
  name: string;
  builtIn?: boolean;
};

export function presetThumbFromSettings(settings: DevelopSettings): string {
  const { temp, saturation, vibrance, contrast } = settings.basic;
  if (saturation <= -80) {
    return "linear-gradient(135deg, #0a0a0a, #737373, #f5f5f5)";
  }
  const warm = temp > 8 ? "#c4956a" : temp < -8 ? "#6a9fc4" : "#8b9aab";
  const vivid = vibrance > 25 || saturation > 25 ? "#e11d48" : contrast > 15 ? "#f97316" : "#64748b";
  const lift = contrast < -5 ? "#e7e5e4" : "#334155";
  return `linear-gradient(135deg, ${warm}, ${vivid}, ${lift})`;
}

export function applyPresetToSettings(current: DevelopSettings, preset: StoredDevelopPreset): DevelopSettings {
  const s = normalizeDevelopSettings(preset.settings);
  const inc = preset.includes;
  const patch: Parameters<typeof patchDevelopSettings>[1] = {};

  if (inc.profile) {
    patch.cameraProfileId = s.cameraProfileId;
    patch.profile = s.profile;
    patch.profileBaseEnabled = s.profileBaseEnabled;
  }
  if (inc.creativeLut) {
    patch.creativeLut = structuredClone(s.creativeLut);
  }

  const basicPatch: Partial<DevelopSettings["basic"]> = {};
  if (inc.whiteBalance) {
    basicPatch.temp = s.basic.temp;
    basicPatch.tint = s.basic.tint;
  }
  if (inc.basic) {
    basicPatch.exposure = s.basic.exposure;
    basicPatch.contrast = s.basic.contrast;
    basicPatch.highlights = s.basic.highlights;
    basicPatch.shadows = s.basic.shadows;
    basicPatch.whites = s.basic.whites;
    basicPatch.blacks = s.basic.blacks;
    basicPatch.texture = s.basic.texture;
    basicPatch.clarity = s.basic.clarity;
    basicPatch.dehaze = s.basic.dehaze;
    basicPatch.vibrance = s.basic.vibrance;
    basicPatch.saturation = s.basic.saturation;
  }
  if (Object.keys(basicPatch).length > 0) {
    patch.basic = basicPatch;
  }

  if (inc.toneCurve) {
    patch.toneCurve = structuredClone(s.toneCurve);
  }
  if (inc.hsl) {
    patch.hsl = structuredClone(s.hsl);
  }
  if (inc.detail) {
    patch.detail = structuredClone(s.detail);
  }

  return patchDevelopSettings(current, patch);
}

export function createStoredPreset(input: {
  name: string;
  groupId: string;
  settings: DevelopSettings;
  includes: PresetIncludeFlags;
  id?: string;
}): StoredDevelopPreset {
  const now = Date.now();
  const settings = normalizeDevelopSettings(input.settings);
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    groupId: input.groupId,
    thumb: presetThumbFromSettings(settings),
    includes: { ...input.includes },
    settings: structuredClone(settings),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateStoredPreset(
  preset: StoredDevelopPreset,
  patch: {
    name?: string;
    groupId?: string;
    settings?: DevelopSettings;
    includes?: PresetIncludeFlags;
  },
): StoredDevelopPreset {
  const settings = patch.settings ? normalizeDevelopSettings(patch.settings) : preset.settings;
  return {
    ...preset,
    name: patch.name?.trim() || preset.name,
    groupId: patch.groupId ?? preset.groupId,
    includes: patch.includes ? { ...patch.includes } : preset.includes,
    settings: structuredClone(settings),
    thumb: presetThumbFromSettings(settings),
    updatedAt: Date.now(),
  };
}

export type FoldPresetExport = {
  format: "foldder.lightroom.preset";
  version: 1;
  name: string;
  includes: PresetIncludeFlags;
  settings: DevelopSettings;
};

export function exportPresetFile(preset: StoredDevelopPreset): FoldPresetExport {
  return {
    format: "foldder.lightroom.preset",
    version: 1,
    name: preset.name,
    includes: preset.includes,
    settings: normalizeDevelopSettings(preset.settings),
  };
}

export function parsePresetImportFile(raw: unknown): StoredDevelopPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.format !== "foldder.lightroom.preset") return null;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;
  const includes = normalizeIncludeFlags(obj.includes);
  const settings = normalizeDevelopSettings(obj.settings as Partial<DevelopSettings> | undefined);
  return createStoredPreset({
    name,
    groupId: "user-default",
    settings,
    includes,
  });
}

export function normalizeIncludeFlags(raw: unknown): PresetIncludeFlags {
  const base = ALL_PRESET_INCLUDES;
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Partial<PresetIncludeFlags>;
  return {
    profile: o.profile ?? base.profile,
    whiteBalance: o.whiteBalance ?? base.whiteBalance,
    basic: o.basic ?? base.basic,
    toneCurve: o.toneCurve ?? base.toneCurve,
    hsl: o.hsl ?? base.hsl,
    detail: o.detail ?? base.detail,
    creativeLut: o.creativeLut ?? base.creativeLut,
  };
}

/** Convierte presets embebidos del bundle a formato almacenado. */
export function builtinPresetToStored(
  preset: { id: string; name: string; thumb: string; settings: DevelopSettings },
  groupId: string,
): StoredDevelopPreset {
  const settings = normalizeDevelopSettings(preset.settings);
  return {
    id: preset.id,
    name: preset.name,
    groupId,
    thumb: preset.thumb,
    includes: { ...ALL_PRESET_INCLUDES },
    settings: structuredClone(settings),
    createdAt: 0,
    updatedAt: 0,
  };
}

export function isPresetIncludesEmpty(flags: PresetIncludeFlags): boolean {
  return !Object.values(flags).some(Boolean);
}

export function defaultPresetName(index: number): string {
  return `Mi preset ${index + 1}`;
}

export { EMPTY_DEVELOP_SETTINGS };
