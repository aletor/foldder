import { describe, expect, it, vi } from "vitest";
import type { PageVisionPassRunAudit } from "@/lib/genoma/ingest/page-vision-pass-runner";
import type { GoldenDocument } from "@/lib/genoma/logo-lab/golden/types";
import {
  computeDocumentDetectionRecall,
  listVisionLogoDetections,
} from "@/lib/genoma/logo-lab/golden/benchmark";
import { bboxIoU } from "@/lib/genoma/logo-lab/golden/coords";

vi.mock("@/lib/genoma/logo-lab/golden/coords", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/genoma/logo-lab/golden/coords")>();
  return {
    ...actual,
    frameBboxToPageBbox: vi.fn(
      async (_pdf: Buffer, _page: number, bbox: readonly [number, number, number, number]) =>
        [bbox[0], bbox[1], bbox[2], bbox[3]] as [number, number, number, number],
    ),
  };
});

function makeAudit(pages: PageVisionPassRunAudit["pages"]): PageVisionPassRunAudit {
  return {
    version: "test",
    dpi: 96,
    contentSha256: "test",
    fileName: "test.pdf",
    totalPages: 10,
    selectedPages: pages.map((p) => p.pageNumber),
    pages,
    generatedAt: new Date().toISOString(),
  } as PageVisionPassRunAudit;
}

describe("detección vs selección", () => {
  it("listVisionLogoDetections incluye todas las instancias del audit, no solo el mejor logo", () => {
    const audit = makeAudit([
      {
        pageNumber: 1,
        ok: true,
        result: {
          logoInstances: [
            {
              bbox: [0.1, 0.1, 0.3, 0.3],
              variant: "horizontal",
              onBackground: "claro",
              textInLogo: "A",
              isComplete: true,
              cutEdges: [],
              confidence: 0.4,
            },
            {
              bbox: [0.5, 0.5, 0.7, 0.7],
              variant: "horizontal",
              onBackground: "claro",
              textInLogo: "B",
              isComplete: true,
              cutEdges: [],
              confidence: 0.95,
            },
          ],
          brandNameEvidence: [],
          typographyRoles: [],
          brandSurfaces: [],
          images: [],
          pageKind: "portada",
        },
      },
    ]);

    expect(listVisionLogoDetections(audit)).toHaveLength(2);
  });

  it("detection recall cuenta hit aunque el mejor logo del harvest sería otro", async () => {
    const doc: GoldenDocument = {
      id: "test",
      file: "test.pdf",
      sha256: "test",
      kind: "native",
      groundTruth: [
        {
          page: 1,
          bboxPage: [0.1, 0.1, 0.3, 0.3],
          role: "primary",
        },
      ],
    };

    const audit = makeAudit([
      {
        pageNumber: 1,
        ok: true,
        result: {
          logoInstances: [
            {
              bbox: [0.1, 0.1, 0.3, 0.3],
              variant: "horizontal",
              onBackground: "claro",
              textInLogo: "match",
              isComplete: true,
              cutEdges: [],
              confidence: 0.4,
            },
            {
              bbox: [0.8, 0.8, 0.95, 0.95],
              variant: "horizontal",
              onBackground: "claro",
              textInLogo: "harvest would pick",
              isComplete: true,
              cutEdges: [],
              confidence: 0.99,
            },
          ],
          brandNameEvidence: [],
          typographyRoles: [],
          brandSurfaces: [],
          images: [],
          pageKind: "portada",
        },
      },
    ]);

    const recall = await computeDocumentDetectionRecall(doc, audit, Buffer.from("pdf"));
    expect(recall.hits).toBe(1);
    expect(recall.total).toBe(1);
    expect(recall.recallAt50).toBe(1);
    expect(bboxIoU([0.8, 0.8, 0.95, 0.95], [0.1, 0.1, 0.3, 0.3])).toBeLessThan(0.1);
  });
});

describe("vision cache envelope", () => {
  it("parsea audits legacy raw con contentSha256", async () => {
    const { readVisionCacheEnvelope } = await import("@/lib/genoma/logo-lab/golden/vision-cache");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { visionCacheDir } = await import("@/lib/genoma/logo-lab/golden/paths");
    const sha = "abc123def456abc123def456abc123def456abc123def456abc123def456ab12";
    const dir = visionCacheDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sha}__2026-07-07-nivel1-slim-7.audit.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({
        contentSha256: sha,
        pages: [],
        selectedPages: [],
        totalPages: 1,
        version: "test",
        dpi: 96,
        fileName: "x.pdf",
        generatedAt: new Date().toISOString(),
      }),
    );
    const env = readVisionCacheEnvelope(sha);
    expect(env?.source).toBe("legacy_raw");
    expect(env?.contentSha256).toBe(sha);
    fs.unlinkSync(file);
  });
});
