import { describe, expect, it } from "vitest";
import { parseBrandKitIngestS3FileRefs } from "./brand-kit-ingest-s3-refs";

describe("parseBrandKitIngestS3FileRefs", () => {
  it("parses valid refs", () => {
    const raw = JSON.stringify([
      { key: "knowledge-files/user-assets/abc/brandKit/ingest/a.pdf", name: "a.pdf", mime: "application/pdf" },
    ]);
    expect(parseBrandKitIngestS3FileRefs(raw)).toEqual([
      {
        key: "knowledge-files/user-assets/abc/brandKit/ingest/a.pdf",
        name: "a.pdf",
        mime: "application/pdf",
      },
    ]);
  });

  it("ignores invalid payloads", () => {
    expect(parseBrandKitIngestS3FileRefs(null)).toEqual([]);
    expect(parseBrandKitIngestS3FileRefs("not-json")).toEqual([]);
    expect(parseBrandKitIngestS3FileRefs(JSON.stringify([{ name: "x" }]))).toEqual([]);
  });
});
