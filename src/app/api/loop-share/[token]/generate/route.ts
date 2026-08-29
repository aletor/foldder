import { NextResponse } from "next/server";
import {
  resolveFormPrompt,
  resolvePublicFormImages,
} from "@/app/spaces/loop/loop-form";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { findLoopShareByToken, incrementLoopShareGenerations } from "@/lib/loop-share-db";
import {
  generateLoopShareImage,
  GeminiGenerateError,
  OpenAiGenerateError,
} from "@/lib/loop-share-generate";
import {
  estimateGeminiImageGenerationUsd,
  estimateOpenAiImageGenerationUsd,
  resolveOpenAiImageQuality,
} from "@/lib/pricing-config";
import {
  releaseApiWalletChargeOnError,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

function isPastIsoDate(value: string): boolean {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

function sanitizeTextValues(
  raw: unknown,
  allowedKeys: Set<string>,
): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof value !== "string") continue;
    out[key] = value.slice(0, 2000);
  }
  return out;
}

function sanitizeImageRows(
  raw: unknown,
  allowedInputs: Set<string>,
): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowedInputs.has(key)) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) continue;
    out[key] = n;
  }
  return out;
}

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    const { token } = await context.params;
    const row = await findLoopShareByToken(token);
    if (!row) {
      return NextResponse.json({ error: "Enlace no encontrado" }, { status: 404 });
    }
    if (!row.options.enabled) {
      return NextResponse.json({ error: "Este enlace ya no está activo" }, { status: 410 });
    }
    if (row.options.autoDisableAt && isPastIsoDate(row.options.autoDisableAt)) {
      return NextResponse.json({ error: "Este enlace ha expirado" }, { status: 410 });
    }

    const body = (await req.json()) as {
      textValues?: unknown;
      imageRows?: unknown;
    };

    const { payload } = row;
    const textKeys = new Set(
      payload.formModel.textFields.filter((f) => f.kind === "text").map((f) => f.fieldKey),
    );
    const imageInputs = new Set(payload.formModel.imageFields.map((f) => f.inputId));

    const textValues = sanitizeTextValues(body.textValues, textKeys);
    const imageRows = sanitizeImageRows(body.imageRows, imageInputs);
    if (textValues == null || imageRows == null) {
      return NextResponse.json({ error: "Valores del formulario inválidos" }, { status: 400 });
    }

    for (const field of payload.formModel.textFields) {
      if (field.kind === "text" && !(field.fieldKey in textValues)) {
        return NextResponse.json(
          { error: `Falta el campo "${field.label}"` },
          { status: 400 },
        );
      }
    }
    for (const field of payload.formModel.imageFields) {
      if (!(field.inputId in imageRows)) {
        return NextResponse.json(
          { error: `Falta elegir "${field.label}"` },
          { status: 400 },
        );
      }
      const rowIndex = imageRows[field.inputId];
      if (!field.options.some((o) => o.rowIndex === rowIndex)) {
        return NextResponse.json({ error: "Opción de imagen inválida" }, { status: 400 });
      }
    }

    const prompt = resolveFormPrompt(payload.formModel, payload.promptTemplate, textValues);
    if (!prompt.trim()) {
      return NextResponse.json({ error: "El prompt resultante está vacío" }, { status: 400 });
    }

    const refs = resolvePublicFormImages({
      model: payload.formModel,
      imageInputs: payload.imageInputs,
      fixedRefUrls: payload.fixedRefUrls,
      imageRows,
    });

    const provider = payload.templateModel.provider === "openai" ? "openai" : "gemini";
    const serviceId = provider === "openai" ? "openai-images" : "gemini-nano";
    await assertApiServiceEnabled(serviceId);

    const estimatedCostUsd =
      provider === "openai"
        ? estimateOpenAiImageGenerationUsd(
            payload.templateModel.resolution,
            resolveOpenAiImageQuality(payload.templateModel.resolution),
            payload.templateModel.aspectRatio,
          )
        : estimateGeminiImageGenerationUsd(
            payload.templateModel.modelKey,
            payload.templateModel.resolution,
          );

    walletCharge = await reserveApiWalletCharge({
      userEmail: row.ownerEmail,
      serviceId,
      provider,
      route: "/api/loop-share/generate",
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.15 }),
      metadata: { loopShareToken: token, loopNodeId: row.loopNodeId },
    });

    const result = await generateLoopShareImage({
      prompt,
      images: refs.map((r) => r.url),
      model: payload.templateModel,
      ownerEmail: row.ownerEmail,
    });

    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd: estimatedCostUsd,
      metadata: { model: payload.templateModel.modelKey },
    });

    await incrementLoopShareGenerations(token);

    return NextResponse.json({
      output: result.output,
      s3Key: result.s3Key,
      prompt,
    });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `Generación no disponible: ${error.label}` },
        { status: 423 },
      );
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    if (error instanceof GeminiGenerateError || error instanceof OpenAiGenerateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[loop-share/generate] failed:", error);
    const message = error instanceof Error ? error.message : "Error al generar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
