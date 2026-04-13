import type {
  ContentAlignment,
  FrameImageContent,
  ImageFittingMode,
} from "./image-frame-model";
import { DEFAULT_FITTING } from "./image-frame-model";

export type LayoutBox = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

const EPS = 1e-6;

export function computeFittingLayout(
  frameW: number,
  frameH: number,
  iw: number,
  ih: number,
  mode: ImageFittingMode,
): LayoutBox {
  const fw = Math.max(EPS, frameW);
  const fh = Math.max(EPS, frameH);
  const niw = Math.max(EPS, iw);
  const nih = Math.max(EPS, ih);

  switch (mode) {
    case "fit-proportional": {
      const s = Math.min(fw / niw, fh / nih);
      const w = niw * s;
      const h = nih * s;
      return {
        scaleX: s,
        scaleY: s,
        offsetX: (fw - w) / 2,
        offsetY: (fh - h) / 2,
      };
    }
    case "fill-proportional": {
      const s = Math.max(fw / niw, fh / nih);
      const w = niw * s;
      const h = nih * s;
      return {
        scaleX: s,
        scaleY: s,
        offsetX: (fw - w) / 2,
        offsetY: (fh - h) / 2,
      };
    }
    case "fit-stretch":
    case "fill-stretch":
      return {
        scaleX: fw / niw,
        scaleY: fh / nih,
        offsetX: 0,
        offsetY: 0,
      };
    case "center-content":
      return {
        scaleX: 1,
        scaleY: 1,
        offsetX: (fw - niw) / 2,
        offsetY: (fh - nih) / 2,
      };
    case "frame-to-content":
      return {
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
      };
    default:
      return computeFittingLayout(fw, fh, niw, nih, DEFAULT_FITTING);
  }
}

/** Tamaño de marco para modo "ajustar caja al contenido" (sin deformar). */
export function frameSizeForFrameToContent(
  iw: number,
  ih: number,
  scaleX: number,
  scaleY: number,
): { width: number; height: number } {
  return {
    width: Math.max(EPS, iw * scaleX),
    height: Math.max(EPS, ih * scaleY),
  };
}

export function alignmentToOffsets(
  frameW: number,
  frameH: number,
  iw: number,
  ih: number,
  scaleX: number,
  scaleY: number,
  align: ContentAlignment,
): { offsetX: number; offsetY: number } {
  const fw = Math.max(EPS, frameW);
  const fh = Math.max(EPS, frameH);
  const w = iw * scaleX;
  const h = ih * scaleY;

  let offsetX = 0;
  let offsetY = 0;
  switch (align) {
    case "top-left":
      offsetX = 0;
      offsetY = 0;
      break;
    case "top-center":
      offsetX = (fw - w) / 2;
      offsetY = 0;
      break;
    case "top-right":
      offsetX = fw - w;
      offsetY = 0;
      break;
    case "middle-left":
      offsetX = 0;
      offsetY = (fh - h) / 2;
      break;
    case "center":
      offsetX = (fw - w) / 2;
      offsetY = (fh - h) / 2;
      break;
    case "middle-right":
      offsetX = fw - w;
      offsetY = (fh - h) / 2;
      break;
    case "bottom-left":
      offsetX = 0;
      offsetY = fh - h;
      break;
    case "bottom-center":
      offsetX = (fw - w) / 2;
      offsetY = fh - h;
      break;
    case "bottom-right":
      offsetX = fw - w;
      offsetY = fh - h;
      break;
    default:
      offsetX = (fw - w) / 2;
      offsetY = (fh - h) / 2;
  }
  return { offsetX, offsetY };
}

/** Lee escala y offset desde un FabricImage (origen left/top). */
export function readLayoutFromFabricImage(
  frameLeft: number,
  frameTop: number,
  imgLeft: number,
  imgTop: number,
  scaleX: number,
  scaleY: number,
): { offsetX: number; offsetY: number; scaleX: number; scaleY: number } {
  return {
    offsetX: imgLeft - frameLeft,
    offsetY: imgTop - frameTop,
    scaleX,
    scaleY,
  };
}

export function buildFrameImageContent(
  partial: Omit<FrameImageContent, "id"> & { id?: string },
  idGen: () => string,
): FrameImageContent {
  return {
    id: partial.id ?? idGen(),
    src: partial.src,
    originalWidth: partial.originalWidth,
    originalHeight: partial.originalHeight,
    scaleX: partial.scaleX,
    scaleY: partial.scaleY,
    offsetX: partial.offsetX,
    offsetY: partial.offsetY,
    fittingMode: partial.fittingMode,
  };
}
