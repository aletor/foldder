import type { DevelopSettings } from "./lightroom-develop-settings";
import { EMPTY_DEVELOP_SETTINGS } from "./lightroom-develop-settings";
import {
  buildToneCurveLuts,
  packBasicUniforms,
  packDetailUniforms,
  packHslUniforms,
  packRgbLutTextureData,
} from "./lightroom-adjustments-cpu";
import { getCreativeLut } from "./lightroom-lut-registry";
import { packCubeLutForTexture3D } from "./lightroom-cube-lut";
import {
  buildProfileBaseLutHalf,
  getCameraProfile,
  profileUsesBaseCurve,
  resolveColorMatrix,
} from "./lightroom-profile-registry";
import { applyBaseProfileRgb, float32ArrayToHalf, LINEAR_HDR_MAX, linearToSrgbRgb } from "./lightroom-base-curve";
import { imageDataToLinearFloat } from "./lightroom-canvas";
import { LIGHTROOM_DEVELOP_FRAG, LIGHTROOM_DEVELOP_VERT } from "./lightroom-develop-shaders";
import { getLinearSource, type LinearSourceBuffer } from "./lightroom-linear-cache";
import { buildMaskLayerAlpha } from "./lightroom-mask-alpha";
import type { LightroomDevelopDocument } from "./lightroom-mask-types";
import {
  detectLinearFloatPipeline,
  linearFloatToUint8Rgba,
} from "./lightroom-webgl-float";
import { sampleLinearWindow } from "./lightroom-wb-eyedropper";

const PREVIEW_MAX_EDGE = 2048;
const BASE_CURVE_LUT_SIZE = 1024;

export type MaskLayerAlpha = {
  settings: DevelopSettings;
  alpha: Uint8Array;
};

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("No se pudo crear shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
  const program = gl.createProgram();
  if (!program) throw new Error("No se pudo crear programa WebGL");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

function downscaleLinearRgba(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh * 4);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const fx = (x + 0.5) * sx - 0.5;
      const fy = (y + 0.5) * sy - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const y0 = Math.max(0, Math.floor(fy));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const di = (y * dw + x) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        const v00 = src[(y0 * sw + x0) * 4 + ch] ?? 0;
        const v10 = src[(y0 * sw + x1) * 4 + ch] ?? 0;
        const v01 = src[(y1 * sw + x0) * 4 + ch] ?? 0;
        const v11 = src[(y1 * sw + x1) * 4 + ch] ?? 0;
        out[di + ch] =
          (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10 + (1 - tx) * ty * v01 + tx * ty * v11;
      }
      out[di + 3] = 1;
    }
  }
  return out;
}

export type LightroomDevelopEngineOptions = {
  previewMaxEdge?: number;
};

export class LightroomDevelopEngine {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private sourceTex: WebGLTexture | null = null;
  private curveTex: WebGLTexture | null = null;
  private baseCurveTex: WebGLTexture | null = null;
  private creativeLutTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private pingTex: WebGLTexture | null = null;
  private pongTex: WebGLTexture | null = null;
  private pingFbo: WebGLFramebuffer | null = null;
  private pongFbo: WebGLFramebuffer | null = null;
  private width = 0;
  private height = 0;
  private sourceWidth = 0;
  private sourceHeight = 0;
  private readonly previewMaxEdge: number;
  private floatPipelineOk = false;
  /** true cuando FBO/render float RGBA16F está activo (false = fallback 8-bit). */
  private useFloatRenderTargets = false;
  private basicLoc: WebGLUniformLocation | null = null;
  private hslHueLoc: WebGLUniformLocation | null = null;
  private hslSatLoc: WebGLUniformLocation | null = null;
  private hslLumLoc: WebGLUniformLocation | null = null;
  private detailLoc: WebGLUniformLocation | null = null;
  private regionLoc: WebGLUniformLocation | null = null;
  private useRegionMaskLoc: WebGLUniformLocation | null = null;
  private sourceLoc: WebGLUniformLocation | null = null;
  private curveLoc: WebGLUniformLocation | null = null;
  private baseCurveLoc: WebGLUniformLocation | null = null;
  private regionMaskLoc: WebGLUniformLocation | null = null;
  private passThroughLoc: WebGLUniformLocation | null = null;
  private profileBaseLoc: WebGLUniformLocation | null = null;
  private useColorMatrixLoc: WebGLUniformLocation | null = null;
  private colorMatrixLoc: WebGLUniformLocation | null = null;
  private creativeLutLoc: WebGLUniformLocation | null = null;
  private creativeLutEnabledLoc: WebGLUniformLocation | null = null;
  private creativeLutIntensityLoc: WebGLUniformLocation | null = null;
  private displayTransformLoc: WebGLUniformLocation | null = null;
  private linearMaxLoc: WebGLUniformLocation | null = null;
  private loadedCreativeLutId: string | null = null;
  private loadedProfileId: string | null = null;
  private loadedProfileTemp = 0;
  private sourcePixels: Uint8ClampedArray | null = null;
  /** RGBA float32 camera-native lineal (pre-WB, pre-perfil) para cuentagotas. */
  private nativeLinearRgba: Float32Array | null = null;
  private nativeLinearWidth = 0;
  private nativeLinearHeight = 0;

  constructor(options?: LightroomDevelopEngineOptions) {
    this.previewMaxEdge = options?.previewMaxEdge ?? PREVIEW_MAX_EDGE;
  }

  get linearFloatSupported(): boolean {
    return this.useFloatRenderTargets;
  }

  init(canvas: HTMLCanvasElement): void {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 no disponible en este navegador");
    this.floatPipelineOk = detectLinearFloatPipeline(gl);
    this.useFloatRenderTargets = this.floatPipelineOk;
    if (!this.floatPipelineOk) {
      console.warn(
        "[Lightroom] Pipeline float RGBA16F no disponible en este dispositivo; revelado en 8-bit (headroom HDR limitado).",
      );
    }

    this.gl = gl;
    this.program = createProgram(gl, LIGHTROOM_DEVELOP_VERT, LIGHTROOM_DEVELOP_FRAG);

    const positions = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const posLoc = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.basicLoc = gl.getUniformLocation(this.program, "uBasic");
    this.hslHueLoc = gl.getUniformLocation(this.program, "uHslHue");
    this.hslSatLoc = gl.getUniformLocation(this.program, "uHslSat");
    this.hslLumLoc = gl.getUniformLocation(this.program, "uHslLum");
    this.detailLoc = gl.getUniformLocation(this.program, "uDetail");
    this.regionLoc = gl.getUniformLocation(this.program, "uRegion");
    this.useRegionMaskLoc = gl.getUniformLocation(this.program, "uUseRegionMask");
    this.sourceLoc = gl.getUniformLocation(this.program, "uSource");
    this.curveLoc = gl.getUniformLocation(this.program, "uCurveLut");
    this.baseCurveLoc = gl.getUniformLocation(this.program, "uBaseCurveLut");
    this.regionMaskLoc = gl.getUniformLocation(this.program, "uRegionMask");
    this.passThroughLoc = gl.getUniformLocation(this.program, "uPassThrough");
    this.profileBaseLoc = gl.getUniformLocation(this.program, "uProfileBaseEnabled");
    this.useColorMatrixLoc = gl.getUniformLocation(this.program, "uUseColorMatrix");
    this.colorMatrixLoc = gl.getUniformLocation(this.program, "uColorMatrix");
    this.creativeLutLoc = gl.getUniformLocation(this.program, "uCreativeLut");
    this.creativeLutEnabledLoc = gl.getUniformLocation(this.program, "uCreativeLutEnabled");
    this.creativeLutIntensityLoc = gl.getUniformLocation(this.program, "uCreativeLutIntensity");
    this.displayTransformLoc = gl.getUniformLocation(this.program, "uDisplayTransform");
    this.linearMaxLoc = gl.getUniformLocation(this.program, "uLinearMax");

    this.sourceTex = gl.createTexture();
    this.curveTex = gl.createTexture();
    this.baseCurveTex = gl.createTexture();
    this.creativeLutTex = gl.createTexture();
    this.maskTex = gl.createTexture();
    this.pingTex = gl.createTexture();
    this.pongTex = gl.createTexture();
    this.pingFbo = gl.createFramebuffer();
    this.pongFbo = gl.createFramebuffer();

    gl.bindTexture(gl.TEXTURE_3D, this.creativeLutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.uploadIdentityCreativeLut();
  }

  private uploadIdentityCreativeLut(): void {
    const gl = this.gl!;
    const size = 2;
    const data = new Uint8Array(size * size * size * 4);
    for (let b = 0; b < size; b += 1) {
      for (let g = 0; g < size; g += 1) {
        for (let r = 0; r < size; r += 1) {
          const i = (b * size * size + g * size + r) * 4;
          data[i] = Math.round((r / (size - 1)) * 255);
          data[i + 1] = Math.round((g / (size - 1)) * 255);
          data[i + 2] = Math.round((b / (size - 1)) * 255);
          data[i + 3] = 255;
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_3D, this.creativeLutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  get dimensions(): { width: number; height: number; sourceWidth: number; sourceHeight: number } {
    return {
      width: this.width,
      height: this.height,
      sourceWidth: this.sourceWidth,
      sourceHeight: this.sourceHeight,
    };
  }

  getSourcePixels(): Uint8ClampedArray | null {
    return this.sourcePixels;
  }

  /** Muestrea buffer lineal pre-WB (ventana 5×5 por defecto). Coordenadas norm 0…1. */
  sampleNativeLinearWindow(
    normX: number,
    normY: number,
    radius = 2,
  ): { r: number; g: number; b: number } | null {
    if (!this.nativeLinearRgba || this.nativeLinearWidth <= 0 || this.nativeLinearHeight <= 0) return null;
    return sampleLinearWindow(
      this.nativeLinearRgba,
      this.nativeLinearWidth,
      this.nativeLinearHeight,
      normX,
      normY,
      radius,
    );
  }

  setSourceFromLinearCache(sourceKey: string, fullResolution = false): void {
    const buffer = getLinearSource(sourceKey);
    if (!buffer) {
      throw new Error(
        "Buffer lineal no disponible. Vuelve a abrir el archivo RAW en esta sesión.",
      );
    }
    this.setSourceFromLinearBuffer(buffer, fullResolution);
  }

  setSourceFromLinearBuffer(buffer: LinearSourceBuffer, fullResolution = false): void {
    const gl = this.gl;
    if (!gl || !this.sourceTex) throw new Error("Motor WebGL no inicializado");

    let sw = buffer.width;
    let sh = buffer.height;
    this.sourceWidth = sw;
    this.sourceHeight = sh;

    let rgba = buffer.rgba;
    if (!fullResolution) {
      const maxEdge = Math.max(sw, sh);
      if (maxEdge > this.previewMaxEdge) {
        const scale = this.previewMaxEdge / maxEdge;
        sw = Math.round(sw * scale);
        sh = Math.round(sh * scale);
        rgba = downscaleLinearRgba(buffer.rgba, buffer.width, buffer.height, sw, sh);
      }
    }

    this.width = sw;
    this.height = sh;
    this.nativeLinearRgba = rgba;
    this.nativeLinearWidth = sw;
    this.nativeLinearHeight = sh;
    this.ensureFramebufferTextures(sw, sh);
    this.cacheSourcePixelsFromLinear(rgba, sw, sh, false);

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    this.uploadLinearRgbaTexture(rgba, sw, sh);
  }

  /** Fallback degradado: carga PNG/JPEG 8-bit (sin headroom HDR). */
  async setSourceFromDataUrl(dataUrl: string, fullResolution = false): Promise<void> {
    const img = await loadImage(dataUrl);
    if (!this.isReady) return;
    this.setSourceFromImage(img, fullResolution);
  }

  setSourceFromImage(img: TexImageSource, fullResolution = false): void {
    const gl = this.gl;
    if (!gl || !this.sourceTex) throw new Error("Motor WebGL no inicializado");

    let { width: sw, height: sh } = sourceDimensions(img);
    this.sourceWidth = sw;
    this.sourceHeight = sh;

    if (!fullResolution) {
      const maxEdge = Math.max(sw, sh);
      if (maxEdge > this.previewMaxEdge) {
        const scale = this.previewMaxEdge / maxEdge;
        sw = Math.round(sw * scale);
        sh = Math.round(sh * scale);
      }
    }

    this.width = sw;
    this.height = sh;
    this.ensureFramebufferTextures(sw, sh);

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    if (img instanceof ImageData) {
      ctx.putImageData(img, 0, 0);
    } else {
      ctx.drawImage(img, 0, 0, sw, sh);
    }
    const imageData = ctx.getImageData(0, 0, sw, sh);
    const rgba = imageDataToLinearFloat(imageData);
    this.nativeLinearRgba = rgba;
    this.nativeLinearWidth = sw;
    this.nativeLinearHeight = sh;
    this.cacheSourcePixelsFromLinear(rgba, sw, sh, false);

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    this.uploadLinearRgbaTexture(rgba, sw, sh);
  }

  /** Fuente lineal → sRGB sin ajustes de revelado (comparación «Antes»). */
  renderLinearSourcePreview(canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    if (!gl || !this.sourceTex || this.width <= 0 || this.height <= 0) return;
    canvas.width = this.width;
    canvas.height = this.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    this.copyTextureToScreen(this.sourceTex, { ...EMPTY_DEVELOP_SETTINGS, creativeLut: { ...EMPTY_DEVELOP_SETTINGS.creativeLut, enabled: false } });
  }

  render(canvas: HTMLCanvasElement, settings: DevelopSettings, region = 1): void {
    void region;
    this.renderPipeline(canvas, { global: settings, maskLayers: [] }, []);
  }

  renderPipeline(
    canvas: HTMLCanvasElement,
    document: Pick<LightroomDevelopDocument, "global" | "maskLayers">,
    layerAlphas: MaskLayerAlpha[],
  ): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || !this.sourceTex || !this.curveTex || !this.pingFbo || !this.pongFbo) {
      return;
    }
    if (this.width <= 0 || this.height <= 0) return;

    canvas.width = this.width;
    canvas.height = this.height;

    this.drawPass(this.sourceTex, this.pingFbo, document.global, false);

    let readTex = this.pingTex!;
    let writeFbo: WebGLFramebuffer = this.pongFbo!;

    document.maskLayers.forEach((layer, index) => {
      if (!layer.enabled) return;
      const packed = layerAlphas[index];
      if (!packed || !packed.alpha.some((v) => v > 0)) return;
      this.uploadMaskAlpha(packed.alpha);
      this.drawPass(readTex, writeFbo, layer.settings, true);
      readTex = writeFbo === this.pingFbo ? this.pingTex! : this.pongTex!;
      writeFbo = writeFbo === this.pingFbo ? this.pongFbo! : this.pingFbo!;
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    this.copyTextureToScreen(readTex, document.global);
  }

  async buildLayerAlphas(document: Pick<LightroomDevelopDocument, "maskLayers">): Promise<MaskLayerAlpha[]> {
    const source = this.sourcePixels ?? undefined;
    const results: MaskLayerAlpha[] = [];
    for (const layer of document.maskLayers) {
      const alpha = await buildMaskLayerAlpha(layer, this.width, this.height, source);
      results.push({ settings: layer.settings, alpha });
    }
    return results;
  }

  toDataUrl(canvas: HTMLCanvasElement, type = "image/png", quality?: number): string {
    return canvas.toDataURL(type, quality);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.sourceTex) gl.deleteTexture(this.sourceTex);
    if (this.curveTex) gl.deleteTexture(this.curveTex);
    if (this.baseCurveTex) gl.deleteTexture(this.baseCurveTex);
    if (this.creativeLutTex) gl.deleteTexture(this.creativeLutTex);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    if (this.pingTex) gl.deleteTexture(this.pingTex);
    if (this.pongTex) gl.deleteTexture(this.pongTex);
    if (this.pingFbo) gl.deleteFramebuffer(this.pingFbo);
    if (this.pongFbo) gl.deleteFramebuffer(this.pongFbo);
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.gl = null;
    this.sourceTex = null;
    this.program = null;
    this.vao = null;
    this.pingFbo = null;
    this.pongFbo = null;
    this.nativeLinearRgba = null;
    this.nativeLinearWidth = 0;
    this.nativeLinearHeight = 0;
    this.sourcePixels = null;
  }

  /** true mientras init() está activo y dispose() no se ha llamado. */
  get isReady(): boolean {
    return this.gl != null && this.sourceTex != null;
  }

  private drawPass(
    sourceTexture: WebGLTexture,
    targetFbo: WebGLFramebuffer | null,
    settings: DevelopSettings,
    useMask: boolean,
  ): void {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.uploadCurveLut(packRgbLutTextureData(buildToneCurveLuts(settings.toneCurve)));

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(this.sourceLoc, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.uniform1i(this.curveLoc, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.regionMaskLoc, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.baseCurveTex);
    gl.uniform1i(this.baseCurveLoc, 3);

    this.uploadCameraProfile(settings);
    this.bindCreativeLutUniforms(settings, false);

    gl.uniform1fv(this.basicLoc, packBasicUniforms(settings.basic));
    const hsl = packHslUniforms(settings.hsl);
    gl.uniform1fv(this.hslHueLoc, hsl.hue);
    gl.uniform1fv(this.hslSatLoc, hsl.sat);
    gl.uniform1fv(this.hslLumLoc, hsl.lum);
    gl.uniform1fv(this.detailLoc, packDetailUniforms(settings.detail, [1 / this.width, 1 / this.height]));
    gl.uniform1f(this.useRegionMaskLoc, useMask ? 1 : 0);
    gl.uniform1f(this.regionLoc, 1);
    gl.uniform1f(this.passThroughLoc, 0);
    gl.uniform1f(this.displayTransformLoc, 0);
    gl.uniform1f(this.linearMaxLoc, LINEAR_HDR_MAX);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private copyTextureToScreen(texture: WebGLTexture, settings: DevelopSettings): void {
    const gl = this.gl!;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.sourceLoc, 0);
    gl.uniform1f(this.passThroughLoc, 1);
    gl.uniform1f(this.displayTransformLoc, 1);
    gl.uniform1f(this.profileBaseLoc, 0);
    gl.uniform1f(this.useColorMatrixLoc, 0);
    this.bindCreativeLutUniforms(settings, true);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private uploadCameraProfile(settings: DevelopSettings): void {
    const gl = this.gl!;
    const profile = getCameraProfile(settings.cameraProfileId) ?? getCameraProfile("builtin:adobe-color");
    if (!profile) return;

    const matrix = resolveColorMatrix(profile, settings.basic.temp);
    const profileKey = `${profile.id}:${settings.basic.temp}`;
    if (this.loadedProfileId !== profileKey) {
      this.loadedProfileId = profileKey;
      const half = buildProfileBaseLutHalf(profile);
      gl.bindTexture(gl.TEXTURE_2D, this.baseCurveTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, BASE_CURVE_LUT_SIZE, 1, 0, gl.RGBA, gl.HALF_FLOAT, half);
    }

    gl.uniform1fv(this.colorMatrixLoc, matrix);
    gl.uniform1f(this.useColorMatrixLoc, 1);
    gl.uniform1f(this.profileBaseLoc, profileUsesBaseCurve(profile.id) ? 1 : 0);
  }

  private bindCreativeLutUniforms(settings: DevelopSettings, forDisplay: boolean): void {
    const gl = this.gl!;
    const cl = settings.creativeLut;
    const lut = cl.enabled && cl.lutId ? getCreativeLut(cl.lutId) : null;
    const active = forDisplay && lut && cl.intensity > 0;

    if (lut && this.loadedCreativeLutId !== lut.id) {
      this.loadedCreativeLutId = lut.id;
      const rgba = packCubeLutForTexture3D(lut);
      gl.bindTexture(gl.TEXTURE_3D, this.creativeLutTex);
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.RGBA8,
        lut.size,
        lut.size,
        lut.size,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        rgba,
      );
    }

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_3D, this.creativeLutTex);
    gl.uniform1i(this.creativeLutLoc, 4);
    gl.uniform1f(this.creativeLutEnabledLoc, active ? 1 : 0);
    gl.uniform1f(this.creativeLutIntensityLoc, active ? cl.intensity / 100 : 0);
  }

  private ensureFramebufferTextures(w: number, h: number): void {
    const gl = this.gl!;
    for (const tex of [this.pingTex, this.pongTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      this.setFloatTextureParams(gl);
      if (this.useFloatRenderTargets) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pingTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pongFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pongTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private cacheSourcePixelsFromLinear(rgba: Float32Array, w: number, h: number, profileBase: boolean): void {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      const si = i * 4;
      let r = rgba[si] ?? 0;
      let g = rgba[si + 1] ?? 0;
      let b = rgba[si + 2] ?? 0;
      if (profileBase) {
        [r, g, b] = applyBaseProfileRgb(r, g, b);
      }
      [r, g, b] = linearToSrgbRgb(r, g, b);
      out[si] = Math.round(Math.min(1, r) * 255);
      out[si + 1] = Math.round(Math.min(1, g) * 255);
      out[si + 2] = Math.round(Math.min(1, b) * 255);
      out[si + 3] = 255;
    }
    this.sourcePixels = out;
  }

  private cacheSourcePixels(img: TexImageSource, w: number, h: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.sourcePixels = null;
      return;
    }
    if (img instanceof ImageData) {
      ctx.putImageData(img, 0, 0);
    } else {
      ctx.drawImage(img, 0, 0, w, h);
    }
    this.sourcePixels = ctx.getImageData(0, 0, w, h).data;
  }

  private uploadMaskAlpha(alpha: Uint8Array): void {
    const gl = this.gl!;
    const rgba = new Uint8Array(this.width * this.height * 4);
    for (let i = 0; i < this.width * this.height; i += 1) {
      const v = alpha[i] ?? 0;
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    this.setTextureParams(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  private uploadCurveLut(data: Uint8Array): void {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  private uploadLinearRgbaTexture(rgba: Float32Array, w: number, h: number): void {
    const gl = this.gl!;
    this.setFloatTextureParams(gl);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // El shader usa uLinearMax=4; escalar 0…1 → dominio HDR para que tono/claridad/etc. actúen.
    const hdr = new Float32Array(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      hdr[i] = (rgba[i] ?? 0) * LINEAR_HDR_MAX;
      hdr[i + 1] = (rgba[i + 1] ?? 0) * LINEAR_HDR_MAX;
      hdr[i + 2] = (rgba[i + 2] ?? 0) * LINEAR_HDR_MAX;
      hdr[i + 3] = rgba[i + 3] ?? 1;
    }
    if (this.useFloatRenderTargets) {
      const half = float32ArrayToHalf(hdr);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, half);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, linearFloatToUint8Rgba(hdr, LINEAR_HDR_MAX));
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private setFloatTextureParams(gl: WebGL2RenderingContext): void {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private setTextureParams(gl: WebGL2RenderingContext): void {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
}

function sourceDimensions(img: TexImageSource): { width: number; height: number } {
  if (img instanceof HTMLImageElement) return { width: img.naturalWidth, height: img.naturalHeight };
  if (img instanceof HTMLVideoElement) return { width: img.videoWidth, height: img.videoHeight };
  if (img instanceof HTMLCanvasElement || img instanceof ImageBitmap || img instanceof OffscreenCanvas) {
    return { width: img.width, height: img.height };
  }
  if (img instanceof ImageData) return { width: img.width, height: img.height };
  return { width: 0, height: 0 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen fuente"));
    img.src = src;
  });
}
