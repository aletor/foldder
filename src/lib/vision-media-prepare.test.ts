import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/spaces-access-control", () => ({
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
}));

vi.mock("@/lib/s3-utils", () => ({
  getFromS3: vi.fn(async () => Buffer.from("mock")),
}));

import { describeVisionResponseFailure, isVisionRefusalText, prepareOpenAiVisionImageUrl } from "./vision-media-prepare";

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
  });

  it("does not treat feet-NOT-in-frame language as refusal", () => {
    const structured =
      "SUBJECT & POSE: Woman standing.\nCOMPOSITION & FRAMING: feet NOT in frame — bottom edge cuts at ankles.";
    expect(isVisionRefusalText(structured)).toBe(false);
  });

  it("accepts substantive descriptions without section headers", () => {
    const prose =
      "A young woman with long black hair stands in a concrete skatepark bowl wearing a pink t-shirt and tan shorts, holding a skateboard vertically. The camera is low looking up with curved bowl lines and warm daylight.";
    expect(isVisionRefusalText(prose)).toBe(false);
  });
});

describe("describeVisionResponseFailure", () => {
  it("returns content-filter message", () => {
    expect(
      describeVisionResponseFailure({ content: "", finishReason: "content_filter" }),
    ).toMatch(/content filter/i);
  });

  it("returns refusal text when provided", () => {
    expect(
      describeVisionResponseFailure({
        content: "",
        refusal: "I can't assist with that.",
      }),
    ).toMatch(/declined to describe/i);
  });
});
