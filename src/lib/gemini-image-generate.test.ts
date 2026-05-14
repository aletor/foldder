import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseReferenceImageForGemini: vi.fn(async (image: string) => {
    if (image.startsWith("knowledge-files/")) {
      return {
        data: Buffer.from(`s3:${image}`).toString("base64"),
        mimeType: "image/png",
      };
    }
    if (image.startsWith("data:image/")) {
      return {
        data: image.split(";base64,")[1] || "",
        mimeType: "image/png",
      };
    }
    return null;
  }),
}));

vi.mock("@/lib/parse-reference-image", () => ({
  parseReferenceImageForGemini: mocks.parseReferenceImageForGemini,
}));

vi.mock("@/lib/spaces-access-control", () => ({
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
  stableKnowledgeFileUrlFromKey: vi.fn((key: string) => `/api/spaces/s3-file?key=${encodeURIComponent(key)}`),
}));

vi.mock("@/lib/s3-utils", () => ({
  getPresignedUrl: vi.fn(async () => "https://example.com/generated.png"),
  uploadBufferToS3Key: vi.fn(async (key: string) => key),
  uploadToS3: vi.fn(async () => "knowledge-files/generated.png"),
}));

vi.mock("@/lib/api-usage", () => ({
  parseGeminiUsageMetadata: vi.fn(() => ({
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  })),
  recordApiUsage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/pricing-config", () => ({
  estimateGeminiImageGenerationUsd: vi.fn(() => 0.01),
}));

import { geminiImageGenerate } from "@/lib/gemini-image-generate";

describe("geminiImageGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    inline_data: {
                      data: Buffer.from("generated").toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
  });

  it("loads relative stable S3 reference URLs by their authorized key", async () => {
    const result = await geminiImageGenerate(
      {
        prompt: "test prompt",
        images: [
          `data:image/png;base64,${Buffer.from("base").toString("base64")}`,
          "/api/spaces/s3-file?key=knowledge-files%2Fuser-assets%2Fabc%2Fref.png",
        ],
      },
      undefined,
      { usageUserEmail: "user@example.com" },
    );

    expect(result.output).toContain("/api/spaces/s3-file?key=");
    expect(mocks.parseReferenceImageForGemini).toHaveBeenCalledWith(
      "knowledge-files/user-assets/abc/ref.png",
    );
  });
});
