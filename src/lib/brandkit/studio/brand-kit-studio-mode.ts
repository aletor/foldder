export type BrandKitStudioMode = "presentation" | "edit";

export type BrandKitInspectorTab = "synthesis" | "attributes" | "evidence" | "history";

/** @deprecated use synthesis — kept for migration of callers */
export type BrandKitInspectorTabLegacy = BrandKitInspectorTab | "content";

export type BrandKitBoardSelectionId = import("@/lib/brandkit/brand-kit-types").SlotId | "applications";

export function isPresentationMode(mode: BrandKitStudioMode): boolean {
  return mode === "presentation";
}

export function isEditMode(mode: BrandKitStudioMode): boolean {
  return mode === "edit";
}
