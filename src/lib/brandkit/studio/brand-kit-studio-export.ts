import type { BrandKitStudioMode } from "./brand-kit-studio-mode";
import type { BrandKitStyleGuideExportMode } from "../projection/style-guide-export-types";

export function resolveStudioDefaultExportMode(studioMode: BrandKitStudioMode): BrandKitStyleGuideExportMode {
  return studioMode === "presentation" ? "cliente" : "operativo";
}

export function studioHeaderExportIsMenu(studioMode: BrandKitStudioMode): boolean {
  return studioMode === "edit";
}

export function studioSidebarShowsTechnicalExport(studioMode: BrandKitStudioMode): boolean {
  return studioMode === "edit";
}

export function shouldPreflightStyleGuideExport(exportMode: BrandKitStyleGuideExportMode): boolean {
  return exportMode === "cliente";
}
