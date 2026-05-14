import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-usage", () => ({
  recordApiUsage: vi.fn(async () => undefined),
  resolveUsageUserEmailFromRequest: async () => "test@local.foldder",
}));

vi.mock("@/lib/api-usage-controls", () => ({
  ApiServiceDisabledError: class ApiServiceDisabledError extends Error {
    serviceId = "openai-subtitles";
    label = "OpenAI · Transcripción / subtítulos";
  },
  assertApiServiceEnabled: vi.fn(async () => undefined),
}));

vi.mock("@/lib/spaces-access-control", () => ({
  buildUserAssetObjectKey: vi.fn(({ filename, folder }) => `knowledge-files/user-assets/test/${folder}/${filename}`),
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
  requireSpacesAuthUser: vi.fn(async () => ({
    ok: true,
    user: { email: "test@local.foldder", image: null, name: "Test" },
  })),
}));

import { POST } from "./route";

describe("/api/video-editor/subtitles/transcribe", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalProvider = process.env.SUBTITLE_TRANSCRIPTION_PROVIDER;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    process.env.SUBTITLE_TRANSCRIPTION_PROVIDER = originalProvider;
    vi.restoreAllMocks();
  });

  it("returns a clear provider_not_configured error when OpenAI key is missing", async () => {
    process.env.OPENAI_API_KEY = "";
    process.env.SUBTITLE_TRANSCRIPTION_PROVIDER = "openai";

    const response = await POST(new Request("http://localhost/api/video-editor/subtitles/transcribe", {
      method: "POST",
      body: JSON.stringify({ sourceAssetId: "knowledge-files/video.mp4", mode: "lines" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(501);
    expect(json.error).toContain("provider_not_configured");
  });

  it("does not silently fallback to an unknown provider", async () => {
    process.env.SUBTITLE_TRANSCRIPTION_PROVIDER = "aws";

    const response = await POST(new Request("http://localhost/api/video-editor/subtitles/transcribe", {
      method: "POST",
      body: JSON.stringify({ sourceAssetId: "knowledge-files/video.mp4", mode: "lines" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(501);
    expect(json.error).toBe("provider_not_implemented:aws");
  });
});
