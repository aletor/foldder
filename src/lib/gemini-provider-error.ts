import { NextResponse } from "next/server";

export type GeminiProviderErrorInfo = {
  status: number;
  code?: number;
  providerStatus?: string;
  message: string;
  userMessage: string;
};

/**
 * Interpreta errores del SDK / REST de Gemini (a menudo JSON embebido en Error.message).
 * No reintenta: solo clasifica para responder al cliente.
 */
export function parseGeminiProviderError(error: unknown): GeminiProviderErrorInfo | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw.trim()) return null;

  let code: number | undefined;
  let providerStatus: string | undefined;
  let providerMessage = raw;

  const jsonMatch = raw.match(/\{[\s\S]*"error"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error) {
        code = typeof parsed.error.code === "number" ? parsed.error.code : undefined;
        providerStatus = typeof parsed.error.status === "string" ? parsed.error.status : undefined;
        if (typeof parsed.error.message === "string" && parsed.error.message.trim()) {
          providerMessage = parsed.error.message.trim();
        }
      }
    } catch {
      // keep raw
    }
  }

  const blob = `${code ?? ""} ${providerStatus ?? ""} ${providerMessage} ${raw}`;
  const isSpendCap =
    /monthly spending cap|project spend cap|ai\.studio\/spend/i.test(blob);
  const isQuota =
    code === 429 ||
    /RESOURCE_EXHAUSTED|\b429\b|quota|rate limit/i.test(blob);

  if (isSpendCap) {
    return {
      status: 429,
      code: code ?? 429,
      providerStatus: providerStatus ?? "RESOURCE_EXHAUSTED",
      message: providerMessage,
      userMessage:
        "El proyecto de Google AI ha superado el tope de gasto mensual. Súbelo o restablécelo en https://ai.studio/spend y vuelve a intentar.",
    };
  }
  if (isQuota) {
    return {
      status: 429,
      code: code ?? 429,
      providerStatus: providerStatus ?? "RESOURCE_EXHAUSTED",
      message: providerMessage,
      userMessage:
        "Cuota o límite de Google Gemini agotado (429). No se ha reintentado automáticamente; espera o revisa facturación/cuota y vuelve a generar.",
    };
  }
  return null;
}

export function geminiProviderErrorResponse(error: unknown): NextResponse | null {
  const info = parseGeminiProviderError(error);
  if (!info) return null;
  return NextResponse.json(
    {
      error: info.userMessage,
      details: info.message,
      code: info.code,
      status: info.providerStatus,
    },
    { status: info.status },
  );
}
