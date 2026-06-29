/** Buffer lineal RGBA float32 en memoria de sesión (no persiste tras recarga). */
export type LinearSourceBuffer = {
  sourceKey: string;
  width: number;
  height: number;
  /** RGBA float32 lineal sin clip; puede superar 1.0 en RGB. */
  rgba: Float32Array;
  /** true = LibRaw; false = JPEG/PNG nativo. */
  isRaw?: boolean;
  /** Multiplicadores WB «as shot» (cam_mul) cuando LibRaw aplica useCameraWb. */
  camMul?: [number, number, number, number];
};

const cacheByKey = new Map<string, LinearSourceBuffer>();

export function storeLinearSource(buffer: LinearSourceBuffer): void {
  cacheByKey.set(buffer.sourceKey, buffer);
}

export function getLinearSource(sourceKey: string): LinearSourceBuffer | null {
  return cacheByKey.get(sourceKey) ?? null;
}

export function clearLinearSource(sourceKey: string): void {
  cacheByKey.delete(sourceKey);
}
