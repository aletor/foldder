export type InputMode = "desktop" | "touch";

export type InputModePreference = "auto" | InputMode;

const STORAGE_KEY = "foldder-input-mode-preference";

/** Preferencia persistida (auto = detectar por hardware). */
export function readInputModePreference(): InputModePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "desktop" || raw === "touch" || raw === "auto") return raw;
  } catch {
    /* noop */
  }
  return "auto";
}

export function writeInputModePreference(pref: InputModePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* noop */
  }
}

/** Heurística: tablet / iPad con dedos (no sustituye teclado físico opcional). */
export function detectInputMode(): InputMode {
  if (typeof window === "undefined") return "desktop";
  const coarse =
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(any-pointer: coarse)").matches;
  const fineHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (coarse && !fineHover) return "touch";
  const maxTouch = navigator.maxTouchPoints ?? 0;
  if (maxTouch > 0 && coarse) return "touch";
  return "desktop";
}

export function resolveInputMode(preference: InputModePreference): InputMode {
  if (preference === "auto") return detectInputMode();
  return preference;
}
