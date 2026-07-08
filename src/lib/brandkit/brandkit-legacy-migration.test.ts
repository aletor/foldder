import { describe, expect, it } from "vitest";
import { createDataset } from "@/app/spaces/dataset/dataset-logic";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { LEGACY_BRANDKIT_RUNTIME_FIXTURE } from "./fixtures/legacy-brandkit-assets.fixture";
import { brandKitConstantId, mergeBrainBrandIntoConstants } from "@/app/spaces/brandkit/brandkit-logic";
import { brandKitDatasetConstantId, BRANDKIT_DATASET_FIELD_IDS } from "@/app/spaces/brandkit/brandkit-dataset-schema";
import {
  detectLegacyBrandKitMigrationTarget,
  filterBrandKitConstantsForPicker,
  isLegacyBrandKitConstantId,
  migrateLegacyBrandKitDataset,
  remapLegacyDesignerBindingFieldId,
  shouldUseLegacyBrainBrandMerge,
} from "./brandkit-legacy-migration";

describe("brandkit-legacy-migration", () => {
  it("detecta constantes legacy del puente de 4 campos", () => {
    expect(isLegacyBrandKitConstantId("bk:brain1:primaryColor")).toBe(true);
    expect(isLegacyBrandKitConstantId("bk:brain1:color_primary")).toBe(false);
  });

  it("migra legacy → bloque moderno y elimina constantes antiguas", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const legacyMerged = mergeBrainBrandIntoConstants(createDataset("T", "local", "p1"), "brain1", assets.brand)!;
    expect(detectLegacyBrandKitMigrationTarget(legacyMerged).needsMigration).toBe(true);

    const migrated = migrateLegacyBrandKitDataset(legacyMerged, "brain1", assets);
    expect(migrated.removedLegacyIds.length).toBeGreaterThan(0);
    expect(migrated.link.brainNodeId).toBe("brain1");
    expect(
      migrated.dataset.constants.values[
        brandKitDatasetConstantId("brain1", BRANDKIT_DATASET_FIELD_IDS.colorPrimary)
      ],
    ).toEqual({ type: "color", value: "#112233" });
    expect(detectLegacyBrandKitMigrationTarget(migrated.dataset, migrated.link).needsMigration).toBe(false);
  });

  it("remap de bindings legacy a ids modernos", () => {
    expect(remapLegacyDesignerBindingFieldId("primaryColor")).toBe("color_primary");
    expect(remapLegacyDesignerBindingFieldId("logo")).toBe("logo_positive");
  });

  it("filterBrandKitConstantsForPicker oculta legacy si hay bloque moderno", () => {
    const fields = [
      { id: brandKitConstantId("brain1", "primaryColor"), type: "color" },
      { id: brandKitDatasetConstantId("brain1", BRANDKIT_DATASET_FIELD_IDS.context), type: "text" },
      { id: brandKitDatasetConstantId("brain1", BRANDKIT_DATASET_FIELD_IDS.colorPrimary), type: "color" },
    ];
    const filtered = filterBrandKitConstantsForPicker(fields, "brain1");
    expect(filtered.some((field) => field.id.includes("primaryColor"))).toBe(false);
    expect(filtered.some((field) => field.id.includes("context"))).toBe(true);
  });

  it("shouldUseLegacyBrainBrandMerge es false con brandKitLink moderno", () => {
    const assets = normalizeProjectAssets(LEGACY_BRANDKIT_RUNTIME_FIXTURE);
    const migrated = migrateLegacyBrandKitDataset(createDataset("T", "local", "p1"), "brain1", assets);
    expect(
      shouldUseLegacyBrainBrandMerge({
        brainNodeId: "brain1",
        connectedDataset: migrated.dataset,
        brandKitLink: migrated.link,
      }),
    ).toBe(false);
  });
});
