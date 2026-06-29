import { BUILTIN_DEVELOP_PRESETS } from "./lightroom-ui/develop-presets";
import {
  ALL_PRESET_INCLUDES,
  builtinPresetToStored,
  createStoredPreset,
  type DevelopPresetGroup,
  type StoredDevelopPreset,
} from "./lightroom-preset-utils";

const STORE_KEY_V2 = "foldder.lr.presetStore.v2";
const LEGACY_USER_KEY = "foldder.lr.userPresets.v1";

export const BUILTIN_GROUP_ID = "builtin";
export const USER_DEFAULT_GROUP_ID = "user-default";

export type PresetStoreState = {
  groups: DevelopPresetGroup[];
  presets: StoredDevelopPreset[];
};

export const DEFAULT_USER_GROUP: DevelopPresetGroup = {
  id: USER_DEFAULT_GROUP_ID,
  name: "Mis presets",
};

export const BUILTIN_GROUP: DevelopPresetGroup = {
  id: BUILTIN_GROUP_ID,
  name: "Incluidos",
  builtIn: true,
};

function defaultStore(): PresetStoreState {
  return {
    groups: [BUILTIN_GROUP, DEFAULT_USER_GROUP],
    presets: BUILTIN_DEVELOP_PRESETS.map((p) => builtinPresetToStored(p, BUILTIN_GROUP_ID)),
  };
}

function migrateLegacyUserPresets(): StoredDevelopPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEGACY_USER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      name: string;
      thumb?: string;
      settings: StoredDevelopPreset["settings"];
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) =>
      createStoredPreset({
        id: p.id,
        name: p.name,
        groupId: USER_DEFAULT_GROUP_ID,
        settings: p.settings,
        includes: { ...ALL_PRESET_INCLUDES },
      }),
    );
  } catch {
    return [];
  }
}

export function loadPresetStore(): PresetStoreState {
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = localStorage.getItem(STORE_KEY_V2);
    if (!raw) {
      const legacy = migrateLegacyUserPresets();
      if (legacy.length === 0) return defaultStore();
      const store: PresetStoreState = {
        groups: [BUILTIN_GROUP, DEFAULT_USER_GROUP],
        presets: [
          ...BUILTIN_DEVELOP_PRESETS.map((p) => builtinPresetToStored(p, BUILTIN_GROUP_ID)),
          ...legacy,
        ],
      };
      savePresetStore(store);
      localStorage.removeItem(LEGACY_USER_KEY);
      return store;
    }
    const parsed = JSON.parse(raw) as PresetStoreState;
    if (!parsed?.groups?.length || !Array.isArray(parsed.presets)) return defaultStore();
    const hasBuiltin = parsed.groups.some((g) => g.id === BUILTIN_GROUP_ID);
    const groups = hasBuiltin ? parsed.groups : [BUILTIN_GROUP, ...parsed.groups];
    const builtinIds = new Set(BUILTIN_DEVELOP_PRESETS.map((p) => p.id));
    const userPresets = parsed.presets.filter((p) => !builtinIds.has(p.id));
    const builtins = BUILTIN_DEVELOP_PRESETS.map((p) => builtinPresetToStored(p, BUILTIN_GROUP_ID));
    return { groups, presets: [...builtins, ...userPresets] };
  } catch {
    return defaultStore();
  }
}

export function savePresetStore(state: PresetStoreState): void {
  const userPresets = state.presets.filter((p) => p.groupId !== BUILTIN_GROUP_ID);
  const payload: PresetStoreState = {
    groups: state.groups.filter((g) => !g.builtIn),
    presets: userPresets,
  };
  localStorage.setItem(STORE_KEY_V2, JSON.stringify(payload));
}

export function addUserGroup(state: PresetStoreState, name: string): PresetStoreState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const id = crypto.randomUUID();
  return {
    ...state,
    groups: [...state.groups, { id, name: trimmed }],
  };
}

export function renameUserGroup(state: PresetStoreState, groupId: string, name: string): PresetStoreState {
  const trimmed = name.trim();
  if (!trimmed || groupId === BUILTIN_GROUP_ID) return state;
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)),
  };
}

export function deleteUserGroup(state: PresetStoreState, groupId: string): PresetStoreState {
  if (groupId === BUILTIN_GROUP_ID || groupId === USER_DEFAULT_GROUP_ID) return state;
  return {
    groups: state.groups.filter((g) => g.id !== groupId),
    presets: state.presets.map((p) =>
      p.groupId === groupId ? { ...p, groupId: USER_DEFAULT_GROUP_ID } : p,
    ),
  };
}

export function upsertUserPreset(state: PresetStoreState, preset: StoredDevelopPreset): PresetStoreState {
  if (preset.groupId === BUILTIN_GROUP_ID) return state;
  const idx = state.presets.findIndex((p) => p.id === preset.id);
  const presets =
    idx >= 0
      ? state.presets.map((p, i) => (i === idx ? preset : p))
      : [...state.presets, preset];
  return { ...state, presets };
}

export function deleteUserPreset(state: PresetStoreState, presetId: string): PresetStoreState {
  const target = state.presets.find((p) => p.id === presetId);
  if (!target || target.groupId === BUILTIN_GROUP_ID) return state;
  return {
    ...state,
    presets: state.presets.filter((p) => p.id !== presetId),
  };
}

export function duplicateUserPreset(state: PresetStoreState, presetId: string): PresetStoreState {
  const source = state.presets.find((p) => p.id === presetId);
  if (!source || source.groupId === BUILTIN_GROUP_ID) return state;
  const copy = createStoredPreset({
    name: `${source.name} (copia)`,
    groupId: source.groupId,
    settings: source.settings,
    includes: source.includes,
  });
  return { ...state, presets: [...state.presets, copy] };
}

export function userPresetCount(state: PresetStoreState): number {
  return state.presets.filter((p) => p.groupId !== BUILTIN_GROUP_ID).length;
}
