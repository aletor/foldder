import { afterEach, describe, expect, it, vi } from "vitest";
import { appendMediaStreamParam, fetchAuthedMedia } from "@/lib/fetch-authed-media";

describe("fetchAuthedMedia", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows a successful signed redirect without streaming", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchAuthedMedia("/api/spaces/s3-file?key=knowledge-files%2Fa.png");
    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spaces/s3-file?key=knowledge-files%2Fa.png",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("retries through the function when the signed redirect throws", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("stream=1")) return { ok: true, status: 200 } as Response;
      throw new Error("cors");
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchAuthedMedia("/api/spaces/s3-file?key=knowledge-files%2Fa.png");
    expect(response.ok).toBe(true);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "/api/spaces/s3-file?key=knowledge-files%2Fa.png&stream=1",
    );
  });

  it("appends stream once", () => {
    expect(appendMediaStreamParam("/api/spaces/s3-file?key=a")).toBe("/api/spaces/s3-file?key=a&stream=1");
    expect(appendMediaStreamParam("/api/spaces/s3-file?key=a&stream=1")).toBe(
      "/api/spaces/s3-file?key=a&stream=1",
    );
  });
});
