import { describe, expect, it } from "vitest";
import {
  getNodeOrchestrationDeclaration,
  isOrchestrableNodeType,
} from "./populate-declaration";

describe("populate-declaration", () => {
  it("reads Image Creation declaration from the registry (explicit)", () => {
    const decl = getNodeOrchestrationDeclaration("nanoBanana");
    expect(decl.orchestrable).toBe(true);
    expect(decl.promptDataKey).toBe("promptText");
    expect(decl.textInputs.map((i) => i.inputId)).toEqual(["prompt"]);
    expect(decl.imageInputs.map((i) => i.inputId)).toEqual([
      "image",
      "image2",
      "image3",
      "image4",
    ]);
  });

  it("derives orchestrable inputs from handle types when no explicit declaration", () => {
    // imageCreationAdvanced has no `orchestration`; derive from inputs (image + prompt).
    const decl = getNodeOrchestrationDeclaration("imageCreationAdvanced");
    expect(decl.orchestrable).toBe(true);
    expect(decl.textInputs.map((i) => i.inputId)).toContain("prompt");
    expect(decl.imageInputs.map((i) => i.inputId)).toContain("image");
    // no explicit promptDataKey for derived declarations
    expect(decl.promptDataKey).toBeUndefined();
  });

  it("returns non-orchestrable for unknown or io-only nodes", () => {
    expect(isOrchestrableNodeType(undefined)).toBe(false);
    expect(isOrchestrableNodeType("does-not-exist")).toBe(false);
    // spaceInput has no orchestrable inputs
    expect(isOrchestrableNodeType("spaceInput")).toBe(false);
  });
});
