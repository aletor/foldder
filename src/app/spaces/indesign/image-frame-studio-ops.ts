import type { Canvas as FabricCanvas, FabricObject } from "fabric";
import { Rect } from "fabric";
import type {
  ContentAlignment,
  FrameImageContent,
  ImageFrameRecord,
  ImageFittingMode,
} from "./image-frame-model";
import { getImageFrameRecord, patchImageFrameRecord } from "./image-frame-model";
import {
  alignmentToOffsets,
  computeFittingLayout,
} from "./image-frame-layout";
import {
  applyContentToFabricImage,
  frameInnerSize,
  updateImageClipFromFrame,
} from "./image-frame-fabric";

function findFrame(canvas: FabricCanvas, frameUid: string): FabricObject | undefined {
  return canvas
    .getObjects()
    .find((o) => o.get("indesignUid") === frameUid && o.get("indesignType") === "frame");
}

function findFrameImage(canvas: FabricCanvas, frameUid: string): FabricObject | undefined {
  return canvas
    .getObjects()
    .find((o) => o.get("indesignType") === "frameImage" && o.get("frameUid") === frameUid);
}

export function applyFittingModeToImageFrame(
  canvas: FabricCanvas,
  frameUid: string,
  mode: ImageFittingMode,
  records: ImageFrameRecord[],
): ImageFrameRecord[] {
  const frame = findFrame(canvas, frameUid);
  const img = findFrameImage(canvas, frameUid);
  const rec = getImageFrameRecord(records, frameUid);
  const ic = rec?.imageContent;
  if (!frame || !img || !ic) return records;

  const { fw, fh } = frameInnerSize(frame);
  const layout = computeFittingLayout(fw, fh, ic.originalWidth, ic.originalHeight, mode);
  const nextContent: FrameImageContent = {
    ...ic,
    scaleX: layout.scaleX,
    scaleY: layout.scaleY,
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
    fittingMode: mode,
  };
  applyContentToFabricImage(frame, img, nextContent);
  updateImageClipFromFrame(Rect, frame, img);
  canvas.requestRenderAll();
  return patchImageFrameRecord(records, frameUid, { imageContent: nextContent });
}

export function applyContentAlignmentToImageFrame(
  canvas: FabricCanvas,
  frameUid: string,
  align: ContentAlignment,
  records: ImageFrameRecord[],
): ImageFrameRecord[] {
  const frame = findFrame(canvas, frameUid);
  const img = findFrameImage(canvas, frameUid);
  const rec = getImageFrameRecord(records, frameUid);
  const ic = rec?.imageContent;
  if (!frame || !img || !ic) return records;

  const { fw, fh } = frameInnerSize(frame);
  const { offsetX, offsetY } = alignmentToOffsets(
    fw,
    fh,
    ic.originalWidth,
    ic.originalHeight,
    ic.scaleX,
    ic.scaleY,
    align,
  );
  const nextContent: FrameImageContent = { ...ic, offsetX, offsetY };
  applyContentToFabricImage(frame, img, nextContent);
  updateImageClipFromFrame(Rect, frame, img);
  canvas.requestRenderAll();
  return patchImageFrameRecord(records, frameUid, {
    contentAlignment: align,
    imageContent: nextContent,
  });
}

export function setImageFrameAutoFit(
  canvas: FabricCanvas,
  frameUid: string,
  autoFit: boolean,
  records: ImageFrameRecord[],
): ImageFrameRecord[] {
  const frame = findFrame(canvas, frameUid);
  const img = findFrameImage(canvas, frameUid);
  const rec = getImageFrameRecord(records, frameUid);
  const ic = rec?.imageContent;
  if (!frame || !img || !ic) {
    return patchImageFrameRecord(records, frameUid, { autoFit });
  }
  if (autoFit) {
    const { fw, fh } = frameInnerSize(frame);
    const mode =
      ic.fittingMode === "frame-to-content" ? "fill-proportional" : ic.fittingMode;
    const layout = computeFittingLayout(fw, fh, ic.originalWidth, ic.originalHeight, mode);
    const nextContent: FrameImageContent = {
      ...ic,
      scaleX: layout.scaleX,
      scaleY: layout.scaleY,
      offsetX: layout.offsetX,
      offsetY: layout.offsetY,
    };
    applyContentToFabricImage(frame, img, nextContent);
    updateImageClipFromFrame(Rect, frame, img);
    canvas.requestRenderAll();
    return patchImageFrameRecord(records, frameUid, {
      autoFit: true,
      imageContent: nextContent,
    });
  }
  return patchImageFrameRecord(records, frameUid, { autoFit: false });
}

export function clearImageFrameContent(
  canvas: FabricCanvas,
  frameUid: string,
  records: ImageFrameRecord[],
): ImageFrameRecord[] {
  const frame = findFrame(canvas, frameUid);
  const img = findFrameImage(canvas, frameUid);
  if (img) canvas.remove(img);
  if (frame) {
    frame.set({
      hasImage: false,
      fill: "rgba(0,0,0,0.04)",
    });
    frame.setCoords();
  }
  canvas.requestRenderAll();
  return patchImageFrameRecord(records, frameUid, { imageContent: null });
}
