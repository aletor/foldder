import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/canvas-media-thumbnail", () => ({
  resolveFullQualityMediaUrl: (url?: string | null, s3Key?: string | null) => {
    if (s3Key) return `/api/spaces/s3-file?key=${encodeURIComponent(s3Key)}`;
    return url ?? undefined;
  },
}));

vi.mock("@/lib/s3-media-hydrate", () => ({
  resolveKnowledgeFilesS3Key: (...refs: Array<string | undefined | null>) => {
    for (const ref of refs) {
      if (ref?.startsWith("knowledge-files/")) return ref;
    }
    return null;
  },
}));

vi.mock("@/app/spaces/resolve-connected-media-url", () => ({
  ensureServerReadableMediaUrl: vi.fn(async (url: string) => `data:image/png;base64,${url}`),
}));

import { ensureServerReadableMediaUrl } from "@/app/spaces/resolve-connected-media-url";
import { resolveMediaRefForApi } from "./resolve-media-ref-for-api";

describe("resolveMediaRefForApi", () => {
  it("prefiere la clave S3 estable sobre la URL del lienzo", async () => {
    const key = "knowledge-files/user-assets/u/ref.png";
    await expect(
      resolveMediaRefForApi({
        url: "/api/spaces/s3-file?key=...&thumb=960",
        s3Key: key,
      }),
    ).resolves.toBe(key);
  });

  it("convierte blob: a data URL legible por el servidor", async () => {
    const out = await resolveMediaRefForApi({ url: "blob:http://localhost/abc" });
    expect(out).toContain("data:image/png;base64,");
    expect(ensureServerReadableMediaUrl).toHaveBeenCalled();
  });
});
