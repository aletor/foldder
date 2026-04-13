import type { FabricObject } from "fabric";
import type { Rect } from "fabric";
import type { FrameImageContent } from "./image-frame-model";

export function frameInnerSize(frame: FabricObject): { fw: number; fh: number } {
  const fw = (frame.width ?? 0) * (frame.scaleX ?? 1);
  const fh = (frame.height ?? 0) * (frame.scaleY ?? 1);
  return { fw: Math.max(1, fw), fh: Math.max(1, fh) };
}

export function frameOrigin(frame: FabricObject): { fl: number; ft: number } {
  return { fl: frame.left ?? 0, ft: frame.top ?? 0 };
}

/** Aplica posición y escala del contenido al FabricImage (origen left/top). */
export function applyContentToFabricImage(
  frame: FabricObject,
  img: FabricObject,
  c: FrameImageContent,
): void {
  const { fl, ft } = frameOrigin(frame);
  img.set({
    left: fl + c.offsetX,
    top: ft + c.offsetY,
    scaleX: c.scaleX,
    scaleY: c.scaleY,
    originX: "left",
    originY: "top",
  });
  img.setCoords();
}

/** Recorta la imagen al rectángulo del marco (coords absolutas). */
export function updateImageClipFromFrame(
  RectCtor: typeof Rect,
  frame: FabricObject,
  img: FabricObject,
): void {
  const { fw, fh } = frameInnerSize(frame);
  const { fl, ft } = frameOrigin(frame);
  const rx = (frame as FabricObject & { rx?: number }).rx ?? 0;
  const ry = (frame as FabricObject & { ry?: number }).ry ?? rx;
  const clip = new RectCtor({
    left: fl,
    top: ft,
    width: fw,
    height: fh,
    rx: rx > 0 ? rx : 0,
    ry: ry > 0 ? ry : 0,
    absolutePositioned: true,
  });
  img.clipPath = clip;
}

/** Lee el contenido actual desde Fabric (tras mover/escalar con el ratón). */
export function fabricImageToContent(
  frame: FabricObject,
  img: FabricObject,
  src: string,
  iw: number,
  ih: number,
  fittingMode: FrameImageContent["fittingMode"],
): FrameImageContent {
  const { fl, ft } = frameOrigin(frame);
  const id = (img.get("indesignImageContentId") as string | undefined) ?? `imgc_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    src,
    originalWidth: iw,
    originalHeight: ih,
    scaleX: img.scaleX ?? 1,
    scaleY: img.scaleY ?? 1,
    offsetX: (img.left ?? 0) - fl,
    offsetY: (img.top ?? 0) - ft,
    fittingMode,
  };
}
