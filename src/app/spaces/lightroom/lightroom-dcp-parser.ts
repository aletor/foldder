/**
 * Parser mínimo de perfiles DCP (TIFF/EXIF Adobe).
 * Extrae ColorMatrix1/2, CalibrationIlluminant y ProfileToneCurve.
 */

export type DcpProfileData = {
  name: string;
  /** Restricción de modelo (tag DNG UniqueCameraModelRestriction). */
  uniqueCameraModel: string | null;
  colorMatrix1: Float32Array;
  colorMatrix2: Float32Array;
  forwardMatrix1?: Float32Array | null;
  forwardMatrix2?: Float32Array | null;
  illuminant1: number;
  illuminant2: number;
  /** Valores de curva 0…1 (salida por entrada uniforme). */
  toneCurve: Float32Array;
  hasLookTable: boolean;
};

const TAG_PROFILE_NAME = 50739;
const TAG_PROFILE_TONE_CURVE = 50940;
const TAG_PROFILE_TONE_CURVE_ALT = 50728;
const TAG_COLOR_MATRIX1 = 50721;
const TAG_COLOR_MATRIX2 = 50722;
const TAG_COLOR_MATRIX1_ALT = 50782;
const TAG_COLOR_MATRIX2_ALT = 50783;
const TAG_ILLUMINANT1 = 50778;
const TAG_ILLUMINANT2 = 50779;
const TAG_ILLUMINANT1_ALT = 50792;
const TAG_ILLUMINANT2_ALT = 50793;
const TAG_UNIQUE_CAMERA_MODEL = 50708;

const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_SRATIONAL = 10;
const TYPE_FLOAT = 11;

const TAG_FORWARD_MATRIX1 = 50964;
const TAG_FORWARD_MATRIX2 = 50965;
const TAG_LOOK_TABLE = 50942;
const TAG_LOOK_TABLE_ALT = 50727;

export function parseDcpFile(buffer: ArrayBuffer, fallbackName?: string): DcpProfileData {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8) throw new Error("DCP demasiado pequeño");
  const le = view.getUint16(0, true) === 0x4949;
  const byteOrder = readU16(view, 0, le);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) throw new Error("No es TIFF/DCP válido");
  const versionWord = readU16(view, 2, le);
  // TIFF clásico (42) o contenedor IIRC (RawTherapee: "II" + "RC").
  const isClassicTiff = versionWord === 42;
  const isIirc = versionWord === 0x4352 || versionWord === 0x5243;
  if (!isClassicTiff && !isIirc) throw new Error("No es TIFF/DCP válido");
  const ifd0 = readU32(view, 4, le);
  const tags = readIfdTags(view, ifd0, le);

  const name =
    readAsciiTag(view, tags.get(50936), le) ||
    readAsciiTag(view, tags.get(TAG_PROFILE_NAME), le) ||
    fallbackName ||
    "Perfil DCP";
  const uniqueCameraModel = readAsciiTag(view, tags.get(TAG_UNIQUE_CAMERA_MODEL), le);
  const cm1 =
    readSrationalArrayTag(view, tags.get(TAG_COLOR_MATRIX1), le, 9) ??
    readFloatArrayTag(view, tags.get(TAG_COLOR_MATRIX1_ALT), le, 9) ??
    identityMatrix();
  const cm2 =
    readSrationalArrayTag(view, tags.get(TAG_COLOR_MATRIX2), le, 9) ??
    readFloatArrayTag(view, tags.get(TAG_COLOR_MATRIX2_ALT), le, 9) ??
    cm1;
  const forwardMatrix1 = readSrationalArrayTag(view, tags.get(TAG_FORWARD_MATRIX1), le, 9);
  const forwardMatrix2 =
    readSrationalArrayTag(view, tags.get(TAG_FORWARD_MATRIX2), le, 9) ?? forwardMatrix1;
  const illuminant1 =
    readShortTag(view, tags.get(TAG_ILLUMINANT1), le) ??
    readShortTag(view, tags.get(TAG_ILLUMINANT1_ALT), le) ??
    17;
  const illuminant2 =
    readShortTag(view, tags.get(TAG_ILLUMINANT2), le) ??
    readShortTag(view, tags.get(TAG_ILLUMINANT2_ALT), le) ??
    21;
  const toneCurve =
    readToneCurveTag(view, tags.get(TAG_PROFILE_TONE_CURVE), le) ??
    readToneCurveTag(view, tags.get(TAG_PROFILE_TONE_CURVE_ALT), le) ??
    linearToneCurve();

  return {
    name,
    uniqueCameraModel,
    colorMatrix1: cm1,
    colorMatrix2: cm2,
    forwardMatrix1,
    forwardMatrix2,
    illuminant1,
    illuminant2,
    toneCurve,
    hasLookTable: tags.has(TAG_LOOK_TABLE) || tags.has(TAG_LOOK_TABLE_ALT),
  };
}

type IfdTag = { type: number; count: number; valueOffset: number };

function readIfdTags(view: DataView, offset: number, le: boolean): Map<number, IfdTag> {
  const tags = new Map<number, IfdTag>();
  if (offset <= 0 || offset + 2 > view.byteLength) return tags;
  const count = readU16(view, offset, le);
  let pos = offset + 2;
  for (let i = 0; i < count; i += 1) {
    if (pos + 12 > view.byteLength) break;
    const tag = readU16(view, pos, le);
    const type = readU16(view, pos + 2, le);
    const tagCount = readU32(view, pos + 4, le);
    const valueOffset = readU32(view, pos + 8, le);
    tags.set(tag, { type, count: tagCount, valueOffset });
    pos += 12;
  }
  return tags;
}

function readFloatArrayTag(view: DataView, tag: IfdTag | undefined, le: boolean, expected: number): Float32Array | null {
  if (!tag || tag.type !== TYPE_FLOAT || tag.count < expected) return null;
  const byteLen = tag.count * 4;
  const offset = tag.valueOffset;
  if (offset + byteLen > view.byteLength) return null;
  const out = new Float32Array(expected);
  for (let i = 0; i < expected; i += 1) {
    out[i] = readF32(view, offset + i * 4, le);
  }
  return out;
}

function readSrationalArrayTag(
  view: DataView,
  tag: IfdTag | undefined,
  le: boolean,
  expected: number,
): Float32Array | null {
  if (!tag || tag.type !== TYPE_SRATIONAL || tag.count < expected) return null;
  const byteLen = tag.count * 8;
  const offset = tag.valueOffset;
  if (offset + byteLen > view.byteLength) return null;
  const out = new Float32Array(expected);
  for (let i = 0; i < expected; i += 1) {
    const num = view.getInt32(offset + i * 8, le);
    const den = view.getInt32(offset + i * 8 + 4, le);
    out[i] = den !== 0 ? num / den : 0;
  }
  return out;
}

function readShortTag(view: DataView, tag: IfdTag | undefined, le: boolean): number | null {
  if (!tag || tag.type !== TYPE_SHORT || tag.count < 1) return null;
  if (tag.count * 2 <= 4) {
    return le ? tag.valueOffset & 0xffff : (tag.valueOffset >>> 16) & 0xffff;
  }
  return readU16(view, tag.valueOffset, le);
}

function readAsciiTag(view: DataView, tag: IfdTag | undefined, le: boolean): string | null {
  if (!tag || tag.type !== TYPE_ASCII || tag.count === 0) return null;
  const offset = tag.valueOffset;
  let s = "";
  for (let i = 0; i < tag.count - 1; i += 1) {
    if (offset + i >= view.byteLength) break;
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s || null;
}

function readToneCurveTag(view: DataView, tag: IfdTag | undefined, le: boolean): Float32Array | null {
  if (!tag) return null;
  if (tag.type === TYPE_FLOAT && tag.count >= 2) {
    const out = new Float32Array(tag.count);
    for (let i = 0; i < tag.count; i += 1) out[i] = readF32(view, tag.valueOffset + i * 4, le);
    return normalizeToneCurve(out);
  }
  if (tag.type === TYPE_LONG && tag.count >= 1) {
    const n = readU32(view, tag.valueOffset, le);
    const floatTag: IfdTag = { type: TYPE_FLOAT, count: n, valueOffset: tag.valueOffset + 4 };
    const floats = readFloatArrayTag(view, floatTag, le, n);
    return floats ? normalizeToneCurve(floats) : null;
  }
  return null;
}

function normalizeToneCurve(values: Float32Array): Float32Array {
  if (values.length <= 4 && values.length >= 2) {
    const out = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      let seg = 0;
      for (let j = 0; j < values.length - 2; j += 2) {
        if (t >= (values[j] ?? 0)) seg = j;
      }
      const x0 = values[seg] ?? 0;
      const y0 = values[seg + 1] ?? 0;
      const x1 = values[seg + 2] ?? 1;
      const y1 = values[seg + 3] ?? 1;
      const u = x1 > x0 ? (t - x0) / (x1 - x0) : t;
      out[i] = y0 + u * (y1 - y0);
    }
    return out;
  }
  const max = Math.max(...values, 1e-6);
  const scale = max > 1.5 ? 1 / 65535 : max > 1.01 ? 1 / max : 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[i] = Math.max(0, (values[i] ?? 0) * scale);
  return out;
}

function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

function linearToneCurve(): Float32Array {
  const n = 256;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = i / (n - 1);
  return out;
}

function readU16(view: DataView, offset: number, le: boolean): number {
  return view.getUint16(offset, le);
}

function readU32(view: DataView, offset: number, le: boolean): number {
  return view.getUint32(offset, le);
}

function readF32(view: DataView, offset: number, le: boolean): number {
  return view.getFloat32(offset, le);
}
