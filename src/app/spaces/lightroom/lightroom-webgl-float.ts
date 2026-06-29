/** Extensión WebGL2 necesaria para renderizar a FBO RGBA16F (no es core). */
export const EXT_COLOR_BUFFER_FLOAT = "EXT_color_buffer_float";

/**
 * Comprueba soporte funcional del pipeline lineal RGBA16F (textura + FBO + render).
 *
 * No usa extensiones WebGL1 (OES_texture_float, etc.) — en WebGL2 RGBA16F/HALF_FLOAT son core
 * para texturizado; solo el render-to-float requiere EXT_color_buffer_float.
 */
export function detectLinearFloatPipeline(gl: WebGL2RenderingContext): boolean {
  // WebGL2 expone RGBA16F como constante core; evita depender de instanceof en entornos sin DOM WebGL.
  if (!gl || typeof gl.texImage2D !== "function" || typeof gl.RGBA16F !== "number") {
    return false;
  }

  if (!gl.getExtension(EXT_COLOR_BUFFER_FLOAT)) return false;

  const tex = gl.createTexture();
  if (!tex) return false;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const fbo = gl.createFramebuffer();
  if (!fbo) {
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteTexture(tex);
    return false;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);

  return ok;
}

export class LinearFloatPipelineUnsupportedError extends Error {
  constructor() {
    super(
      "Este dispositivo no puede renderizar a texturas float RGBA16F (FBO incompleto). " +
        "El revelado continúa en precisión reducida 8-bit; la recuperación de altas luces estará limitada.",
    );
    this.name = "LinearFloatPipelineUnsupportedError";
  }
}

/** Convierte RGBA float lineal a RGBA8 clampado (fallback sin FBO float). */
export function linearFloatToUint8Rgba(rgba: Float32Array, linearMax = 1): Uint8Array {
  const denom = Math.max(linearMax, 1e-6);
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = Math.round(Math.min(1, Math.max(0, (rgba[i] ?? 0) / denom)) * 255);
    out[i + 1] = Math.round(Math.min(1, Math.max(0, (rgba[i + 1] ?? 0) / denom)) * 255);
    out[i + 2] = Math.round(Math.min(1, Math.max(0, (rgba[i + 2] ?? 0) / denom)) * 255);
    out[i + 3] = 255;
  }
  return out;
}
