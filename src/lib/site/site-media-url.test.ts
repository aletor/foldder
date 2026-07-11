import { describe, expect, it } from "vitest";
import { resolveSiteMediaSrc } from "./site-media-url";

describe("resolveSiteMediaSrc", () => {
  it("absolutizes /api paths in studio preview", () => {
    const src = "/api/spaces/s3-file?key=spaces%2Fk%2Fphoto.png";
    expect(resolveSiteMediaSrc(src, { previewOrigin: "http://localhost:3000" })).toBe(
      "http://localhost:3000/api/spaces/s3-file?key=spaces%2Fk%2Fphoto.png",
    );
  });

  it("resolves s3Key when url is empty", () => {
    const resolved = resolveSiteMediaSrc("", {
      s3Key: "knowledge-files/user-assets/abc/photo.png",
    });
    expect(resolved).toContain("/api/spaces/s3-file");
    expect(resolved).toContain("knowledge-files");
  });

  it("leaves absolute urls unchanged", () => {
    expect(resolveSiteMediaSrc("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });
});
