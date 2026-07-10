import type { SlotId } from "@/lib/genoma/genoma-types";

/** Desplaza el board hasta el tile del bloque indicado. */
export function scrollToGenomaBoardSlot(slotId: SlotId): void {
  const el = document.querySelector(`[data-genoma-slot="${slotId}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}
