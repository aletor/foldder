import type { FreehandObject } from "../FreehandStudio";
import { mapTree } from "../freehand/group-container";
import { computeFittingLayout } from "../indesign/image-frame-layout";
import type { DesignerPageState } from "./DesignerNode";
import type { DesignerImageStudioResult, DesignerImageStudioSession } from "./designer-image-studio-types";

async function probeImageSize(url: string): Promise<{ w: number; h: number }> {
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return { w: 1024, h: 1024 };
  }
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
    });
    return {
      w: Math.max(1, img.naturalWidth || 1024),
      h: Math.max(1, img.naturalHeight || 1024),
    };
  } catch {
    return { w: 1024, h: 1024 };
  }
}

/** Aplica el resultado de Image Creation a capa `image` o marco `imageFrame`. */
export function applyDesignerImageStudioResult(
  pages: DesignerPageState[],
  session: DesignerImageStudioSession,
  result: DesignerImageStudioResult,
): DesignerPageState[] {
  const nextUrl = typeof result.imageUrl === "string" ? result.imageUrl.trim() : "";
  if (!nextUrl) return pages;

  const targetKind = session.targetKind ?? "image";

  return pages.map((page) => {
    if (page.id !== session.pageId) return page;
    let changed = false;
    const objects = mapTree(page.objects ?? [], (o) => {
      if (o.id !== session.imageObjectId) return o;

      if (targetKind === "imageFrame") {
        if (o.type !== "rect" || !o.isImageFrame) return o;
        changed = true;
        const fw = Math.max(1, o.width || 200);
        const fh = Math.max(1, o.height || 200);
        // Dimensiones naturales se refinan async en el host si hace falta; aquí layout provisional.
        const iw = Math.max(1, Math.round(fw));
        const ih = Math.max(1, Math.round(fh));
        const layout = computeFittingLayout(fw, fh, iw, ih, "fill-proportional");
        const prev = o.imageFrameContent;
        return {
          ...o,
          imageFrameContent: {
            src: nextUrl,
            ...(result.s3Key
              ? { s3Key: result.s3Key, s3KeyOpt: result.s3Key }
              : prev?.s3Key
                ? { s3Key: prev.s3Key, s3KeyOpt: prev.s3KeyOpt ?? prev.s3Key }
                : {}),
            originalWidth: iw,
            originalHeight: ih,
            ...layout,
            fittingMode: "fill-proportional" as const,
            generatedByAi: true,
            generatedByAiSource: "gemini-image-generator:designer-modificar-ia",
          },
          imageFrameAutoFit: true,
        } as FreehandObject;
      }

      if (o.type !== "image") return o;
      changed = true;
      const img = o as FreehandObject & { type: "image"; src: string; imageAssetMeta?: Record<string, unknown> };
      const prevMeta = img.imageAssetMeta;
      return {
        ...img,
        src: nextUrl,
        imageAssetMeta: prevMeta
          ? {
              ...prevMeta,
              generatedByAi: true,
              generatedByAiSource: "gemini-image-generator:designer-modificar-ia",
            }
          : {
              fileName: "modificar-ia.png",
              mimeType: "image/png",
              byteSize: 0,
              pixelWidth: 0,
              pixelHeight: 0,
              generatedByAi: true,
              generatedByAiSource: "gemini-image-generator:designer-modificar-ia",
            },
      };
    });
    return changed ? { ...page, objects } : page;
  });
}

/**
 * Igual que `applyDesignerImageStudioResult`, pero con tamaño natural real para el layout del marco.
 * Pensado para el cliente tras volver de Nano.
 */
export async function applyDesignerImageStudioResultWithProbe(
  pages: DesignerPageState[],
  session: DesignerImageStudioSession,
  result: DesignerImageStudioResult,
): Promise<DesignerPageState[]> {
  const nextUrl = typeof result.imageUrl === "string" ? result.imageUrl.trim() : "";
  if (!nextUrl) return pages;
  if ((session.targetKind ?? "image") !== "imageFrame") {
    return applyDesignerImageStudioResult(pages, session, result);
  }

  const { w: iw, h: ih } = await probeImageSize(nextUrl);

  return pages.map((page) => {
    if (page.id !== session.pageId) return page;
    let changed = false;
    const objects = mapTree(page.objects ?? [], (o) => {
      if (o.id !== session.imageObjectId || o.type !== "rect" || !o.isImageFrame) return o;
      changed = true;
      const fw = Math.max(1, o.width || 200);
      const fh = Math.max(1, o.height || 200);
      const layout = computeFittingLayout(fw, fh, iw, ih, "fill-proportional");
      const prev = o.imageFrameContent;
      return {
        ...o,
        imageFrameContent: {
          src: nextUrl,
          ...(result.s3Key
            ? { s3Key: result.s3Key, s3KeyOpt: result.s3Key }
            : prev?.s3Key
              ? { s3Key: prev.s3Key, s3KeyOpt: prev.s3KeyOpt ?? prev.s3Key }
              : {}),
          originalWidth: iw,
          originalHeight: ih,
          ...layout,
          fittingMode: "fill-proportional" as const,
          generatedByAi: true,
          generatedByAiSource: "gemini-image-generator:designer-modificar-ia",
        },
        imageFrameAutoFit: true,
      } as FreehandObject;
    });
    return changed ? { ...page, objects } : page;
  });
}
