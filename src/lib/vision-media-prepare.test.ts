import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spaces-access-control", () => ({
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
}));

vi.mock("@/lib/s3-utils", () => ({
  getFromS3: vi.fn(async () => Buffer.from("mock")),
}));

import { isVisionRefusalText, prepareOpenAiVisionImageUrl } from "./vision-media-prepare";

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

describe("isVisionRefusalText", () => {
  it("does not treat structured describer output as refusal", () => {
    const structured = "SUBJECT & POSE: Woman seated.\nCAMERA: normal ≈50mm.";
    expect(isVisionRefusalText(structured)).toBe(false);
  });

  it("detects explicit vision refusal", () => {
    expect(isVisionRefusalText("I'm sorry, I can't help with that image.")).toBe(true);
    expect(
      isVisionRefusalText(
        "I'm unable to provide a detailed analysis of the image, but I can help with general descriptions or questions about similar topics. Let me know how else I can assist!",
      ),
    ).toBe(true);
  });

  it("does not treat crop notes as refusal", () => {
    expect(
      isVisionRefusalText(
        "The feet are not visible in frame. Unable to see shoes in this crop.",
      ),
    ).toBe(false);
    expect(
      isVisionRefusalText(
        "SUBJECT & POSE: Skater mid-trick.\nBOTTOM EDGE: feet NOT in frame — unable to see shoes.",
      ),
    ).toBe(false);
  });
});
