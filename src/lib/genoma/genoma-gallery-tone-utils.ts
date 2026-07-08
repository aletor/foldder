import type { GenomaDocument } from "./genoma-types";

export function slotValue<T>(doc: GenomaDocument, slotId: keyof GenomaDocument["slots"]): T | undefined {
  const slot = doc.slots[slotId];
  if (slot?.status !== "resolved" || slot.value === undefined) return undefined;
  return slot.value as T;
}
