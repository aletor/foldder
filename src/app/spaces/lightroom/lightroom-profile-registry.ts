/**
 * Registro de perfiles de cámara (built-in + empaquetados + .dcp cargados por el usuario).
 * Pieza 1 del pipeline: matriz + curva base al inicio (post-WB).
 */

import { LINEAR_HDR_MAX, canonLikeBaseCurve, float32ToHalf } from "./lightroom-base-curve";
import {
  invertMatrix3,
  lerpMatrix3,
  multiplyMatrix3,
  XYZ_TO_LINEAR_SRGB,
} from "./lightroom-color-matrix";
import { profileMatchesCameraModel } from "./lightroom-bundled-profiles";
import type { DcpProfileData } from "./lightroom-dcp-parser";
import { parseDcpFile } from "./lightroom-dcp-parser";
import { tempSliderToKelvin } from "./lightroom-ui/hsl-gradients";

const LUT_SIZE = 1024;

export const GENERIC_PROFILE_ID = "builtin:adobe-color";

export type CameraProfile = {
  id: string;
  name: string;
  thumb: string;
  builtin: boolean;
  /** Perfil empaquetado en /assets/camera-profiles (Adobe Standard DCP). */
  bundled?: boolean;
  assetPath?: string;
  uniqueCameraModel?: string | null;
  hasLookTable?: boolean;
  colorMatrix1: Float32Array;
  colorMatrix2: Float32Array;
  forwardMatrix1?: Float32Array | null;
  forwardMatrix2?: Float32Array | null;
  illuminant1: number;
  illuminant2: number;
  toneCurve: Float32Array;
};

const ILLUMINANT_KELVIN: Record<number, number> = {
  17: 2850,
  21: 6500,
  20: 6500,
  23: 5000,
  1: 5500,
};

const userProfiles = new Map<string, CameraProfile>();
const bundledProfiles = new Map<string, CameraProfile>();

function matrixScale(r: number, g: number, b: number): Float32Array {
  return new Float32Array([r, 0, 0, 0, g, 0, 0, 0, b]);
}

function makeBuiltin(
  id: string,
  name: string,
  thumb: string,
  matrix: Float32Array,
  curveFn: (x: number) => number,
): CameraProfile {
  const toneCurve = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) toneCurve[i] = curveFn(i / 255);
  return {
    id,
    name,
    thumb,
    builtin: true,
    colorMatrix1: matrix,
    colorMatrix2: matrix,
    illuminant1: 17,
    illuminant2: 21,
    toneCurve,
  };
}

const BUILTIN: CameraProfile[] = [
  makeBuiltin(
    GENERIC_PROFILE_ID,
    "Neutro (genérico)",
    "linear-gradient(135deg, #1e3a5f, #c4a882, #f0e6d3)",
    new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    canonLikeBaseCurve,
  ),
  makeBuiltin(
    "builtin:camera-standard",
    "Camera Standard",
    "linear-gradient(135deg, #334155, #64748b, #e2e8f0)",
    matrixScale(1.06, 1.02, 0.94),
    (x) => canonLikeBaseCurve(x * 1.05) * 1.04,
  ),
  makeBuiltin(
    "builtin:camera-portrait",
    "Camera Portrait",
    "linear-gradient(135deg, #9a3412, #fecaca, #fff7ed)",
    matrixScale(1.02, 1.0, 0.96),
    (x) => Math.pow(x, 0.92) * 1.02,
  ),
  makeBuiltin(
    "builtin:camera-neutral",
    "Camera Neutral",
    "linear-gradient(135deg, #475569, #94a3b8, #f8fafc)",
    new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    (x) => x,
  ),
  makeBuiltin(
    "builtin:camera-faithful",
    "Camera Faithful",
    "linear-gradient(135deg, #1e293b, #64748b, #cbd5e1)",
    matrixScale(0.98, 1.0, 1.02),
    (x) => x * 0.98 + 0.01,
  ),
  makeBuiltin(
    "builtin:linear",
    "Plano (lineal)",
    "linear-gradient(135deg, #475569, #64748b)",
    new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    (x) => x,
  ),
];

export function listCameraProfiles(): CameraProfile[] {
  return [...bundledProfiles.values(), ...BUILTIN, ...userProfiles.values()];
}

export function listProfilesForDropdown(): {
  bundled: CameraProfile[];
  generic: CameraProfile[];
  user: CameraProfile[];
} {
  const all = listCameraProfiles();
  return {
    bundled: all.filter((p) => p.bundled),
    generic: BUILTIN,
    user: all.filter((p) => !p.builtin && !p.bundled),
  };
}

export function getCameraProfile(id: string): CameraProfile | null {
  return bundledProfiles.get(id) ?? BUILTIN.find((p) => p.id === id) ?? userProfiles.get(id) ?? null;
}

export function registerBundledProfile(profile: CameraProfile): void {
  bundledProfiles.set(profile.id, profile);
}

export type RegisterDcpResult = {
  profile: CameraProfile;
  modelMismatch: boolean;
  mismatchMessage: string | null;
};

export function registerDcpFile(
  buffer: ArrayBuffer,
  fileName: string,
  cameraModel?: string,
): RegisterDcpResult {
  const parsed = parseDcpFile(buffer, fileName);
  const id = `dcp:${fileName.replace(/[^a-z0-9._-]+/gi, "_")}:${buffer.byteLength}`;
  const profile = dcpToCameraProfile(id, parsed);
  userProfiles.set(id, profile);

  let modelMismatch = false;
  let mismatchMessage: string | null = null;
  const rawModel = cameraModel?.trim();
  const profileModel = parsed.uniqueCameraModel?.trim();
  if (rawModel && profileModel && !profileMatchesCameraModel(profileModel, rawModel)) {
    modelMismatch = true;
    mismatchMessage = `El perfil es para «${profileModel}», pero el RAW es «${rawModel}». El color puede ser incorrecto.`;
  }

  return { profile, modelMismatch, mismatchMessage };
}

function dcpToCameraProfile(id: string, dcp: DcpProfileData): CameraProfile {
  return {
    id,
    name: dcp.name,
    thumb: "linear-gradient(135deg, #0f172a, #64748b, #e2e8f0)",
    builtin: false,
    uniqueCameraModel: dcp.uniqueCameraModel,
    hasLookTable: dcp.hasLookTable,
    colorMatrix1: dcp.colorMatrix1,
    colorMatrix2: dcp.colorMatrix2,
    forwardMatrix1: dcp.forwardMatrix1,
    forwardMatrix2: dcp.forwardMatrix2,
    illuminant1: dcp.illuminant1,
    illuminant2: dcp.illuminant2,
    toneCurve: dcp.toneCurve,
  };
}

export function migrateLegacyProfile(raw: {
  profile?: string;
  profileBaseEnabled?: boolean;
  cameraProfileId?: string;
}): string {
  if (raw.cameraProfileId && getCameraProfile(raw.cameraProfileId)) return raw.cameraProfileId;
  if (raw.profile === "neutral" || raw.profileBaseEnabled === false) {
    if (raw.profile === "neutral") return "builtin:linear";
    return "builtin:camera-standard";
  }
  return GENERIC_PROFILE_ID;
}

export function illuminantLerpWeight(profile: CameraProfile, tempKelvin: number): number {
  const t1 = ILLUMINANT_KELVIN[profile.illuminant1] ?? 2850;
  const t2 = ILLUMINANT_KELVIN[profile.illuminant2] ?? 6500;
  if (t1 === t2) return 0;
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  const k = Math.max(lo, Math.min(hi, tempKelvin));
  return (Math.log(k) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
}

export function resolveColorMatrix(profile: CameraProfile, tempSlider: number): Float32Array {
  const w = illuminantLerpWeight(profile, tempSliderToKelvin(tempSlider));
  const cm = lerpMatrix3(profile.colorMatrix1, profile.colorMatrix2, w);

  if (profile.builtin) {
    return cm;
  }

  let cameraToXyz: Float32Array;
  const fm1 = profile.forwardMatrix1;
  const fm2 = profile.forwardMatrix2 ?? fm1;
  if (fm1) {
    cameraToXyz = lerpMatrix3(fm1, fm2 ?? fm1, w);
    return multiplyMatrix3(XYZ_TO_LINEAR_SRGB, cameraToXyz);
  }

  // Perfiles mínimos (p. ej. Canon EOS 5D clásica): solo ColorMatrix, sin ForwardMatrix.
  // La inversa CM lleva cámara→XYZ; se usa como espacio de trabajo lineal (sin producto XYZ→sRGB).
  return invertMatrix3(cm);
}

export function buildProfileBaseLutHalf(profile: CameraProfile): Uint16Array {
  const lut = new Float32Array(LUT_SIZE * 4);
  const curve = profile.toneCurve;
  const curveLen = curve.length;
  for (let i = 0; i < LUT_SIZE; i += 1) {
    const t = i / (LUT_SIZE - 1);
    const linearIn = t * LINEAR_HDR_MAX;
    const idx = t * (curveLen - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(curveLen - 1, i0 + 1);
    const f = idx - i0;
    const mapped = ((curve[i0] ?? 0) * (1 - f) + (curve[i1] ?? 0) * f) * LINEAR_HDR_MAX;
    const out = profile.id === "builtin:linear" ? linearIn : mapped;
    lut[i * 4] = out;
    lut[i * 4 + 1] = out;
    lut[i * 4 + 2] = out;
    lut[i * 4 + 3] = 1;
  }
  const half = new Uint16Array(lut.length);
  for (let i = 0; i < lut.length; i += 1) half[i] = float32ToHalf(lut[i] ?? 0);
  return half;
}

export function profileUsesBaseCurve(profileId: string): boolean {
  return profileId !== "builtin:linear";
}
