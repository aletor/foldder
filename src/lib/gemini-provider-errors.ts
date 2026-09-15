/** Mensajes de error de Gemini imagen. Sin reintento automático (API de pago). */

export const GEMINI_DEADLINE_USER_MESSAGE =
  "Gemini no terminó a tiempo (503). No se ha cobrado ni reintentado.";

export const GEMINI_HIGH_DEMAND_USER_MESSAGE =
  "Gemini no tiene capacidad ahora (503). No se ha cobrado. Espera un poco y pulsa Generar de nuevo, o prueba NB 2.";

export const GEMINI_UNAVAILABLE_USER_MESSAGE =
  "Gemini no está disponible ahora (503). No se ha cobrado. Pulsa Generar de nuevo cuando quieras.";

export function isGeminiDeadlineError(status: number, detail: string): boolean {
  return status === 503 && /deadline|timeout|timed?\s*out|expired/i.test(detail);
}

export function isGeminiHighDemandError(status: number, detail: string): boolean {
  if (status !== 503) return false;
  return /high demand|experiencing|UNAVAILABLE|overloaded|capacity/i.test(detail);
}

export function mapGeminiProviderErrorMessage(status: number, detail: string): string {
  if (status === 429 || /RESOURCE_EXHAUSTED|monthly spending cap|project spend cap/i.test(detail)) {
    if (/monthly spending cap|project spend cap|ai\.studio\/spend/i.test(detail)) {
      return "El proyecto de Google AI ha superado el tope de gasto mensual. Súbelo o restablécelo en https://ai.studio/spend y vuelve a intentar.";
    }
    return "Cuota o límite de Google Gemini agotado (429). No se ha reintentado automáticamente.";
  }
  if (isGeminiDeadlineError(status, detail)) return GEMINI_DEADLINE_USER_MESSAGE;
  if (isGeminiHighDemandError(status, detail)) return GEMINI_HIGH_DEMAND_USER_MESSAGE;
  if (status === 503) return GEMINI_UNAVAILABLE_USER_MESSAGE;
  return `Gemini Error (${status})`;
}
