import { describe, expect, it } from "vitest";
import {
  resolveLogoDisplayUrl,
  resolveLogoExportUrl,
  resolveLogoRasterUrl,
} from "./logo-display-url";
import type { LogoValue } from "../model/trait-values";

describe("resolveLogoDisplayUrl", () => {
  const raster: LogoValue = { imageUrl: "data:image/png;base64,abc", variant: "positive", label: "logo" };

  it("prioriza raster sobre vector S3 en la UI", () => {
    const vectorUrl = "/api/spaces/s3-file?key=logo.svg";
    expect(resolveLogoDisplayUrl(raster, { vectorUrl })).toBe(raster.imageUrl);
  });

  it("usa vector si no hay raster", () => {
    const vectorUrl = "data:image/svg+xml;base64,PHN2Zy8+";
    expect(resolveLogoDisplayUrl({ ...raster, imageUrl: vectorUrl }, { vectorUrl })).toBe(vectorUrl);
  });

  it("export prioriza vector", () => {
    const vectorUrl = "/api/spaces/s3-file?key=logo.svg";
    expect(resolveLogoExportUrl(raster, { vectorUrl })).toBe(vectorUrl);
  });

  it("raster fallback evita confundir vectorUrl sustituido en imageUrl", () => {
    const vectorUrl = "/api/spaces/s3-file?key=logo.svg";
    expect(
      resolveLogoRasterUrl(
        { ...raster, imageUrl: vectorUrl },
        { vectorUrl, rasterImageUrl: raster.imageUrl },
      ),
    ).toBe(raster.imageUrl);
  });
});
