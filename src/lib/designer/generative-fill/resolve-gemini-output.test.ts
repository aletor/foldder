import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveGeneratedImageOutputToBuffer } from "./resolve-gemini-output";

vi.mock("@/lib/s3-utils", () => ({
  getFromS3: vi.fn(async (key: string) => Buffer.from(`s3:${key}`)),
}));

vi.mock("@/lib/s3-media-hydrate", () => ({
  tryExtractKnowledgeFilesKeyFromUrl: vi.fn((url: string) => {
    if (url.includes("/api/spaces/s3-file?key=")) {
      const key = decodeURIComponent(url.split("key=")[1]?.split("&")[0] ?? "");
      return key.startsWith("knowledge-files/") ? key : null;
    }
    return null;
  }),
}));

describe("resolveGeneratedImageOutputToBuffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("decodes data URLs", async () => {
    const png = Buffer.from("hello").toString("base64");
    const buf = await resolveGeneratedImageOutputToBuffer(`data:image/png;base64,${png}`);
    expect(buf.toString()).toBe("hello");
  });

  it("loads relative s3-file routes via getFromS3", async () => {
    const url =
      "/api/spaces/s3-file?key=knowledge-files%2Fuser-assets%2Fu%2Fgenerated%2Fout.png";
    const buf = await resolveGeneratedImageOutputToBuffer(url);
    expect(buf.toString()).toContain("knowledge-files/user-assets/u/generated/out.png");
  });
});
