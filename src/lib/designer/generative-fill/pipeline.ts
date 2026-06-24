import sharp from "sharp";
import { applyMaskAsAlpha } from "@/lib/layerizer/layerizer-matte-utils";
import type { GenerativeFillMode, GenerativeFillModel, GenerativeFillRect } from "./types";
import {
  GENERATIVE_FILL_DEFAULT_CONTEXT_BLEED,
  GENERATIVE_FILL_DEFAULT_FEATHER,
  GENERATIVE_FILL_DEFAULT_PROMPT,
} from "./types";
import {
  buildMultiRectMask,
  cropBufferToRect,
  expandRect,
  featherMask,
  scaleSelectionsToCanvas,
  selectionAreaRatio,
  snapRectToPixels,
  unionSelectionBounds,
} from "./mask";
import { nanoBananaInpaintFill } from "./nano-banana-inpaint";
import { fillMaskedFromNearestBoundary, maskedRegionMostlyWhite } from "./prefill";

export type RunGenerativeFillPipelineArgs = {
  composite: string | Buffer;
  width: number;
  height: number;
  selections: GenerativeFillRect[];
  prompt?: string;
  feather?: number;
  contextBleed?: number;
  seed?: number;
  mode?: GenerativeFillMode;
  model?: GenerativeFillModel;
  userEmail?: string;
};

export type RunGenerativeFillPipelineResult = {
  rgbaPng: Buffer;
  layerRect: GenerativeFillRect;
  mode: GenerativeFillMode;
  model: GenerativeFillModel;
  prompt: string;
  feather: number;
  contextBleed: number;
  seed?: number;
};

function genCorrectionId(): string {
  return `gfc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function decodeCompositeInput(composite: string | Buffer): Promise<{ buf: Buffer; width: number; height: number }> {
  const buf = Buffer.isBuffer(composite)
    ? composite
    : Buffer.from(composite.replace(/^data:[^;]+;base64,/, ""), "base64");
  const meta = await sharp(buf).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) {
    throw new Error("Composite inválido: no se pudo leer dimensiones.");
  }
  const rgb = await sharp(buf).ensureAlpha().removeAlpha().png().toBuffer();
  return { buf: rgb, width, height };
}

export async function runGenerativeFillPipeline(
  args: RunGenerativeFillPipelineArgs,
): Promise<RunGenerativeFillPipelineResult> {
  const { buf: composite, width, height } = await decodeCompositeInput(args.composite);
  if (args.width > 0 && args.height > 0 && (args.width !== width || args.height !== height)) {
    console.warn(
      `[generative-fill] page dimensions mismatch client=${args.width}x${args.height} composite=${width}x${height}`,
    );
  }

  const scaledSelections = scaleSelectionsToCanvas(
    args.selections.filter((s) => s.w > 1 && s.h > 1),
    args.width > 0 ? args.width : width,
    args.height > 0 ? args.height : height,
    width,
    height,
  );
  const selections = scaledSelections.filter((s) => s.w > 1 && s.h > 1);
  if (selections.length === 0) {
    throw new Error("Se requiere al menos una selección rectangular.");
  }

  const feather = args.feather ?? GENERATIVE_FILL_DEFAULT_FEATHER;
  const contextBleed = args.contextBleed ?? GENERATIVE_FILL_DEFAULT_CONTEXT_BLEED;
  const prompt = args.prompt?.trim() || GENERATIVE_FILL_DEFAULT_PROMPT;
  const model = args.model ?? "nano-banana";
  const mode = args.mode ?? "inpaint";

  if (model !== "nano-banana") {
    throw new Error("Solo nano-banana está disponible en esta versión.");
  }

  const union = unionSelectionBounds(selections);
  if (!union) throw new Error("Selección inválida.");
  const layerRect = snapRectToPixels(union, width, height);

  const areaRatio = selectionAreaRatio(selections, width, height);
  if (areaRatio > 0.55) {
    throw new Error(
      "La selección ocupa más del 55% del lienzo. Reduce las zonas o divide en varias correcciones.",
    );
  }

  const cropRect = expandRect(layerRect, contextBleed, width, height);
  const hardFullMask = await buildMultiRectMask(width, height, selections);
  const fullMask = await featherMask(hardFullMask, width, height, feather);

  const cropComposite = await cropBufferToRect(composite, cropRect);
  const hardCropMask = await cropBufferToRect(hardFullMask, cropRect);
  const cropMask = await cropBufferToRect(fullMask, cropRect);

  const cropW = cropRect.w;
  const cropH = cropRect.h;

  const { rgb: prefilledRgb, filledRatio } = await fillMaskedFromNearestBoundary(
    cropComposite,
    hardCropMask,
    cropW,
    cropH,
  );

  const mostlyWhite = await maskedRegionMostlyWhite(cropComposite, hardCropMask, cropW, cropH);
  const prefillComplete = filledRatio >= 0.995;
  const usePrefillOnly =
    prefillComplete && (mostlyWhite || mode === "outpaint" || filledRatio >= 0.999);
  const customPrompt = args.prompt?.trim();

  let generatedRgb: Buffer;
  if (usePrefillOnly && !customPrompt) {
    generatedRgb = prefilledRgb;
  } else {
    try {
      generatedRgb = await nanoBananaInpaintFill({
        image: prefilledRgb,
        mask: hardCropMask,
        prompt,
        seed: args.seed,
        userEmail: args.userEmail,
      });
    } catch (err) {
      if (prefillComplete) {
        generatedRgb = prefilledRgb;
      } else {
        throw err;
      }
    }
  }

  const resizedGenerated = await sharp(generatedRgb)
    .resize(cropW, cropH, { fit: "fill" })
    .removeAlpha()
    .png()
    .toBuffer();

  const rgbaCrop = await applyMaskAsAlpha(resizedGenerated, cropMask, cropW, cropH);

  const unionInCrop = snapRectToPixels(
    {
      x: layerRect.x - cropRect.x,
      y: layerRect.y - cropRect.y,
      w: layerRect.w,
      h: layerRect.h,
    },
    cropW,
    cropH,
  );
  const rgbaUnion = await sharp(rgbaCrop)
    .extract({
      left: unionInCrop.x,
      top: unionInCrop.y,
      width: unionInCrop.w,
      height: unionInCrop.h,
    })
    .png()
    .toBuffer();

  const pageW = args.width > 0 ? args.width : width;
  const pageH = args.height > 0 ? args.height : height;
  const layerRectPage =
    width === pageW && height === pageH
      ? layerRect
      : snapRectToPixels(
          scaleSelectionsToCanvas([layerRect], width, height, pageW, pageH)[0]!,
          pageW,
          pageH,
        );

  return {
    rgbaPng: rgbaUnion,
    layerRect: layerRectPage,
    mode,
    model,
    prompt,
    feather,
    contextBleed,
    seed: args.seed,
  };
}

export function buildCorrectionMetadata(
  result: RunGenerativeFillPipelineResult,
  selections: GenerativeFillRect[],
  resultLayerId: string,
) {
  return {
    id: genCorrectionId(),
    type: "generative-fill" as const,
    mode: result.mode,
    selections: selections.map((s) => ({ ...s })),
    prompt: result.prompt,
    feather: result.feather,
    contextBleed: result.contextBleed,
    seed: result.seed,
    model: result.model,
    resultLayerId,
    createdAt: new Date().toISOString(),
  };
}
