import type { Canvas as FabricCanvas } from "fabric";
import { Point, util } from "fabric";

/**
 * Convierte un punto en coordenadas de escena del lienzo a píxeles CSS relativos a `areaEl`
 * (el contenedor `position: relative` que envuelve el canvas), respetando viewportTransform.
 */
export function scenePointToAreaPixels(
  canvas: FabricCanvas,
  areaEl: HTMLElement,
  sceneX: number,
  sceneY: number,
): { left: number; top: number } {
  const vpt = canvas.viewportTransform;
  if (!vpt) return { left: 0, top: 0 };
  const upper = canvas.upperCanvasEl;
  const areaRect = areaEl.getBoundingClientRect();
  const upperRect = upper.getBoundingClientRect();
  const p = util.transformPoint(new Point(sceneX, sceneY), vpt);
  const gw = canvas.getWidth();
  const gh = canvas.getHeight();
  const scaleX = upperRect.width / gw;
  const scaleY = upperRect.height / gh;
  return {
    left: upperRect.left - areaRect.left + p.x * scaleX,
    top: upperRect.top - areaRect.top + p.y * scaleY,
  };
}
