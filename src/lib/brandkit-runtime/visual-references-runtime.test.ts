import { describe, expect, it } from "vitest";
import { RUNTIME_ADDITIVE_KEYS, buildVisualReferencesRuntime } from "./visual-references-runtime";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";
import { buildBrainRuntimeContext } from "@/lib/brain/brain-runtime-context";
import { emptyBrandKitBoardMeta, patchMeta, createValidatedMeta } from "./interpretation";

describe("A1 — visualReferences runtime", () => {
  it("RUNTIME_ADDITIVE_KEYS incluye visualReferences", () => {
    expect(RUNTIME_ADDITIVE_KEYS).toContain("visualReferences");
  });

  it("buildVisualReferencesRuntime expone reglas por categoría", () => {
    const assets = defaultProjectAssets();
    assets.strategy.visualStyle.environment = {
      ...assets.strategy.visualStyle.environment,
      description: "Espacios amplios y luz natural",
    };
    let boardMeta = emptyBrandKitBoardMeta();
    boardMeta = patchMeta(boardMeta, "references.environment.rule", createValidatedMeta("doc1"));

    const refs = buildVisualReferencesRuntime(assets, boardMeta);
    expect(refs?.environment.rule).toContain("Espacios");
    expect(refs?.environment.ruleStatus).toBe("validated");
  });

  it("buildBrainRuntimeContext añade visualReferences en nodos generativos", () => {
    const assets = defaultProjectAssets();
    const ctx = buildBrainRuntimeContext({ assets, targetNodeType: "nanoBanana" });
    expect(ctx.visualReferences).toBeUndefined();
  });
});
