/**
 * Perfiles DCP empaquetados (Adobe Standard Canon + carga lazy).
 * Carga desde /assets/camera-profiles/ + auto-matching por modelo de cámara.
 */

import { parseDcpFile } from "./lightroom-dcp-parser";
import type { CameraProfile } from "./lightroom-profile-registry";
import { GENERIC_PROFILE_ID, registerBundledProfile } from "./lightroom-profile-registry";
import { canonLikeBaseCurve } from "./lightroom-base-curve";

const ASSETS_BASE = "/assets/camera-profiles";

export type BundledProfileIndexEntry = {
  id: string;
  name: string;
  path: string;
  uniqueCameraModel: string;
  profileName?: string;
  illuminant1?: number;
  illuminant2?: number;
  hasToneCurve?: boolean;
  hasLookTable?: boolean;
  hasColorMatrix?: boolean;
  /** Nombres alternativos (p. ej. LibRaw vs tag DCP). Matching exacto, case-sensitive. */
  aliases?: string[];
};

export type BundledProfileIndex = {
  version: number;
  license: string;
  source: string;
  profiles: BundledProfileIndexEntry[];
};

export type CameraProfileMatchResult = {
  profileId: string;
  matched: boolean;
  profileName: string | null;
};

let indexCache: BundledProfileIndex | null = null;
let loadPromise: Promise<void> | null = null;
const matchNamesById = new Map<string, string[]>();

/** Variantes del nombre de cámara (LibRaw suele omitir «Canon»). */
export function cameraModelMatchNames(model: string): string[] {
  const m = model.trim();
  if (!m) return [];
  const out = new Set<string>([m]);
  if (m.startsWith("EOS ")) out.add(`Canon ${m}`);
  if (m.startsWith("Canon EOS ")) out.add(m.slice("Canon ".length));
  return [...out];
}

export function profileMatchesCameraModel(profileModel: string | null | undefined, cameraModel: string): boolean {
  if (!profileModel?.trim() || !cameraModel.trim()) return true;
  const a = cameraModelMatchNames(profileModel);
  const b = cameraModelMatchNames(cameraModel);
  return a.some((x) => b.includes(x));
}

/** Aliases manuales cuando LibRaw y el tag DCP difieren. */
const KNOWN_ALIASES: Record<string, string[]> = {
  "Canon EOS 5D": ["EOS 5D"],
  "CANON EOS REBEL SL3": ["Canon EOS 250D", "CANON EOS 250D", "Canon EOS Rebel SL3"],
  "CANON EOS REBEL T8I": ["Canon EOS 850D", "CANON EOS 850D"],
  "CANON EOS REBEL T7I": ["Canon EOS 800D", "CANON EOS 800D"],
  "CANON EOS REBEL T6I": ["Canon EOS 750D", "CANON EOS 750D"],
  "CANON EOS REBEL T6S": ["Canon EOS 760D", "CANON EOS 760D"],
  "CANON EOS REBEL T5I": ["Canon EOS 700D", "CANON EOS 700D"],
  "CANON EOS REBEL T4I": ["Canon EOS 650D", "CANON EOS 650D"],
  "CANON EOS REBEL T3I": ["Canon EOS 600D", "CANON EOS 600D"],
  "CANON EOS REBEL T2I": ["Canon EOS 550D", "CANON EOS 550D"],
  "CANON EOS REBEL T1I": ["Canon EOS 500D", "CANON EOS 500D"],
  "CANON EOS REBEL XS": ["Canon EOS 1000D", "CANON EOS 1000D"],
  "CANON EOS REBEL XSI": ["Canon EOS 450D", "CANON EOS 450D"],
  "CANON EOS REBEL XTI": ["Canon EOS 400D", "CANON EOS 400D"],
  "CANON EOS REBEL XT": ["Canon EOS 350D", "CANON EOS 350D"],
  "CANON EOS DIGITAL REBEL": ["Canon EOS 300D", "CANON EOS 300D"],
  "CANON EOS 5D MARK IV": ["Canon EOS 5D Mark IV"],
  "CANON EOS R5": ["Canon EOS R5"],
  "CANON EOS R6": ["Canon EOS R6"],
  "CANON EOS R6 MARK II": ["Canon EOS R6 Mark II"],
  "CANON EOS R7": ["Canon EOS R7"],
  "CANON EOS R8": ["Canon EOS R8"],
  "CANON EOS R10": ["Canon EOS R10"],
  "CANON EOS R50": ["Canon EOS R50"],
  "CANON EOS 800D": ["Canon EOS 800D", "Canon EOS Rebel T8i"],
  "CANON EOS 850D": ["Canon EOS 850D"],
  "CANON EOS 250D": ["Canon EOS 250D", "Canon EOS Rebel SL3"],
  "CANON EOS 200D": ["Canon EOS 200D", "Canon EOS Rebel SL2"],
  "CANON EOS 100D": ["Canon EOS 100D", "Canon EOS Rebel SL1"],
};

function fileStem(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.dcp$/i, "");
}

function matchNamesForEntry(entry: BundledProfileIndexEntry): string[] {
  const names = new Set<string>();
  names.add(entry.uniqueCameraModel);
  names.add(fileStem(entry.path));
  for (const alias of entry.aliases ?? []) names.add(alias);
  for (const alias of KNOWN_ALIASES[entry.uniqueCameraModel] ?? []) names.add(alias);
  return [...names];
}

function isLinearToneCurve(curve: Float32Array): boolean {
  const mid = curve[Math.floor(curve.length / 2)] ?? 0.5;
  const end = curve[curve.length - 1] ?? 1;
  return Math.abs(mid - 0.5) < 0.08 && Math.abs(end - 1) < 0.08;
}

function toneCurveForBundled(dcp: ReturnType<typeof parseDcpFile>): Float32Array {
  if (!isLinearToneCurve(dcp.toneCurve)) return dcp.toneCurve;
  const out = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) out[i] = canonLikeBaseCurve(i / 255);
  return out;
}

function dcpToBundledProfile(id: string, entry: BundledProfileIndexEntry, dcp: ReturnType<typeof parseDcpFile>): CameraProfile {
  return {
    id,
    name: entry.name,
    thumb: "linear-gradient(135deg, #1e293b, #64748b, #cbd5e1)",
    builtin: false,
    bundled: true,
    assetPath: `${ASSETS_BASE}/${entry.path}`,
    uniqueCameraModel: dcp.uniqueCameraModel ?? entry.uniqueCameraModel,
    colorMatrix1: dcp.colorMatrix1,
    colorMatrix2: dcp.colorMatrix2,
    forwardMatrix1: dcp.forwardMatrix1,
    forwardMatrix2: dcp.forwardMatrix2,
    illuminant1: dcp.illuminant1,
    illuminant2: dcp.illuminant2,
    toneCurve: toneCurveForBundled(dcp),
    hasLookTable: dcp.hasLookTable,
  };
}

export async function ensureBundledProfilesLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const res = await fetch(`${ASSETS_BASE}/index.json`);
    if (!res.ok) throw new Error("No se pudo cargar el índice de perfiles de cámara");
    const index = (await res.json()) as BundledProfileIndex;
    indexCache = index;
    matchNamesById.clear();

    await Promise.all(
      index.profiles.map(async (entry) => {
        const url = `${ASSETS_BASE}/${entry.path}`;
        const fileRes = await fetch(url);
        if (!fileRes.ok) {
          console.warn(`[camera-profiles] No se pudo cargar ${entry.path}`);
          return;
        }
        const buffer = await fileRes.arrayBuffer();
        const parsed = parseDcpFile(buffer, fileStem(entry.path));
        registerBundledProfile(dcpToBundledProfile(entry.id, entry, parsed));
        matchNamesById.set(entry.id, matchNamesForEntry(entry));
      }),
    );
  })();
  return loadPromise;
}

export function isBundledProfilesLoaded(): boolean {
  return indexCache !== null;
}

export function matchCameraProfileForModel(cameraModel: string): CameraProfileMatchResult {
  const variants = cameraModelMatchNames(cameraModel);
  if (variants.length === 0) {
    return { profileId: GENERIC_PROFILE_ID, matched: false, profileName: null };
  }

  for (const [profileId, names] of matchNamesById) {
    if (variants.some((v) => names.includes(v))) {
      const entry = indexCache?.profiles.find((p) => p.id === profileId);
      return { profileId, matched: true, profileName: entry?.name ?? null };
    }
  }

  return { profileId: GENERIC_PROFILE_ID, matched: false, profileName: null };
}

export function listBundledProfilesForModel(cameraModel: string): string[] {
  const variants = cameraModelMatchNames(cameraModel);
  if (variants.length === 0) return [];
  const ids: string[] = [];
  for (const [profileId, names] of matchNamesById) {
    if (variants.some((v) => names.includes(v))) ids.push(profileId);
  }
  return ids;
}

export function validateProfileForCamera(
  profile: CameraProfile | null,
  cameraModel: string,
): { ok: boolean; message: string | null } {
  if (!profile || !cameraModel.trim()) return { ok: true, message: null };
  if (profile.bundled || profile.builtin) return { ok: true, message: null };
  const restriction = profile.uniqueCameraModel?.trim();
  if (!restriction) return { ok: true, message: null };
  if (profileMatchesCameraModel(restriction, cameraModel)) return { ok: true, message: null };
  return {
    ok: false,
    message: `El perfil «${profile.name}» es para «${restriction}», pero el RAW es «${cameraModel.trim()}». El color puede ser incorrecto.`,
  };
}

export function getBundledProfileIndex(): BundledProfileIndex | null {
  return indexCache;
}
