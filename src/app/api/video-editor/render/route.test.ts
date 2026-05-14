import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-usage", () => ({
  resolveUsageUserEmailFromRequest: async () => "test@local.foldder",
}));

vi.mock("@/lib/api-usage-controls", () => ({
  ApiServiceDisabledError: class ApiServiceDisabledError extends Error {
    serviceId = "aws-fargate-render";
    label = "AWS Fargate · Render Video Editor";
  },
  assertApiServiceEnabled: vi.fn(async () => undefined),
}));

vi.mock("@/lib/spaces-access-control", () => ({
  canUserAccessKnowledgeFileKey: vi.fn(async () => true),
  requireSpacesAuthUser: vi.fn(async () => ({
    ok: true,
    user: { email: "test@local.foldder", image: null, name: "Test" },
  })),
}));

import { POST } from "./route";

describe("/api/video-editor/render", () => {
  it("returns an error when the manifest has no visual clips", async () => {
    const response = await POST(new Request("http://localhost/api/video-editor/render", {
      method: "POST",
      body: JSON.stringify({
        manifest: {
          editorNodeId: "editor_1",
          settings: {
            width: 1920,
            height: 1080,
            fps: 25,
            format: "mp4",
            videoCodec: "h264",
            audioCodec: "aac",
            quality: "high",
            backgroundColor: "black",
          },
          durationSeconds: 10,
          tracks: {
            video: [],
            audio: [],
            music: [],
            sfx: [],
            ambience: [],
            voiceover: [],
          },
        },
      }),
    }));
    const json = await response.json() as { status?: string; error?: string };

    expect(response.status).toBe(400);
    expect(json.status).toBe("error");
    expect(json.error).toBe("no_visual_clips");
  });
});
