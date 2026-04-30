"use client";

import type {
  GuionistaAiRequest,
  GuionistaAiResponse,
} from "./guionista-types";

export async function runGuionistaAi(request: GuionistaAiRequest): Promise<GuionistaAiResponse> {
  const response = await fetch("/api/spaces/guionista", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null) as { error?: string } | GuionistaAiResponse | null;
  if (!response.ok) {
    throw new Error((payload && "error" in payload && payload.error) || "No se pudo generar.");
  }
  if (!payload || !("task" in payload)) {
    throw new Error("Respuesta de Guionista inválida.");
  }
  return payload;
}
