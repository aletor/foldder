import { describe, expect, it } from "vitest";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import { normalizeVisualDnaSlots } from "@/lib/brain/visual-dna-slot/normalize";
import {
  resolveBrandKitDatasetColors,
  resolveBrandKitDatasetVisualSlotUrl,
  toPlainBrandText,
} from "./brandkit-dataset-projections";
import { syncBrandKitAssetsToDataset } from "./brandkit-dataset-sync";
import { createDataset } from "@/app/spaces/dataset/dataset-logic";

describe("brandkit-dataset-projections", () => {
  it("convierte contexto markdown a texto plano", () => {
    const raw = `### Document: Brand book
**Empresa:** Moda sostenible
**Tono:** Cercano y directo`;
    expect(toPlainBrandText(raw)).toContain("Empresa: Moda sostenible");
    expect(toPlainBrandText(raw)).not.toContain("**");
    expect(toPlainBrandText(raw)).not.toContain("###");
  });

  it("rellena colores del dataset desde análisis visual cuando brand está vacío", () => {
    const assets = defaultProjectAssets();
    assets.strategy.visualReferenceAnalysis = {
      analyses: [
        {
          sourceAssetId: "doc1",
          sourceKind: "knowledge_document",
          analysisStatus: "analyzed",
          colorPalette: { dominant: ["#AABBCC"], secondary: ["#112233", "#445566"] },
        },
      ],
    };
    assets.knowledge.documents = [
      {
        id: "doc1",
        name: "Ref",
        mime: "image/png",
        scope: "core",
        brainSourceScope: "brand",
        size: 1,
        type: "image",
        format: "image",
        status: "Analizado",
        uploadedAt: new Date().toISOString(),
      },
    ];

    const colors = resolveBrandKitDatasetColors(assets);
    expect(colors.primary).toBe("#AABBCC");
    expect(colors.secondary).toBe("#112233");
    expect(colors.accent).toBe("#445566");
  });

  it("proyecta mosaico visual DNA al slot de entorno", () => {
    const assets = defaultProjectAssets();
    assets.strategy.visualDnaSlots = normalizeVisualDnaSlots([
      {
        id: "slot1",
        label: "Ref 1",
        status: "ready",
        createdAt: new Date().toISOString(),
        palette: { dominantColors: [] },
        hero: {},
        people: {},
        objects: {},
        environments: {},
        textures: {},
        generalStyle: {},
        mosaic: { imageUrl: "https://cdn.example.com/mosaic.png" },
        sourceImageUrl: "https://cdn.example.com/source.png",
      },
    ]);

    expect(resolveBrandKitDatasetVisualSlotUrl(assets, "environment")).toBe(
      "https://cdn.example.com/mosaic.png",
    );
  });

  it("syncBrandKitAssetsToDataset incluye colores detectados y contexto plano", () => {
    const assets = defaultProjectAssets();
    assets.knowledge.corporateContext = "### Document: X\n**Empresa:** Acme";
    assets.strategy.visualReferenceAnalysis = {
      analyses: [
        {
          sourceAssetId: "doc1",
          sourceKind: "knowledge_document",
          analysisStatus: "analyzed",
          colorPalette: { dominant: ["#FF00AA"], secondary: [] },
        },
      ],
    };
    assets.knowledge.documents = [
      {
        id: "doc1",
        name: "Ref",
        mime: "image/png",
        scope: "core",
        brainSourceScope: "brand",
        size: 1,
        type: "image",
        format: "image",
        status: "Analizado",
        uploadedAt: new Date().toISOString(),
      },
    ];

    const { dataset } = syncBrandKitAssetsToDataset(createDataset("T", "local", "p1"), "brain1", assets);
    const ctx = dataset.constants.values["bk:brain1:context"];
    expect(ctx?.type).toBe("text");
    if (ctx?.type === "text") {
      expect(ctx.value).toContain("Empresa: Acme");
      expect(ctx.value).not.toContain("**");
    }
    const primary = dataset.constants.values["bk:brain1:color_primary"];
    expect(primary?.type).toBe("color");
    if (primary?.type === "color") expect(primary.value).toBe("#FF00AA");
  });
});
