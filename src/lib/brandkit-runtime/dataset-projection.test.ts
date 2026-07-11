import { describe, expect, it } from "vitest";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import { createValidatedMeta, patchMeta } from "@/lib/brandkit-runtime/interpretation";
import { emptyBrandKitBoardMeta } from "@/lib/brandkit-runtime/interpretation";
import {
  BRANDKIT_DATASET_FIELD_IDS,
  buildBrandKitDatasetProjection,
} from "@/lib/brandkit-runtime/dataset-projection";

describe("T-A2 — buildBrandKitDatasetProjection", () => {
  it("incluye status y sourceId por constante desde sidecar", () => {
    const assets = defaultProjectAssets();
    assets.brand.colorPrimary = "#AABBCC";
    assets.knowledge.corporateContext = "Marca premium";

    let boardMeta = emptyBrandKitBoardMeta();
    boardMeta = patchMeta(boardMeta, "palette.colorPrimary", createValidatedMeta("doc-1", "manual"));
    boardMeta = patchMeta(boardMeta, "messages.tagline", {
      ...createValidatedMeta("doc-2"),
      status: "proposed",
      confidence: 0.8,
      evidence: [{ sourceId: "pdf-brand", kind: "pdf-llm", confidence: 0.8, extractedAt: "2026-01-01T00:00:00.000Z" }],
    });

    const projection = buildBrandKitDatasetProjection(assets, boardMeta, "brain-a2");

    const primary = projection.constants.find(
      (c) => c.fieldId === BRANDKIT_DATASET_FIELD_IDS.colorPrimary,
    );
    expect(primary?.meta.status).toBe("validated");
    expect(primary?.meta.sourceId).toBe("doc-1");
    expect(primary?.meta.elementKey).toBe("palette.colorPrimary");

    const context = projection.constants.find((c) => c.fieldId === BRANDKIT_DATASET_FIELD_IDS.context);
    expect(context?.meta.status).toBe("proposed");
    expect(context?.meta.sourceId).toBe("pdf-brand");

    expect(projection.rowMetaSidecar.constants[primary!.constantId]?.status).toBe("validated");
  });

  it("proyecta listas con metadata sidecar", () => {
    const assets = defaultProjectAssets();
    assets.strategy.approvedPhrases = ["Hecho para durar"];

    const projection = buildBrandKitDatasetProjection(assets, undefined, "brain-a2");
    expect(projection.lists.messages.length).toBeGreaterThan(0);
    const row = projection.lists.messages[0]!;
    expect(row.message).toBe("Hecho para durar");
    expect(row.meta.elementKey).toMatch(/^messages\.key\./);
    expect(projection.rowMetaSidecar.lists.messages[row.rowId]).toBeDefined();
  });
});
