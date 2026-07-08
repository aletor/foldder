import { describe, expect, it } from "vitest";
import { triageGenomaFilename } from "./triage";

describe("triageGenomaFilename", () => {
  it("classifies logo filenames", () => {
    expect(triageGenomaFilename("brand-logo.png", "image/png").kind).toBe("logo_image");
  });

  it("classifies gallery images", () => {
    expect(triageGenomaFilename("hero-photo.jpg", "image/jpeg").kind).toBe("gallery_image");
  });

  it("classifies PDF manuals", () => {
    expect(triageGenomaFilename("manual-marca.pdf", "application/pdf").kind).toBe("brand_document");
  });
});
