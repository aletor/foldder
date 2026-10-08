import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSameOriginOrBlobHrefAsDataUrl,
  isSameOriginSpacesApiHref,
  resolveExportImageHref,
} from "./export-safe-image-href";

describe("export-safe-image-href", () => {
  it("detects relative /api/spaces/s3-file URLs used by Designer frames", () => {
    expect(isSameOriginSpacesApiHref("/api/spaces/s3-file?key=abc")).toBe(true);
    expect(isSameOriginSpacesApiHref("/api/spaces/proxy")).toBe(true);
  });

  it("rejects remote S3 / CDN URLs as same-origin spaces API", () => {
    expect(
      isSameOriginSpacesApiHref(
        "https://bucket.s3.amazonaws.com/foo.png?X-Amz-Signature=1",
        "https://foldder.com/app",
      ),
    ).toBe(false);
  });

  it("resolves relative s3-file hrefs against the document base", () => {
    expect(resolveExportImageHref("/api/spaces/s3-file?key=x", "https://foldder.com/studio")).toBe(
      "https://foldder.com/api/spaces/s3-file?key=x",
    );
  });

  describe("fetchSameOriginOrBlobHrefAsDataUrl", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("rewrites expired S3 presigns to authenticated s3-file with credentials", async () => {
      const key = "knowledge-files/user-assets/abc/shot.png";
      const presigned = `https://bucket.s3.eu-west-1.amazonaws.com/${key}?X-Amz-Signature=expired`;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        blob: async () =>
          new Blob([Uint8Array.from([1, 2, 3])], { type: "image/png" }),
      });

      await fetchSameOriginOrBlobHrefAsDataUrl(presigned);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/spaces/s3-file?key=${encodeURIComponent(key)}`,
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });
});
