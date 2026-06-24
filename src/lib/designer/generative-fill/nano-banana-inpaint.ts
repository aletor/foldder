import { geminiImageGenerate } from "@/lib/gemini-image-generate";
import { GEMINI_IMAGE_ASPECT_RATIOS, type GeminiImageAspectRatio } from "@/lib/gemini-image-generate";
import { resolveGeneratedImageOutputToBuffer } from "./resolve-gemini-output";

const DEFAULT_INPAINT_PROMPT =
  "Fill the masked region so it blends naturally and continuously with the surrounding content. Match lighting, texture, perspective and color.";

function bufferToDataUrl(buf: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function closestAspectRatio(w: number, h: number): GeminiImageAspectRatio {
  const ratio = w / Math.max(h, 1);
  let best: GeminiImageAspectRatio = GEMINI_IMAGE_ASPECT_RATIOS[0];
  let bestDiff = Infinity;
  for (const label of GEMINI_IMAGE_ASPECT_RATIOS) {
    const [a, b] = label.split(":").map(Number);
    const r = a / Math.max(b ?? 1, 1);
    const diff = Math.abs(r - ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

export interface InpaintAdapterArgs {
  image: Buffer;
  mask: Buffer;
  prompt: string;
  seed?: number;
  userEmail?: string;
}

/** Nano Banana (Gemini image) — imagen RGB del crop + máscara binaria como segunda referencia. */
export async function nanoBananaInpaintFill(args: InpaintAdapterArgs): Promise<Buffer> {
  const meta = await import("sharp").then((m) => m.default(args.image).metadata());
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;

  const imageDataUrl = bufferToDataUrl(args.image);
  const maskDataUrl = bufferToDataUrl(args.mask);

  const prompt = [
    args.prompt.trim() || DEFAULT_INPAINT_PROMPT,
    "Image 1 is the scene. Image 2 is a binary mask (white = region to fill, black = keep unchanged).",
    "Edit only the white masked areas in image 1. Fill every white pixel of the mask edge-to-edge — do not leave empty gaps inside the masked region.",
    "Return the full edited crop at the same resolution as image 1.",
    args.seed != null ? `Use seed ${args.seed} for reproducibility if supported.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const result = await geminiImageGenerate(
    {
      prompt,
      images: [imageDataUrl, maskDataUrl],
      aspect_ratio: closestAspectRatio(w, h),
      resolution: w * h > 1024 * 1024 ? "2k" : "1k",
      model: "flash31",
    },
    undefined,
    {
      usageRoute: "/api/spaces/designer/generative-fill",
      usageUserEmail: args.userEmail,
    },
  );

  return resolveGeneratedImageOutputToBuffer(result.output);
}
