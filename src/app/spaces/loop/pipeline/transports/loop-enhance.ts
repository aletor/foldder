"use client";

/**
 * Transporte cliente para el executor de Prompt Enhancer dentro de una tubería de Loop.
 * Llama a la MISMA ruta que el nodo Enhancer (`/api/openai/enhance`). Aislado para mockear en tests.
 */

export async function enhancePromptForLoop(args: { prompt: string }): Promise<string> {
  const res = await fetch("/api/openai/enhance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: args.prompt }),
  });
  const json = (await res.json().catch(() => ({}))) as { enhanced?: string; error?: string };
  if (!res.ok) {
    throw new Error(json?.error || `enhance_failed_${res.status}`);
  }
  const text = typeof json.enhanced === "string" ? json.enhanced.trim() : "";
  if (!text) throw new Error("Prompt Enhancer devolvió un prompt vacío.");
  return text;
}
