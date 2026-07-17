import { describe, expect, it } from "vitest";
import {
  extensionForProjectMediaContentType,
  isAllowedProjectMediaContentType,
  normalizeProjectMediaContentType,
} from "./project-media-upload-policy";

describe("project-media-upload-policy", () => {
  it("allows image/video/audio prefixes", () => {
    expect(isAllowedProjectMediaContentType("image/png", "a.png")).toBe(true);
    expect(isAllowedProjectMediaContentType("video/mp4", "a.mp4")).toBe(true);
    expect(isAllowedProjectMediaContentType("audio/mpeg", "a.mp3")).toBe(true);
  });

  it("allows PDF by mime and by filename when mime is generic", () => {
    expect(isAllowedProjectMediaContentType("application/pdf", "deck.pdf")).toBe(true);
    expect(isAllowedProjectMediaContentType("application/octet-stream", "deck.pdf")).toBe(true);
    expect(isAllowedProjectMediaContentType("", "deck.pdf")).toBe(true);
    expect(normalizeProjectMediaContentType("", "deck.pdf")).toBe("application/pdf");
    expect(extensionForProjectMediaContentType("application/pdf", "deck.pdf")).toBe("pdf");
  });

  it("rejects unsupported types", () => {
    expect(isAllowedProjectMediaContentType("application/zip", "a.zip")).toBe(false);
    expect(isAllowedProjectMediaContentType("text/html", "a.html")).toBe(false);
  });
});
