import { describe, expect, it } from "vitest";
import { isEditMode, isPresentationMode } from "./brand-kit-studio-mode";

describe("brand-kit-studio-mode", () => {
  it("defaults to presentation semantics", () => {
    expect(isPresentationMode("presentation")).toBe(true);
    expect(isEditMode("presentation")).toBe(false);
  });

  it("identifies edit mode", () => {
    expect(isEditMode("edit")).toBe(true);
    expect(isPresentationMode("edit")).toBe(false);
  });
});
