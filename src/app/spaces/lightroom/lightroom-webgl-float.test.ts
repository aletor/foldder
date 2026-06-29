import { describe, expect, it, vi } from "vitest";
import {
  detectLinearFloatPipeline,
  EXT_COLOR_BUFFER_FLOAT,
  linearFloatToUint8Rgba,
} from "./lightroom-webgl-float";

const FRAMEBUFFER_COMPLETE = 0x8cd5;
const RGBA16F = 0x881a;
const RGBA = 0x1908;
const HALF_FLOAT = 0x140b;

function createMockGl(opts: {
  hasExt?: boolean;
  fboComplete?: boolean;
  webgl2?: boolean;
}): WebGL2RenderingContext & {
  __extCalls: string[];
  __texImageCalls: Array<{ internal: number; format: number; type: number }>;
} {
  const { hasExt = true, fboComplete = true, webgl2 = true } = opts;
  const extCalls: string[] = [];
  const texImageCalls: Array<{ internal: number; format: number; type: number }> = [];

  const gl = {
    RGBA16F: webgl2 ? RGBA16F : undefined,
    RGBA,
    HALF_FLOAT,
    TEXTURE_2D: 0x0de1,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    LINEAR: 0x2601,
    FRAMEBUFFER_COMPLETE,
    createTexture: vi.fn(() => ({})),
    createFramebuffer: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    bindFramebuffer: vi.fn(),
    texImage2D: vi.fn(
      (_t: number, _l: number, internal: number, _w: number, _h: number, _b: number, format: number, type: number) => {
        texImageCalls.push({ internal, format, type });
      },
    ),
    texParameteri: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => (fboComplete ? FRAMEBUFFER_COMPLETE : 0)),
    deleteFramebuffer: vi.fn(),
    deleteTexture: vi.fn(),
    getExtension: vi.fn((name: string) => {
      extCalls.push(name);
      if (name === EXT_COLOR_BUFFER_FLOAT) return hasExt ? {} : null;
      return null;
    }),
    __extCalls: extCalls,
    __texImageCalls: texImageCalls,
  };

  return gl as unknown as WebGL2RenderingContext & {
    __extCalls: string[];
    __texImageCalls: Array<{ internal: number; format: number; type: number }>;
  };
}

describe("detectLinearFloatPipeline", () => {
  it("returns true when EXT_color_buffer_float is present and FBO is complete", () => {
    const gl = createMockGl({ hasExt: true, fboComplete: true });
    expect(detectLinearFloatPipeline(gl)).toBe(true);
    expect(gl.__extCalls).toEqual([EXT_COLOR_BUFFER_FLOAT]);
    expect(gl.__texImageCalls[0]).toEqual({ internal: RGBA16F, format: RGBA, type: HALF_FLOAT });
  });

  it("returns false when EXT_color_buffer_float is missing", () => {
    const gl = createMockGl({ hasExt: false });
    expect(detectLinearFloatPipeline(gl)).toBe(false);
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
  });

  it("returns false when FBO status is incomplete", () => {
    const gl = createMockGl({ hasExt: true, fboComplete: false });
    expect(detectLinearFloatPipeline(gl)).toBe(false);
  });

  it("does not query WebGL1 float extensions", () => {
    const gl = createMockGl({});
    detectLinearFloatPipeline(gl);
    for (const name of gl.__extCalls) {
      expect(name).not.toMatch(/OES_texture|WEBGL_color_buffer_float/);
    }
  });

  it("returns false for non-WebGL2 contexts", () => {
    const gl = createMockGl({ webgl2: false });
    expect(detectLinearFloatPipeline(gl)).toBe(false);
  });
});

describe("linearFloatToUint8Rgba", () => {
  it("maps HDR domain to 8-bit when linearMax is set", () => {
    const out = linearFloatToUint8Rgba(new Float32Array([4, 2, 0, 1]), 4);
    expect(Array.from(out.slice(0, 3))).toEqual([255, 128, 0]);
  });

  it("clips values above 1.0 for unit linearMax", () => {
    const out = linearFloatToUint8Rgba(new Float32Array([2.5, 0.5, 0, 1]));
    expect(Array.from(out.slice(0, 3))).toEqual([255, 128, 0]);
  });
});
