import type { SlotId } from "@/lib/brandkit/brand-kit-types";

/** Desplaza el board hasta el tile del bloque indicado. */
export function scrollToBrandKitBoardSlot(slotId: SlotId): void {
  const el = document.querySelector(`[data-brandkit-slot="${slotId}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}
