import { describe, expect, it } from "vitest";
import { capLogoVisionPages, guaranteedLogoPages } from "./rank-pdf-pages-for-logo-select";

describe("guaranteedLogoPages", () => {
  it("incluye portada y cierre", () => {
    expect(guaranteedLogoPages(1)).toEqual([1]);
    expect(guaranteedLogoPages(2)).toEqual([1, 2]);
    expect(guaranteedLogoPages(16)).toEqual([1, 2, 16]);
  });
});

describe("capLogoVisionPages", () => {
  it("no suelta la última página cuando keywords llenan el cupo", () => {
    const picked = [1, 2, 3, 4, 5, 6, 7, 8, 16];
    // garantizadas 1,2,16 + 1 extra (cupo 4)
    expect(capLogoVisionPages(picked, 16, 4)).toEqual([1, 2, 3, 16]);
  });

  it("rellena extras sin desplazar el cierre en manuals largos", () => {
    const picked = [1, 2, 3, 4, 5, 6, 7, 8, 12, 50];
    expect(capLogoVisionPages(picked, 50, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 50]);
  });

  it("deck cap=4 mantiene cierre aunque haya muchas páginas tempranas", () => {
    const picked = [1, 2, 3, 4, 5, 64];
    expect(capLogoVisionPages(picked, 64, 4)).toEqual([1, 2, 3, 64]);
  });
});
