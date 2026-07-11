import type { BrandKitDocument } from "./brand-kit-types";

export function slotValue<T>(doc: BrandKitDocument, slotId: keyof BrandKitDocument["slots"]): T | undefined {
  const slot = doc.slots[slotId];
  if (slot?.status !== "resolved" || slot.value === undefined) return undefined;
  return slot.value as T;
}
