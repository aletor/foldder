import { beforeEach, describe, expect, it, vi } from "vitest";

let lastGenerateVideosParams: unknown;

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateVideos: vi.fn(async (params: unknown) => {
        lastGenerateVideosParams = params;
        return { name: "operations/test-veo", done: false };
      }),
    };
    operations = {
      getVideosOperation: vi.fn(async () => ({
        name: "operations/test-veo",
        done: true,
        response: {
          generatedVideos: [
            {
              video: {
                videoBytes: Buffer.from("fake mp4").toString("base64"),
                mimeType: "video/mp4",
              },
            },
          ],
        },
      })),
    };
    files = {
      download: vi.fn(async () => undefined),
    };
  },
}));

vi.mock("@/lib/api-usage", () => ({
  recordApiUsage: vi.fn(async () => undefined),
  resolveUsageUserEmailFromRequest: async () => "test@local.foldder",
}));

vi.mock("@/lib/api-usage-controls", () => ({
  ApiServiceDisabledError: class ApiServiceDisabledError extends Error {
    label = "Gemini Veo";
  },
  assertApiServiceEnabled: vi.fn(async () => undefined),
}));

vi.mock("@/lib/pricing-config", () => ({
  estimateGeminiVeoVideoUsd: () => 1,
  veoResolutionMultiplier: () => 1,
}));

vi.mock("@/lib/s3-utils", () => ({
  uploadToS3: vi.fn(async () => "knowledge-files/test-video.mp4"),
  uploadBufferToS3Key: vi.fn(async (key: string) => key),
  getPresignedUrl: vi.fn(async () => "https://example.com/test-video.mp4"),
}));

vi.mock("@/lib/spaces-access-control", () => ({
  buildUserAssetObjectKey: vi.fn(() => "knowledge-files/user-assets/test/generated-video.mp4"),
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
  requireSpacesAuthUser: vi.fn(async () => ({
    ok: true,
    user: { email: "test@local.foldder", image: null, name: "Test" },
  })),
  stableKnowledgeFileUrlFromKey: vi.fn((key: string) => `/api/spaces/s3-file?key=${encodeURIComponent(key)}`),
}));

import { POST } from "./route";

describe("/api/gemini/video", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "test-key";
    lastGenerateVideosParams = undefined;
  });

  it("uses SDK imageBytes payload for Veo image-to-video instead of inlineData", async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from("fake image").toString("base64")}`;
    const request = new Request("http://localhost/api/gemini/video", {
      method: "POST",
      body: JSON.stringify({
        prompt: "A cinematic test shot",
        firstFrame: dataUrl,
        videoRefSlots: {
          character: dataUrl,
        },
        resolution: "720p",
        durationSeconds: 4,
      }),
    });

    const pending = POST(request as never);
    await vi.advanceTimersByTimeAsync(8000);
    const response = await pending;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.output).toContain("/api/spaces/s3-file?key=knowledge-files%2Fuser-assets%2Ftest%2Fgenerated-video.mp4");
    const params = lastGenerateVideosParams as {
      image?: { imageBytes?: string; inlineData?: unknown; mimeType?: string };
      config?: { referenceImages?: unknown[] };
    };
    expect(params.image?.imageBytes).toBeTruthy();
    expect(params.image?.inlineData).toBeUndefined();
    expect(params.config?.referenceImages).toBeUndefined();
  });
});
