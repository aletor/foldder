import { describe, expect, it } from "vitest";
import { needsGenomaMediaProxy, resolveGenomaPreviewUrl } from "./genoma-media-url";

describe("genoma-media-url", () => {
  it("proxies external http(s) URLs", () => {
    const url = "https://alimafilms.com/wp-content/uploads/hero.jpg";
    expect(needsGenomaMediaProxy(url)).toBe(true);
    expect(resolveGenomaPreviewUrl(url)).toBe(
      `/api/spaces/genoma/media-proxy?url=${encodeURIComponent(url)}`,
    );
  });

  it("keeps local and S3 proxy URLs unchanged", () => {
    expect(resolveGenomaPreviewUrl("/nodes/logo.png")).toBe("/nodes/logo.png");
    expect(resolveGenomaPreviewUrl("/api/spaces/s3-file?key=knowledge-files%2Fx.png")).toBe(
      "/api/spaces/s3-file?key=knowledge-files%2Fx.png",
    );
    expect(needsGenomaMediaProxy("data:image/png;base64,abc")).toBe(false);
  });

  it("normalizes bare knowledge-files keys to s3-file route", () => {
    expect(resolveGenomaPreviewUrl("knowledge-files/u/genoma/ingest/logo.png")).toBe(
      "/api/spaces/s3-file?key=knowledge-files%2Fu%2Fgenoma%2Fingest%2Flogo.png",
    );
  });

  it("normalizes protocol-relative URLs", () => {
    const url = "//cdn.example.com/a.webp";
    expect(resolveGenomaPreviewUrl(url)).toBe(
      `/api/spaces/genoma/media-proxy?url=${encodeURIComponent("https://cdn.example.com/a.webp")}`,
    );
  });
});
