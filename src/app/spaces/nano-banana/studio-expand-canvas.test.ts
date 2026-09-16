import { describe, expect, it } from "vitest";
import { frameFromPad } from "./studio-frame-adjust";
import { mapFrameLayoutToOutputSize, resolveOpenAiExpandOutputSize } from "./studio-expand-canvas";

describe("resolveOpenAiExpandOutputSize", () => {
  it("pide a ChatGPT el size del lienzo (múltiplo de 16), no 16:9 ni 4:3", () => {
    const out = resolveOpenAiExpandOutputSize(2560, 1969, "2k");
    expect(out.size).toBe("2560x1968");
    expect(out.aspect).toBe("2560:1968");
    expect(out.size).not.toBe("2560x1440");
    expect(out.size).not.toBe("2560x1920");
  });
});

describe("mapFrameLayoutToOutputSize", () => {
  it("coloca la foto original en la misma fracción del lienzo API", () => {
    const layout = frameFromPad(2560, 1440, { left: 0, top: 256, right: 0, bottom: 257 });
    expect(layout.canvasW).toBe(2560);
    expect(layout.canvasH).toBe(1953);
    const api = mapFrameLayoutToOutputSize(layout, 2560, 1952);
    expect(api.photoY).toBeGreaterThan(200);
    expect(api.photoY + api.photoH).toBeLessThan(1952);
    expect(api.photoX).toBe(0);
    expect(api.photoW).toBe(2560);
  });
});
