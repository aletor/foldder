import { describe, expect, it } from "vitest";
import {
  resolveStudioDefaultExportMode,
  shouldPreflightStyleGuideExport,
  studioHeaderExportIsMenu,
  studioSidebarShowsTechnicalExport,
} from "./brand-kit-studio-export";

describe("brand-kit-studio-export", () => {
  it("defaults export mode by studio mode", () => {
    expect(resolveStudioDefaultExportMode("presentation")).toBe("cliente");
    expect(resolveStudioDefaultExportMode("edit")).toBe("operativo");
  });

  it("shows export menu only in edit header", () => {
    expect(studioHeaderExportIsMenu("presentation")).toBe(false);
    expect(studioHeaderExportIsMenu("edit")).toBe(true);
  });

  it("shows technical sidebar export only in edit", () => {
    expect(studioSidebarShowsTechnicalExport("presentation")).toBe(false);
    expect(studioSidebarShowsTechnicalExport("edit")).toBe(true);
  });

  it("preflights only cliente pdf export", () => {
    expect(shouldPreflightStyleGuideExport("cliente")).toBe(true);
    expect(shouldPreflightStyleGuideExport("operativo")).toBe(false);
  });
});
