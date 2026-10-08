import { describe, expect, it } from "vitest";
import {
  isSameOriginSpacesApiHref,
  resolveExportImageHref,
} from "./export-safe-image-href";

describe("export-safe-image-href", () => {
  it("detects relative /api/spaces/s3-file URLs used by Designer frames", () => {
    expect(isSameOriginSpacesApiHref("/api/spaces/s3-file?key=abc")).toBe(true);
    expect(isSameOriginSpacesApiHref("/api/spaces/proxy")).toBe(true);
  });

  it("rejects remote S3 / CDN URLs", () => {
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
});
