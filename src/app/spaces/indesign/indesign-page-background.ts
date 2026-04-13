import type { Canvas as FabricCanvas, FabricObject } from "fabric";
import { INDESIGN_PAD } from "./page-formats";

/** Props que Fabric 6 debe incluir en `toObject()` para que el fondo no se duplique al recargar. */
export const INDESIGN_PAGE_BG_SERIAL_PROPS = ["name"] as const;

function fillLooksWhite(fill: unknown): boolean {
  if (typeof fill !== "string") return false;
  const s = fill.toLowerCase().replace(/\s/g, "");
  return (
    s === "#ffffff" ||
    s === "#fff" ||
    s === "white" ||
    s === "rgb(255,255,255)" ||
    s === "rgba(255,255,255,1)" ||
    s === "rgba(255,255,255,1.0)"
  );
}

/**
 * Rectángulos blancos en la esquina del pliego sin `indesignType` (p. ej. fondos guardados sin `name` en JSON).
 * Si no los quitamos antes de añadir `indesignPageBg`, quedan dos “páginas” y el huérfano puede ser seleccionable.
 */
function isOrphanPageWhiteRect(o: FabricObject): boolean {
  if (o.get("indesignType")) return false;
  if (o.type !== "Rect") return false;
  if (!fillLooksWhite(o.get("fill"))) return false;
  if (o.get("stroke")) return false;
  const left = o.left ?? 0;
  const top = o.top ?? 0;
  if (Math.abs(left - INDESIGN_PAD) > 1 || Math.abs(top - INDESIGN_PAD) > 1) return false;
  return true;
}

/**
 * Un único rectángulo `indesignPageBg` alineado al pliego actual.
 */
export function syncIndesignPageBackground(
  canvas: FabricCanvas,
  Rect: typeof import("fabric").Rect,
  pageWidth: number,
  pageHeight: number,
): void {
  const orphans = canvas.getObjects().filter(isOrphanPageWhiteRect);
  for (const o of orphans) {
    canvas.remove(o);
  }

  const named = canvas.getObjects().filter((o) => o.get("name") === "indesignPageBg");
  for (let i = 1; i < named.length; i++) {
    canvas.remove(named[i]!);
  }

  const pw = Math.max(24, pageWidth);
  const ph = Math.max(24, pageHeight);
  const keep = canvas.getObjects().find((o) => o.get("name") === "indesignPageBg");
  if (keep) {
    keep.set({
      left: INDESIGN_PAD,
      top: INDESIGN_PAD,
      width: pw,
      height: ph,
      scaleX: 1,
      scaleY: 1,
      fill: "#ffffff",
      selectable: false,
      evented: false,
      name: "indesignPageBg",
    });
    keep.setCoords();
  } else {
    const pageBg = new Rect({
      left: INDESIGN_PAD,
      top: INDESIGN_PAD,
      width: pw,
      height: ph,
      fill: "#ffffff",
      selectable: false,
      evented: false,
      name: "indesignPageBg",
    });
    canvas.add(pageBg);
  }
  const bg = canvas.getObjects().find((o) => o.get("name") === "indesignPageBg");
  if (bg) canvas.sendObjectToBack(bg);
}
