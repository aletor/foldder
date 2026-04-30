import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import {
  GUI_DEFAULT_SETTINGS,
  GUI_FORMAT_LABELS,
  isGuionistaFormat,
  makeGuionistaId,
  normalizeGuionistaSettings,
  nowIso,
  plainTextFromMarkdown,
  type GuionistaAiRequest,
  type GuionistaAiResponse,
  type GuionistaApproach,
  type GuionistaBrainContext,
  type GuionistaFormat,
  type GuionistaSettings,
  type GuionistaSocialAdaptation,
  type GuionistaVersion,
} from "@/app/spaces/guionista-types";

const MODEL = "gpt-4o";
const ROUTE = "/api/spaces/guionista";

function safeString(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("La IA no devolvió JSON válido.");
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function parseAiPayload(text: string, request: GuionistaAiRequest): Record<string, unknown> {
  try {
    return parseJsonObject(text);
  } catch {
    if (request.task === "draft" || request.task === "transform") {
      return { title: request.currentVersion?.title, markdown: text };
    }
    if (request.task === "social") {
      return { socialPack: [] };
    }
    return { approaches: [] };
  }
}

function brainContextText(context: GuionistaBrainContext | undefined): string {
  if (!context?.enabled) return "Brain no conectado.";
  const lines: string[] = ["Brain conectado. Contexto editorial resumido:"];
  if (context.projectContext) lines.push(`Contexto del proyecto: ${safeString(context.projectContext, 900)}`);
  if (context.tone?.length) lines.push(`Tono del proyecto: ${context.tone.slice(0, 8).join("; ")}`);
  if (context.approvedClaims?.length) lines.push(`Claims aprobados: ${context.approvedClaims.slice(0, 8).join("; ")}`);
  if (context.avoidPhrases?.length) lines.push(`Frases a evitar: ${context.avoidPhrases.slice(0, 12).join("; ")}`);
  if (context.notes?.length) lines.push(`Notas relevantes: ${context.notes.slice(0, 8).join("; ")}`);
  if (context.references?.length) lines.push(`Referencias útiles: ${context.references.slice(0, 8).join("; ")}`);
  if (context.editorialStyle?.length) lines.push(`Estilo editorial aprendido: ${context.editorialStyle.slice(0, 8).join("; ")}`);
  return lines.join("\n");
}

function formatInstructions(format: GuionistaFormat): string {
  return {
    post: "Post: publicación corta/media para LinkedIn o redes, con hook claro, desarrollo y cierre.",
    article: "Artículo: título, entradilla, cuerpo editorial y cierre.",
    script: "Guion: voz en off, texto en pantalla, notas visuales y duración aproximada si procede.",
    scenes: "Escenas: escenas con descripción visual, acción, voz/diálogo, intención emocional y duración aproximada.",
    slides: "Slides: estructura de presentación con títulos, bullets y notas del presentador si ayudan.",
    campaign: "Campaña: claim, subclaim, titulares, bajadas, CTAs y versiones cortas.",
    rewrite: "Reescribir: conservar significado, mejorar claridad/tono/longitud y explicar mejora aplicada.",
  }[format];
}

function settingsText(settings: GuionistaSettings): string {
  return [
    `Idioma: ${settings.language}`,
    `Longitud: ${settings.length}`,
    `Tono: ${settings.tone}`,
    settings.audience ? `Audiencia: ${settings.audience}` : "",
    `Objetivo: ${settings.goal}`,
    settings.extraInstructions ? `Instrucciones extra: ${settings.extraInstructions}` : "",
  ].filter(Boolean).join("\n");
}

function systemPrompt(): string {
  return [
    "Eres Guionista, el editor inteligente de textos de Foldder.",
    "Tu trabajo es convertir pensamiento en narrativa clara, útil y editable.",
    "No eres un chat. No hagas preguntas si puedes resolver con el briefing.",
    "No inventes datos factuales concretos si no aparecen en briefing o contexto Brain.",
    "No afirmes tendencias actuales, cifras, fechas, premios, clientes o resultados sin fuente explícita.",
    "Devuelve siempre JSON válido, sin markdown fuera del JSON.",
    "El texto final dentro de JSON puede estar en Markdown.",
  ].join("\n");
}

function userPrompt(request: GuionistaAiRequest): string {
  const format = isGuionistaFormat(request.format) ? request.format : "post";
  const settings = normalizeGuionistaSettings(request.settings);
  const briefing = safeString(request.briefing, 7000);
  const current = request.currentVersion;
  const approach = request.approach;
  const common = [
    `Tarea: ${request.task}`,
    `Formato: ${format} (${GUI_FORMAT_LABELS[format]})`,
    formatInstructions(format),
    settingsText(settings),
    brainContextText(request.brainContext),
    `Briefing/base del usuario:\n${briefing || "(vacío)"}`,
  ];

  if (request.task === "approaches") {
    return [
      ...common,
      "Devuelve exactamente este JSON:",
      '{"approaches":[{"title":"...","idea":"...","tone":"...","rationale":"...","format":"post"}]}',
      "Reglas: exactamente 3 enfoques. Cada idea debe ser distinta y útil. format debe coincidir con el formato solicitado.",
    ].join("\n\n");
  }

  if (request.task === "social") {
    return [
      ...common,
      `Versión activa:\n${safeString(current?.markdown, 9000)}`,
      "Genera un pack social estructurado. Devuelve exactamente este JSON:",
      '{"socialPack":[{"platform":"LinkedIn","title":"...","text":"...","hashtags":["#..."]},{"platform":"Instagram","title":"...","text":"...","hashtags":["#..."]},{"platform":"X","title":"...","text":"...","hashtags":[]},{"platform":"Short","title":"...","text":"...","hashtags":[]}]}',
      "Reglas: LinkedIn medio/profesional, Instagram visual/emocional sin exagerar, X máximo 280 caracteres si es post único, Short 1-2 frases. Máximo 5 hashtags.",
    ].join("\n\n");
  }

  if (request.task === "transform") {
    return [
      ...common,
      `Acción rápida: ${request.action || "Transformar"}`,
      request.targetFormat ? `Formato objetivo: ${request.targetFormat}` : "",
      `Versión activa:\n${safeString(current?.markdown, 10000)}`,
      "Devuelve exactamente este JSON:",
      '{"title":"...","markdown":"...","structured":{}}',
      "Reglas: crea una nueva versión transformada. No destruyas ni resumas de forma pobre salvo que la acción sea acortar.",
    ].filter(Boolean).join("\n\n");
  }

  return [
    ...common,
    approach ? `Enfoque elegido:\nTítulo: ${approach.title}\nIdea: ${approach.idea}\nTono: ${approach.tone}\nRationale: ${approach.rationale || ""}` : "",
    "Devuelve exactamente este JSON:",
    '{"title":"...","markdown":"...","structured":{}}',
    "Reglas: escribe un texto editable, con estructura coherente para el formato seleccionado.",
  ].filter(Boolean).join("\n\n");
}

function normalizeApproaches(raw: unknown, format: GuionistaFormat): GuionistaApproach[] {
  const rows = Array.isArray(raw) ? raw : [];
  const normalized = rows.slice(0, 3).map((row) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return {
      id: makeGuionistaId("gui_approach"),
      title: safeString(item.title, 120) || GUI_FORMAT_LABELS[format],
      idea: safeString(item.idea, 800) || "Enfoque editorial claro y accionable.",
      tone: safeString(item.tone, 240) || "Natural, claro y editorial.",
      rationale: safeString(item.rationale, 400) || undefined,
      format,
    };
  });
  while (normalized.length < 3) {
    const index = normalized.length + 1;
    normalized.push({
      id: makeGuionistaId("gui_approach"),
      title: `${GUI_FORMAT_LABELS[format]} · Enfoque ${index}`,
      idea: "Convertir el briefing en una pieza clara, útil y accionable sin inventar datos.",
      tone: "Natural, claro y editorial.",
      rationale: "Fallback de normalización porque la respuesta de IA no incluía suficientes enfoques.",
      format,
    });
  }
  return normalized;
}

function normalizeVersion(raw: Record<string, unknown>, request: GuionistaAiRequest): GuionistaVersion {
  const format = isGuionistaFormat(request.targetFormat) ? request.targetFormat : isGuionistaFormat(request.format) ? request.format : request.currentVersion?.format ?? "post";
  const title = safeString(raw.title, 160) || request.approach?.title || request.currentVersion?.title || GUI_FORMAT_LABELS[format];
  const markdown =
    safeString(raw.markdown, 50000) ||
    safeString(raw.text, 50000) ||
    safeString(request.currentVersion?.markdown, 50000) ||
    `# ${title}\n\n${safeString(request.briefing, 12000) || "Borrador pendiente."}`;
  return {
    id: makeGuionistaId("gui_version"),
    label: request.task === "transform" ? request.action || "Nueva versión" : request.approach ? "Primer borrador" : "Borrador directo",
    title,
    format,
    markdown,
    plainText: plainTextFromMarkdown(markdown),
    createdAt: nowIso(),
    sourceAction: request.task === "transform" ? request.action : request.approach ? "Usar enfoque" : "Escribir directamente",
    structured: raw.structured && typeof raw.structured === "object" ? raw.structured as Record<string, unknown> : undefined,
  };
}

function socialFallbackText(platform: GuionistaSocialAdaptation["platform"], request: GuionistaAiRequest): string {
  const base = plainTextFromMarkdown(request.currentVersion?.markdown || request.briefing || "").slice(0, 900);
  const title = request.currentVersion?.title || "Texto";
  if (platform === "LinkedIn") return `${title}\n\n${base.slice(0, 520)}`;
  if (platform === "Instagram") return `${title}\n\n${base.slice(0, 320)}`;
  if (platform === "X") return `${title}: ${base}`.slice(0, 280);
  return `${title}. ${base.slice(0, 120)}`;
}

function normalizeSocialPack(raw: unknown, request: GuionistaAiRequest): GuionistaSocialAdaptation[] {
  const rows = Array.isArray(raw) ? raw : [];
  const now = nowIso();
  const platforms = ["LinkedIn", "Instagram", "X", "Short"] as const;
  return platforms.map((platform) => {
    const found = rows.find((row) => row && typeof row === "object" && (row as Record<string, unknown>).platform === platform) as Record<string, unknown> | undefined;
    const text = safeString(found?.text, platform === "X" ? 280 : 5000) || socialFallbackText(platform, request);
    const hashtags = Array.isArray(found?.hashtags)
      ? found.hashtags.filter((tag): tag is string => typeof tag === "string").slice(0, 5)
      : [];
    return {
      id: makeGuionistaId("gui_social"),
      platform,
      title: safeString(found?.title, 160) || `${request.currentVersion?.title || "Texto"} · ${platform === "Short" ? "Short caption" : platform}`,
      text: platform === "X" ? text.slice(0, 280) : text,
      hashtags,
      sourceAssetId: request.sourceAssetId,
      sourceVersionId: request.sourceVersionId ?? request.currentVersion?.id,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      format: "post",
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled("openai-brain-content");
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const request = await req.json() as GuionistaAiRequest;
    const format = isGuionistaFormat(request.format) ? request.format : request.currentVersion?.format ?? "post";

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt({ ...request, format, settings: request.settings ?? GUI_DEFAULT_SETTINGS }) },
      ],
      temperature: request.task === "approaches" ? 0.85 : 0.72,
      max_tokens: request.task === "social" ? 1700 : request.task === "approaches" ? 1000 : 2600,
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const json = parseAiPayload(content, request);
    let response: GuionistaAiResponse;
    if (request.task === "approaches") {
      const approaches = normalizeApproaches(json.approaches, format);
      response = { task: "approaches", approaches };
    } else if (request.task === "social") {
      response = { task: "social", socialPack: normalizeSocialPack(json.socialPack, request) };
    } else {
      response = { task: request.task === "transform" ? "transform" : "draft", version: normalizeVersion(json, request) };
    }

    const usage = completion.usage;
    await recordApiUsage({
      provider: "openai",
      userEmail: usageUserEmail,
      serviceId: "openai-brain-content",
      route: ROUTE,
      model: MODEL,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      note: `Guionista ${request.task}`,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    const message = error instanceof Error ? error.message : "No se pudo generar.";
    console.error("Guionista AI Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
