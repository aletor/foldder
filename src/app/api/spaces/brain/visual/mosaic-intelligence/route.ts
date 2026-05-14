import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  parseGeminiUsageMetadata,
  recordApiUsage,
} from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import {
  assertUserCanAccessMediaReference,
  ForbiddenMediaReferenceError,
} from "@/lib/api-media-access";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import {
  normalizeVisualDnaMosaicIntelligence,
  VISUAL_DNA_MOSAIC_INTELLIGENCE_SYSTEM_PROMPT,
  VISUAL_DNA_MOSAIC_INTELLIGENCE_USER_PROMPT,
} from "@/lib/brain/visual-dna-slot/mosaic-intelligence";

const ROUTE = "/api/spaces/brain/visual/mosaic-intelligence";

type Body = {
  imageUrl?: string;
  slotId?: string;
};

function safeString(value: unknown, max = 120000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled(GEMINI_VISION_ANALYSIS_SERVICE_ID);
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;
    const body = (await req.json().catch(() => ({}))) as Body;
    const imageUrl = safeString(body.imageUrl);
    const slotId = safeString(body.slotId, 160);
    if (!imageUrl) {
      return NextResponse.json({ error: "Falta imageUrl del mosaico." }, { status: 400 });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY / GOOGLE_API_KEY no configurada." }, { status: 500 });
    }

    const s3Key = await assertUserCanAccessMediaReference(usageUserEmail, imageUrl, "mosaic image");
    const parsed = await parseReferenceImageForGemini(s3Key ?? imageUrl, { baseUrl: req.url });
    if (!parsed) {
      return NextResponse.json({ error: "No se pudo leer la imagen del mosaico." }, { status: 400 });
    }

    const modelName = process.env.VISUAL_DNA_MOSAIC_INTELLIGENCE_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: VISUAL_DNA_MOSAIC_INTELLIGENCE_SYSTEM_PROMPT,
    });

    const result = await model.generateContent([
      { text: VISUAL_DNA_MOSAIC_INTELLIGENCE_USER_PROMPT },
      { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
    ]);
    const text = result.response.text();
    const raw = parseJsonObjectFromVisionModelText(text);
    const intelligence = normalizeVisualDnaMosaicIntelligence({
      ...(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}),
      provider: "gemini",
      analyzedAt: new Date().toISOString(),
    });
    if (!intelligence) {
      return NextResponse.json({ error: "Gemini respondió, pero no devolvió ejemplos útiles del mosaico." }, { status: 422 });
    }

    const usage = parseGeminiUsageMetadata(result.response);
    await recordApiUsage({
      provider: "gemini",
      userEmail: usageUserEmail,
      serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
      route: ROUTE,
      model: modelName,
      operation: "visual_dna_mosaic_intelligence",
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      metadata: {
        slotId: slotId || undefined,
        categories: ["people", "environments", "textures", "objects", "generalLooks"],
      },
    });

    return NextResponse.json({ intelligence });
  } catch (e) {
    if (e instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `${e.label} está desactivado.` }, { status: 403 });
    }
    if (e instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "No se pudo analizar el mosaico ADN.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
