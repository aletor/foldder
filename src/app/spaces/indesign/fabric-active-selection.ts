import type { FabricObject } from "fabric";

/**
 * Fabric 6: `object.type` es el nombre de clase en minúsculas (`activeselection`), no `ActiveSelection`.
 * ActiveSelection expone `multiSelectionStacking`; Group normal no.
 * @see fabric/src/util/typeAssertions.ts `isActiveSelection`
 */
export function isFabricActiveSelection(o: FabricObject | null | undefined): boolean {
  return !!o && typeof o === "object" && "multiSelectionStacking" in o;
}
