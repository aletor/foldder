import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGeneratedVideo } from "@/lib/video-generation-client";

describe("requestGeneratedVideo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a video that is already finished", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "success", output: "/api/spaces/s3-file?key=a", key: "a" }),
      })),
    );
    const result = await requestGeneratedVideo("/api/gemini/video", { prompt: "hola" });
    expect(result.output).toContain("/api/spaces/s3-file");
  });

  it("polls until the short status call returns the file", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls += 1;
        if (calls === 1) {
          return { ok: true, json: async () => ({ status: "pending", jobId: "11111111-1111-4111-8111-111111111111" }) };
        }
        expect(String(url)).toContain("jobId=11111111-1111-4111-8111-111111111111");
        return { ok: true, json: async () => ({ status: "success", output: "/video.mp4", key: "k" }) };
      }),
    );
    const pending = requestGeneratedVideo("/api/seedance/video", { prompt: "hola" }, { intervalMs: 1000, timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toMatchObject({ output: "/video.mp4" });
  });
});
