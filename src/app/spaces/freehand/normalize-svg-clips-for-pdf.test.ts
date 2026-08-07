import { describe, expect, it } from "vitest";
import {
  ellipseToPathD,
  flattenClipPathChildrenToPathDSync,
  normalizeSvgClipsForVectorPdf,
  transformPathDWithMatrix,
} from "./normalize-svg-clips-for-pdf";

describe("ellipseToPathD", () => {
  it("returns a closed cubic path", () => {
    const d = ellipseToPathD(10, 20, 5, 8);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.includes("C ")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });
});

describe("transformPathDWithMatrix", () => {
  it("translates a simple rect path", () => {
    const out = transformPathDWithMatrix("M 0 0 L 2 0 L 2 3 L 0 3 Z", {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 10,
      f: 5,
    });
    expect(out).toContain("M 10 5");
    expect(out).toContain("L 12 5");
  });

  it("returns identity path unchanged for identity matrix", () => {
    const d = "M 1 2 L 3 4 Z";
    expect(
      transformPathDWithMatrix(d, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    ).toBe(d);
  });
});

describe("flattenClipPathChildrenToPathDSync", () => {
  it("bakes ellipse + transform into a path d", () => {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <clipPath id="c">
          <ellipse cx="10" cy="10" rx="5" ry="5" transform="translate(20 0)" />
        </clipPath>
      </svg>`,
      "image/svg+xml",
    );
    const clip = doc.querySelector("clipPath")!;
    const d = flattenClipPathChildrenToPathDSync(clip);
    expect(d).toBeTruthy();
    expect(d!.includes("M ")).toBe(true);
    // centro ~30,10 tras translate(20,0) → left edge x=25
    expect(d!).toMatch(/M 25 /);
  });
});

describe("normalizeSvgClipsForVectorPdf", () => {
  it("moves paste-inside clipPath into local defs with baked path (contenido vectorial)", async () => {
    const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <g transform="translate(40 30)">
    <clipPath id="clip-cc-test" clipPathUnits="userSpaceOnUse">
      <ellipse cx="50" cy="40" rx="40" ry="30" />
    </clipPath>
    <g clip-path="url(#clip-cc-test)">
      <path d="M 0 0 H 100 V 80 H 0 Z" fill="#888" />
    </g>
  </g>
</svg>`;
    const out = await normalizeSvgClipsForVectorPdf(markup);
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    const clip = doc.querySelector("#clip-cc-test");
    expect(clip).toBeTruthy();
    expect(clip!.closest("defs")).toBeTruthy();
    expect(clip!.querySelector("ellipse")).toBeNull();
    expect(clip!.querySelector("path")?.getAttribute("d")).toBeTruthy();
    expect(doc.querySelector('g[clip-path="url(#clip-cc-test)"]')).toBeTruthy();
  });

  it("does not destroy page-content clip with images (regression)", async () => {
    const markup = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  <defs>
    <clipPath id="fh-page-content-clip" clipPathUnits="userSpaceOnUse">
      <rect x="0" y="0" width="400" height="400" />
    </clipPath>
  </defs>
  <g clip-path="url(#fh-page-content-clip)" data-fh-page-content="1">
    <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" x="10" y="10" width="100" height="80" />
    <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" x="120" y="10" width="100" height="80" />
    <rect x="0" y="0" width="50" height="50" fill="#0f0" />
  </g>
</svg>`;
    const out = await normalizeSvgClipsForVectorPdf(markup);
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    expect(doc.querySelectorAll("image").length).toBe(2);
    expect(doc.querySelector("[data-fh-page-content]")).toBeTruthy();
    expect(doc.querySelector("rect[fill='#0f0'], rect[fill=\"#0f0\"]")).toBeTruthy();
  });
});
