/**
 * Verificación LLM opcional del recorte de logo (Fase B).
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import { recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import type { Candidate, LogoValue } from "@/lib/brandkit/brand-kit-types";
import { withGeminiRetries } from "@/lib/brandkit/ingest/gemini-retry";

const VERIFY_MODEL =
  process.env.BRAND_KIT_LOGO_CROP_VERIFY_MODEL?.trim() ||
  process.env.BRAND_KIT_LLM_GEMINI_MODEL?.trim() ||
  "gemini-2.5-flash";

const verifySchema = z.object({
  isLikelyLogo: z.boolean(),
  isComplete: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type LogoCropVerifyResult = {
  ok: boolean;
  confidence: number;
  estimatedCostUsd: number;
};

export async function verifyLogoCropWithVision(input: {
  candidate: Candidate<LogoValue>;
  userEmail?: string;
  route?: string;
  contentSignature?: string;
}): Promise<LogoCropVerifyResult> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  const previewUrl = input.candidate.value.previewUrl ?? input.candidate.value.assetId;
  if (!apiKey || !previewUrl) {
    return { ok: true, confidence: 0.5, estimatedCostUsd: 0 };
  }

  const inline = await parseReferenceImageForGemini(previewUrl).catch(() => null);
  if (!inline) {
    return { ok: true, confidence: 0.5, estimatedCostUsd: 0 };
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await withGeminiRetries({
      run: async () =>
        ai.models.generateContent({
          model: VERIFY_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "¿Es este recorte un logo de marca usable?",
                    "Responde JSON: { isLikelyLogo, isComplete, confidence }.",
                    "Marca isLikelyLogo=false para fotos, mockups sin logo, bloques de color o texto suelto.",
                    "isComplete=false si el logo está cortado en los bordes.",
                  ].join("\n"),
                },
                { inlineData: { mimeType: inline.mimeType, data: inline.data } },
              ],
            },
          ],
          config: { responseMimeType: "application/json", temperature: 0 },
        }),
    });

    const parsed = verifySchema.safeParse(
      parseJsonObjectFromVisionModelText(
        (response as { text?: string }).text ?? "",
      ),
    );

    const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
      .usageMetadata;
    const estimatedCostUsd = estimateGeminiUsd(
      VERIFY_MODEL,
      usage?.promptTokenCount ?? 900,
      usage?.candidatesTokenCount ?? 80,
    );

    if (input.userEmail) {
      await recordApiUsage({
        provider: "gemini",
        userEmail: input.userEmail,
        serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
        route: input.route ?? "/api/spaces/brandKit/ingest",
        costUsd: estimatedCostUsd,
        metadata: {
          kind: "logo_crop_verify",
          contentSignature: input.contentSignature?.slice(0, 16),
        },
      }).catch(() => undefined);
    }

    if (!parsed.success) {
      return { ok: true, confidence: 0.55, estimatedCostUsd };
    }

    const ok =
      parsed.data.isLikelyLogo &&
      parsed.data.isComplete &&
      parsed.data.confidence >= 0.55;

    return { ok, confidence: parsed.data.confidence, estimatedCostUsd };
  } catch (error) {
    console.error("[brandKit/logo-crop-verify]", error);
    return { ok: true, confidence: 0.5, estimatedCostUsd: 0 };
  }
}

export async function applyLogoCropVerificationToCandidates(
  candidates: Candidate<LogoValue>[],
  input: {
    userEmail?: string;
    route?: string;
    contentSignature?: string;
  },
): Promise<{ candidates: Candidate<LogoValue>[]; verifyUsed: boolean }> {
  if (!candidates.length) return { candidates, verifyUsed: false };

  const [top, ...rest] = candidates;
  const verify = await verifyLogoCropWithVision({
    candidate: top,
    userEmail: input.userEmail,
    route: input.route,
    contentSignature: input.contentSignature,
  });

  if (verify.ok) {
    return {
      candidates: [{ ...top, score: Math.min(0.96, top.score + verify.confidence * 0.04) }, ...rest],
      verifyUsed: true,
    };
  }

  const demoted: Candidate<LogoValue> = {
    ...top,
    score: Math.max(0.35, top.score - 0.28),
    rankSignals: [...(top.rankSignals ?? []), "verificación:recorte dudoso"],
  };

  const reordered = [demoted, ...rest].sort((a, b) => b.score - a.score);
  return { candidates: reordered, verifyUsed: true };
}
