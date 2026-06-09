import { NextRequest, NextResponse } from "next/server";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import { estimateGeminiUsd } from "@/lib/pricing-config";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { assertUserCanAccessMediaReference, ForbiddenMediaReferenceError } from "@/lib/api-media-access";
import { normalizeAdvancedImageIntegrationContract } from "@/lib/advanced-image/integration-contract";
import { parseReferenceImageForGemini } from "@/lib/parse-reference-image";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = "gemini-2.5-flash";
const ROUTE = "/api/gemini/analyze-correction";

function safeModel(model: unknown): string {
  const value = typeof model === "string" ? model.trim() : "";
  if (!value || value.includes("pro")) return DEFAULT_MODEL;
  return value;
}

function extractText(data: unknown): string {
  const candidate = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return candidate.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text?.trim() ?? "";
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function buildFallbackIntegrationContract(args: {
  generatedAt: string;
  generatedBy: string;
  referenceImageUrl: string;
  userInstruction: string;
}): unknown {
  const instruction = args.userInstruction.trim().replace(/\s+/g, " ");
  const normalized = instruction.toLowerCase();
  const hasReference = Boolean(args.referenceImageUrl);
  const category = inferFallbackCategory(normalized, hasReference);
  return {
    AVOID_LIST: fallbackAvoidList(category),
    CATEGORY: category,
    GENERATED_AT: args.generatedAt,
    GENERATED_BY: args.generatedBy,
    INTEGRATION_CONTRACT: fallbackContract(category, instruction),
    NEEDS_BINARY_MASK: category !== "environmental",
    ORIGINAL_ELEMENT: category === "substitute_object" ? "the existing element inside the marked master crop" : "",
    TARGET_ELEMENT: category === "substitute_object" ? instruction : "",
  };
}

function inferFallbackCategory(instruction: string, hasReference: boolean): string {
  if (/\b(remove|delete|erase|quita|quitar|elimina|eliminar|borra|borrar)\b/.test(instruction)) {
    return "remove_object";
  }
  if (/\b(night|day|rain|snow|fog|atmosphere|ambient|lighting|black and white|noche|dia|día|lluvia|nieve|niebla|ambiente|iluminacion|iluminación|blanco y negro)\b/.test(instruction)) {
    return "environmental";
  }
  if (/\b(replace|substitute|swap|sustituye|sustituir|reemplaza|reemplazar|cambia por|cambiar por)\b/.test(instruction)) {
    return "substitute_object";
  }
  if (hasReference && /\b(shoe|shoes|sneaker|sneakers|boot|boots|zapatilla|zapatillas|zapato|zapatos|bota|botas|calzado)\b/.test(instruction)) {
    return "substitute_object";
  }
  if (/\b(texture|material|fabric|tile|tiles|surface|pattern|textura|material|tela|azulejo|azulejos|superficie|patron|patrón)\b/.test(instruction)) {
    return "change_texture_material";
  }
  if (/\b(color|colour|red|blue|green|yellow|black|white|rojo|azul|verde|amarillo|negro|blanco|pinta|pintar)\b/.test(instruction)) {
    return "modify_attribute";
  }
  if (/\b(add|insert|place|put|añade|añadir|agrega|agregar|pon|poner|ponle|coloca|colocar)\b/.test(instruction)) {
    return "add_object";
  }
  return hasReference ? "add_object" : "modify_attribute";
}

function fallbackContract(category: string, instruction: string): string {
  if (category === "substitute_object") {
    return `Replace the existing element in the marked region with the requested result: "${instruction}". The replacement must conform to the underlying pose, perspective, contact points, occlusion, local shadows, focus, grain and color temperature of the master crop. Do not restore the original element from the master inside the marked region in later batches.`;
  }
  if (category === "add_object") {
    return `Add the requested visual element naturally into the marked region: "${instruction}". Match scene scale, perspective, contact shadows, occlusion, lighting direction, focus, grain and color temperature.`;
  }
  if (category === "change_texture_material") {
    return `Change only the material, texture, pattern or surface described by the instruction: "${instruction}". Preserve the underlying geometry, perspective, folds, depth, lighting continuity and photographic texture fidelity.`;
  }
  if (category === "remove_object") {
    return `Remove the targeted element and reconstruct the marked region with plausible background, matching texture, lighting, perspective, focus and grain. Avoid visible boundaries.`;
  }
  if (category === "environmental") {
    return `Apply the requested environmental or stylistic adjustment consistently while preserving composition, subjects, objects and photographic coherence: "${instruction}".`;
  }
  return `Apply the requested attribute change naturally inside the marked region: "${instruction}". Preserve local geometry, texture fidelity, lighting continuity, focus, grain and surrounding context.`;
}

function fallbackAvoidList(category: string): string[] {
  const common = ["Do not create a sticker or cutout appearance.", "Do not reproduce UI marks, colored outlines, masks or guide lines."];
  if (category === "substitute_object") {
    return ["Do not restore the original master element inside the marked region.", ...common].slice(0, 3);
  }
  if (category === "change_texture_material") {
    return ["Do not extend the change to similar unmarked surfaces.", ...common].slice(0, 3);
  }
  return common.slice(0, 3);
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("gemini-analyze");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = await req.json();
    const userInstruction = typeof body?.userInstruction === "string" ? body.userInstruction.trim() : "";
    const zoneSize = typeof body?.zoneSize === "string" ? body.zoneSize.trim() : "medium";
    const referenceImageUrl = typeof body?.referenceImageUrl === "string" ? body.referenceImageUrl.trim() : "";
    const masterCropUrl = typeof body?.masterCropUrl === "string" ? body.masterCropUrl.trim() : "";
    const model = safeModel(body?.model);

    if (!userInstruction) return NextResponse.json({ error: "userInstruction required" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key not configured" }, { status: 500 });

    const parts: Array<Record<string, unknown>> = [];
    if (masterCropUrl) {
      await assertUserCanAccessMediaReference(authState.user.email, masterCropUrl, "master crop");
      const parsed = await parseReferenceImageForGemini(masterCropUrl, { baseUrl: req.url });
      if (parsed) parts.push({ inline_data: { data: parsed.data, mime_type: parsed.mimeType } });
    }
    if (referenceImageUrl) {
      await assertUserCanAccessMediaReference(authState.user.email, referenceImageUrl, "correction reference");
      const parsed = await parseReferenceImageForGemini(referenceImageUrl, { baseUrl: req.url });
      if (parsed) parts.push({ inline_data: { data: parsed.data, mime_type: parsed.mimeType } });
    }

    const prompt = [
      "You are analyzing an image editing instruction to produce structured metadata for the generator model.",
      "",
      `USER INSTRUCTION: ${userInstruction}`,
      "",
      masterCropUrl ? "CONTEXT IMAGE (master crop): see attached." : "CONTEXT IMAGE (master crop): not provided.",
      referenceImageUrl ? "REFERENCE IMAGE (user-provided): see attached." : "REFERENCE IMAGE (user-provided): not provided.",
      `ZONE SIZE: ${zoneSize}`,
      "",
      "Determine and output as JSON:",
      "",
      "1. CATEGORY: one of [substitute_object, add_object, modify_attribute, change_texture_material, environmental, remove_object].",
      "",
      "2. INTEGRATION_CONTRACT: 2-4 sentences describing the specific physical and photographic constraints required for natural integration in this scene. Cover any of: scale relative to nearby elements, perspective matching the photo lens, contact shadows, surface contact, occlusion, deformation under pose/gravity, material continuity, lighting continuity, lens characteristics (focus, grain, depth of field), color temperature matching.",
      "",
      "3. AVOID_LIST: 1-3 short sentences explicitly stating what to avoid, such as cutout/sticker appearance, flat overlays, copied reference images, or surrounding-area changes outside the zone.",
      "",
      "4. NEEDS_BINARY_MASK: boolean. True for substitute_object, add_object, change_texture_material, remove_object. False for environmental. Ambiguous cases default to true.",
      "",
      "5. ORIGINAL_ELEMENT: if CATEGORY is substitute_object, describe the existing element in the master crop that must be replaced. Otherwise return an empty string.",
      "",
      "6. TARGET_ELEMENT: if CATEGORY is substitute_object, describe the requested replacement element. Otherwise describe the main requested visual result briefly or return an empty string.",
      "",
      "Return only a strict JSON object. Do not wrap it in markdown. Do not include explanation text.",
    ].join("\n");
    parts.push({ text: prompt });

    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: authState.user.email,
      serviceId: "gemini-analyze",
      provider: "gemini",
      route: ROUTE,
      maxCostMicros: reserveUsdToMicros(0.006),
      metadata: { model, hasMasterCrop: Boolean(masterCropUrl), hasReferenceImage: Boolean(referenceImageUrl) },
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: 520, responseMimeType: "application/json", temperature: 0.08 },
      }),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok || data?.error) {
      const message = data?.error?.message || `Gemini correction analysis failed (${response.status})`;
      await walletCharge?.release({ reason: "provider_error", metadata: { status: response.status } });
      releaseWalletOnError = false;
      return NextResponse.json({ error: message }, { status: response.ok ? 500 : response.status });
    }

    const text = extractText(data);
    let parsed: unknown;
    let fallbackUsed = false;
    if (!text) {
      fallbackUsed = true;
      parsed = buildFallbackIntegrationContract({
        generatedAt: new Date().toISOString(),
        generatedBy: `${model}:local-fallback-empty`,
        referenceImageUrl,
        userInstruction,
      });
    } else {
      try {
        parsed = parseJsonObject(text);
      } catch (error) {
        fallbackUsed = true;
        console.warn("[gemini/analyze-correction] Non-JSON response; using local fallback contract", {
          message: error instanceof Error ? error.message : String(error),
          rawPreview: text.slice(0, 220),
        });
        parsed = buildFallbackIntegrationContract({
          generatedAt: new Date().toISOString(),
          generatedBy: `${model}:local-fallback-non-json`,
          referenceImageUrl,
          userInstruction,
        });
      }
    }
    const integrationContract = normalizeAdvancedImageIntegrationContract(parsed, {
      generatedAt: new Date().toISOString(),
      generatedBy: fallbackUsed ? `${model}:local-fallback` : model,
    });

    const usage = parseGeminiUsageMetadata(data);
    const actualCostUsd = usage
      ? estimateGeminiUsd(model, usage.inputTokens, usage.outputTokens)
      : 0.002;
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model,
        fallbackUsed,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      },
    });

    await recordApiUsage({
      provider: "gemini",
      userEmail: authState.user.email,
      serviceId: "gemini-analyze",
      route: ROUTE,
      model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      costUsd: usage ? undefined : actualCostUsd,
      note: usage ? undefined : "advanced-image correction contract estimate",
    });

    return NextResponse.json({ fallbackUsed, integrationContract, model, rawText: text });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    if (error instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : "analyze_correction_failed";
    console.error("[gemini/analyze-correction]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
