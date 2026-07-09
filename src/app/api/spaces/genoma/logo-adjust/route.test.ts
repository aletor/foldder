import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPdfBuffer = Buffer.from("%PDF-1.4 mock");
const mockPng = Buffer.from("fake-png");
const mockCropped = Buffer.from("cropped-png");

vi.mock("@/lib/spaces-access-control", () => ({
  requireSpacesAuthUser: vi.fn(async () => ({
    ok: true,
    user: { email: "test@local.foldder", image: null, name: "Test" },
  })),
}));

vi.mock("@/lib/genoma/ingest/genoma-source-pdf-store", () => ({
  loadGenomaSourcePdf: vi.fn(async () => mockPdfBuffer),
}));

vi.mock("@/lib/brain/pdf-page-render", () => ({
  renderPdfPagesAt: vi.fn(async () => [
    {
      pageNumber: 1,
      pngBuffer: mockPng,
      width: 1200,
      height: 675,
    },
  ]),
}));

vi.mock("@/lib/genoma/genoma-logo-crop-server", () => ({
  cropLogoFromPdfPage: vi.fn(async () => ({
    buffer: mockCropped,
    width: 180,
    height: 72,
  })),
  pageTupleToLogoSourceBbox: (tuple: readonly [number, number, number, number]) => ({
    x: tuple[0],
    y: tuple[1],
    width: tuple[2] - tuple[0],
    height: tuple[3] - tuple[1],
  }),
}));

vi.mock("@/lib/genoma/ingest/upload-genoma-file", () => ({
  uploadGenomaIngestFile: vi.fn(async () => ({
    url: "https://cdn.example/logo-adjusted.png",
    fileId: "file-123",
  })),
}));

import { GET as getPage } from "./page/route";
import { POST as postCrop } from "./crop/route";

describe("/api/spaces/genoma/logo-adjust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET page returns raster + bbox for valid params", async () => {
    const url = new URL("http://localhost/api/spaces/genoma/logo-adjust/page");
    url.searchParams.set("contentSha256", "abc123sha");
    url.searchParams.set("pageNumber", "1");
    url.searchParams.set("bboxPage", JSON.stringify([0.05, 0.04, 0.21, 0.11]));

    const res = await getPage(new NextRequest(url));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      imageBase64: string;
      width: number;
      height: number;
      bboxPage: number[];
    };
    expect(body.width).toBe(1200);
    expect(body.bboxPage).toEqual([0.05, 0.04, 0.21, 0.11]);
    expect(body.imageBase64).toBe(mockPng.toString("base64"));
  });

  it("GET page rejects missing fields", async () => {
    const res = await getPage(new NextRequest("http://localhost/api/spaces/genoma/logo-adjust/page"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("missing_fields");
  });

  it("POST crop returns adjusted logo", async () => {
    const res = await postCrop(
      new Request("http://localhost/api/spaces/genoma/logo-adjust/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentSha256: "abc123sha",
          pageNumber: 1,
          bboxPage: [0.05, 0.04, 0.21, 0.11],
          docName: "Investor Deck V1.pdf",
          previousLogo: {
            assetId: "old",
            format: "png",
            width: 100,
            height: 40,
            background: "transparent",
            variants: [],
            totalDocPages: 16,
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logo: { previewUrl: string; detectionMethod: string; sourcePageNumber: number };
    };
    expect(body.logo.previewUrl).toContain("logo-adjusted");
    expect(body.logo.detectionMethod).toBe("adjusted");
    expect(body.logo.sourcePageNumber).toBe(1);
  });

  it("POST crop rejects invalid bbox", async () => {
    const res = await postCrop(
      new Request("http://localhost/api/spaces/genoma/logo-adjust/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentSha256: "abc123sha",
          pageNumber: 1,
          bboxPage: [1, 1, 1, 1],
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_bbox");
  });
});
