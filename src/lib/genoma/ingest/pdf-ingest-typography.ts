import { synthesizeTypographyFromPdfRenders } from "@/lib/brain/pdf-typography-vision-fallback";
import type { TypographyVisionGuess } from "../extractors/typography";

export function createGenomaTypographyVisionInvoker(
  buffer: Buffer,
  opts: { maxPages?: number; userEmail?: string; allowPaidRefinement: boolean },
): (() => Promise<TypographyVisionGuess | null>) | undefined {
  if (!opts.allowPaidRefinement) return undefined;
  return async () => {
    const vision = await synthesizeTypographyFromPdfRenders({
      buffer,
      maxPages: opts.maxPages ?? 3,
      userEmail: opts.userEmail,
      route: "/lib/genoma/ingest/pdf",
    });
    if (!vision?.typography.primary) return null;
    return {
      primary: vision.typography.primary,
      secondary: vision.typography.secondary,
      confidence: vision.confidence,
    };
  };
}
