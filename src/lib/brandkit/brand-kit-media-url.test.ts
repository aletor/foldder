import { describe, expect, it } from "vitest";
import { needsBrandKitMediaProxy, resolveBrandKitPreviewUrl } from "./brand-kit-media-url";

describe("brand-kit-media-url", () => {
  it("proxies external http(s) URLs", () => {
    const url = "https://alimafilms.com/wp-content/uploads/hero.jpg";
    expect(needsBrandKitMediaProxy(url)).toBe(true);
    expect(resolveBrandKitPreviewUrl(url)).toBe(
      `/api/spaces/brandKit/media-proxy?url=${encodeURIComponent(url)}`,
    );
  });

  it("keeps local and S3 proxy URLs unchanged", () => {
    expect(resolveBrandKitPreviewUrl("/nodes/logo.png")).toBe("/nodes/logo.png");
    expect(resolveBrandKitPreviewUrl("/api/spaces/s3-file?key=knowledge-files%2Fx.png")).toBe(
      "/api/spaces/s3-file?key=knowledge-files%2Fx.png",
    );
    expect(needsBrandKitMediaProxy("data:image/png;base64,abc")).toBe(false);
  });

  it("normalizes bare knowledge-files keys to s3-file route", () => {
    expect(resolveBrandKitPreviewUrl("knowledge-files/u/brandKit/ingest/logo.png")).toBe(
      "/api/spaces/s3-file?key=knowledge-files%2Fu%2FbrandKit%2Fingest%2Flogo.png",
    );
  });

  it("normalizes protocol-relative URLs", () => {
    const url = "//cdn.example.com/a.webp";
    expect(resolveBrandKitPreviewUrl(url)).toBe(
      `/api/spaces/brandKit/media-proxy?url=${encodeURIComponent("https://cdn.example.com/a.webp")}`,
    );
  });
});
