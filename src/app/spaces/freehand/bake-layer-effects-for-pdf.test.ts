import { afterEach, describe, expect, it, vi } from "vitest";
import { bakeLayerEffectsForVectorPdf } from "./bake-layer-effects-for-pdf";

function mockRasterEnv() {
  const fakeCtx = { drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    fakeCtx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  );
  const blobUrls = new Map<string, Blob>();
  let blobSeq = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const u = `blob:mock-${++blobSeq}`;
      blobUrls.set(u, blob);
      return u;
    },
    revokeObjectURL: (u: string) => {
      blobUrls.delete(u);
    },
  });
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

describe("bakeLayerEffectsForVectorPdf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("leaves unmarked markup unchanged", async () => {
    const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect x="10" y="10" width="40" height="40" fill="#f00" />
</svg>`;
    const out = await bakeLayerEffectsForVectorPdf(markup);
    expect(out).toContain("<rect");
    expect(out).not.toContain("data-fh-fx-bake");
  });

  it("keeps markers when canvas 2d is unavailable (jsdom)", async () => {
    const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
  <g data-fh-fx-bake="look-1" data-fh-fx-x="0" data-fh-fx-y="0" data-fh-fx-w="100" data-fh-fx-h="100">
    <rect x="10" y="10" width="80" height="80" fill="#3366cc" />
  </g>
</svg>`;
    const out = await bakeLayerEffectsForVectorPdf(markup);
    expect(out).toContain('data-fh-fx-bake="look-1"');
  });

  it("replaces bake groups with PNG when canvas rasterization works", async () => {
    mockRasterEnv();
    const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
  <defs>
    <filter id="gray"><feColorMatrix type="saturate" values="0" /></filter>
  </defs>
  <g
    data-fh-fx-bake="look-1"
    data-fh-fx-x="0"
    data-fh-fx-y="0"
    data-fh-fx-w="100"
    data-fh-fx-h="100"
  >
    <rect x="10" y="10" width="80" height="80" fill="#3366cc" filter="url(#gray)" />
  </g>
</svg>`;
    const out = await bakeLayerEffectsForVectorPdf(markup);
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    expect(doc.querySelector("[data-fh-fx-bake]")).toBeNull();
    const img = doc.querySelector("image");
    expect(img).toBeTruthy();
    const href = img!.getAttribute("href") || img!.getAttribute("xlink:href") || "";
    expect(href.startsWith("data:image/png")).toBe(true);
    expect(img!.getAttribute("width")).toBe("100");
    expect(img!.getAttribute("height")).toBe("100");
  });

  it("bakes nested markers deepest-first into a single outer image", async () => {
    mockRasterEnv();
    const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <g data-fh-fx-bake="outer" data-fh-fx-x="0" data-fh-fx-y="0" data-fh-fx-w="120" data-fh-fx-h="120">
    <g data-fh-fx-bake="inner" data-fh-fx-x="20" data-fh-fx-y="20" data-fh-fx-w="40" data-fh-fx-h="40">
      <rect x="20" y="20" width="40" height="40" fill="#0a0" />
    </g>
    <rect x="70" y="70" width="30" height="30" fill="#00a" />
  </g>
</svg>`;
    const out = await bakeLayerEffectsForVectorPdf(markup);
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    expect(doc.querySelectorAll("[data-fh-fx-bake]").length).toBe(0);
    expect(doc.querySelectorAll("image").length).toBe(1);
  });
});
