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
  finalImagePayload: Buffer.alloc(4096, 0xab),
  thoughtImagePayload: Buffer.alloc(512, 0x55),
}));

vi.mock("@/lib/parse-reference-image", () => ({
  parseReferenceImageForGemini: mocks.parseReferenceImageForGemini,
}));

vi.mock("@/lib/spaces-access-control", () => ({
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
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

vi.mock("sharp", () => {
  const sharpMock = vi.fn((input: Buffer) => {
    const chain = {
      metadata: vi.fn(async () => ({ width: 512, height: 512 })),
      resize: vi.fn(function resize() {
        return chain;
      }),
      png: vi.fn(function png() {
        return chain;
      }),
      toBuffer: vi.fn(async () => input),
    };
    return chain;
  });
  (sharpMock as unknown as { kernel: { lanczos3: string } }).kernel = { lanczos3: "lanczos3" };
  return { default: sharpMock };
});

import {
  extractGeminiGeneratedImageBuffer,
  finalizeGeminiImageBuffer,
  geminiImageGenerate,
  normalizeGeminiImageAspectRatio,
  resolveGeminiApiImageSize,
} from "@/lib/gemini-image-generate";

describe("normalizeGeminiImageAspectRatio", () => {
  it("keeps supported ratios", () => {
    expect(normalizeGeminiImageAspectRatio("16:9")).toBe("16:9");
    expect(normalizeGeminiImageAspectRatio("4:5")).toBe("4:5");
  });

  it("maps cinematic anamorphic to 21:9", () => {
    expect(normalizeGeminiImageAspectRatio("2.39:1")).toBe("21:9");
  });

  it("falls back to 16:9 for unknown ratios", () => {
    expect(normalizeGeminiImageAspectRatio("7:3")).toBe("16:9");
  });
});

describe("resolveGeminiApiImageSize", () => {
  it("maps Gemini 3 2K requests to API 1K with 2x upscale", () => {
    expect(resolveGeminiApiImageSize("gemini-3.1-flash-image-preview", "2k")).toEqual({
      apiImageSize: "1K",
      upscaleFactor: 2,
      requestedResolution: "2k",
    });
  });

  it("maps Gemini 3 4K requests to API 1K with 4x upscale", () => {
    expect(resolveGeminiApiImageSize("gemini-3-pro-image-preview", "4k")).toEqual({
      apiImageSize: "1K",
      upscaleFactor: 4,
      requestedResolution: "4k",
    });
  });

  it("passes native 2K through for Gemini 2.5 flash image", () => {
    expect(resolveGeminiApiImageSize("gemini-2.5-flash-image", "2k")).toEqual({
      apiImageSize: "2K",
      upscaleFactor: 1,
      requestedResolution: "2k",
    });
  });
});

describe("finalizeGeminiImageBuffer", () => {
  it("falls back to source JPEG bytes when sharp fails", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(3000, 0xab)]);
    vi.mocked((await import("sharp")).default).mockImplementationOnce(() => {
      throw new Error("sharp unavailable on platform");
    });
    const result = await finalizeGeminiImageBuffer(jpeg, 2);
    expect(result.extension).toBe("jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.buffer.equals(jpeg)).toBe(true);
  });
});

describe("extractGeminiGeneratedImageBuffer", () => {
  it("skips Gemini 3 thought previews and keeps the last final image", () => {
    const midFinal = Buffer.alloc(3000, 0xcd);
    const buffer = extractGeminiGeneratedImageBuffer([
      {
        thought: true,
        inline_data: { data: mocks.thoughtImagePayload.toString("base64"), mime_type: "image/png" },
      },
      {
        inline_data: { data: midFinal.toString("base64"), mime_type: "image/png" },
      },
      {
        inline_data: { data: mocks.finalImagePayload.toString("base64"), mime_type: "image/png" },
      },
    ]);

    expect(buffer?.equals(mocks.finalImagePayload)).toBe(true);
  });

  it("prefers the last non-thought frame even when an earlier preview is larger", () => {
    const preview = Buffer.alloc(9000, 0x55);
    const final = Buffer.alloc(2500, 0xab);
    const buffer = extractGeminiGeneratedImageBuffer([
      { inline_data: { data: preview.toString("base64") } },
      { inline_data: { data: final.toString("base64") } },
    ]);

    expect(buffer?.equals(final)).toBe(true);
  });

  it("falls back to the last inline image when every part is marked thought", () => {
    const first = Buffer.alloc(900, 1);
    const last = Buffer.alloc(2500, 2);
    const buffer = extractGeminiGeneratedImageBuffer([
      { thought: true, inline_data: { data: first.toString("base64") } },
      { thought: true, inline_data: { data: last.toString("base64") } },
    ]);

    expect(buffer?.equals(last)).toBe(true);
  });
});

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
                    thought: true,
                    inline_data: {
                      data: mocks.thoughtImagePayload.toString("base64"),
                    },
                  },
                  {
                    inline_data: {
                      data: mocks.finalImagePayload.toString("base64"),
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
