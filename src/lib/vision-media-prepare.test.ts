import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spaces-access-control", () => ({
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
}));

vi.mock("@/lib/s3-utils", () => ({
  getFromS3: vi.fn(async () => Buffer.from("mock")),
}));

import { prepareOpenAiVisionImageUrl } from "./vision-media-prepare";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("prepareOpenAiVisionImageUrl", () => {
  it("returns inline data URL instead of presigned S3 URL", async () => {
    const out = await prepareOpenAiVisionImageUrl(
      TINY_PNG,
      "http://localhost:3000",
      "test@example.com",
    );
    expect(out.startsWith("data:image/")).toBe(true);
    expect(out.includes(";base64,")).toBe(true);
    expect(out.startsWith("https://")).toBe(false);
  });
});
