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
  imagePayload: Buffer.alloc(4096, 0xab),
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
  recordApiUsage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/pricing-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pricing-config")>();
  return {
    ...actual,
    estimateOpenAiImageGenerationUsd: vi.fn(() => 0.05),
  };
});

const generateMock = vi.fn(async () => ({
  data: [{ b64_json: mocks.imagePayload.toString("base64") }],
}));
const editMock = vi.fn(async () => ({
  data: [{ b64_json: mocks.imagePayload.toString("base64") }],
}));

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    images: {
      generate: generateMock,
      edit: editMock,
    },
  })),
  toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
}));

import {
  OPENAI_IMAGE_MODEL,
  openAiImageGenerate,
  resolveOpenAiImageQuality,
  resolveOpenAiImageSize,
} from "@/lib/openai-image-generate";

describe("resolveOpenAiImageSize", () => {
  it("maps 16:9 2k to a landscape size with 2560 long edge", () => {
    expect(resolveOpenAiImageSize("16:9", "2k")).toBe("2560x1440");
  });

  it("maps 9:16 1k to portrait preset", () => {
    expect(resolveOpenAiImageSize("9:16", "1k")).toBe("864x1536");
  });
});

describe("resolveOpenAiImageQuality", () => {
  it("uses high for 4k", () => {
    expect(resolveOpenAiImageQuality("4k")).toBe("high");
  });
});

describe("openAiImageGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("calls images.generate for text-only prompts", async () => {
    const result = await openAiImageGenerate(
      { prompt: "A red apple on a table", aspect_ratio: "1:1", resolution: "1k" },
      () => {},
      { usageUserEmail: "user@example.com" },
    );

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(editMock).not.toHaveBeenCalled();
    expect(result.model).toBe(OPENAI_IMAGE_MODEL);
    expect(result.output).toContain("knowledge-files");
    expect(result.key).toContain("generated/");
  });

  it("calls images.edit when reference images are provided", async () => {
    await openAiImageGenerate(
      {
        prompt: "Make the sky purple",
        images: ["data:image/png;base64,abcd"],
        aspect_ratio: "16:9",
        resolution: "2k",
      },
      () => {},
      { usageUserEmail: "user@example.com" },
    );

    expect(editMock).toHaveBeenCalledTimes(1);
    expect(generateMock).not.toHaveBeenCalled();
  });
});
