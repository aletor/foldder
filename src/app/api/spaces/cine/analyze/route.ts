import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  recordApiUsage,
} from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { estimateOpenAIUsd } from "@/lib/pricing-config";
import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  releaseApiWalletChargeOnError,
  walletGateErrorResponse,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import {
  validateAndNormalizeCineAIAnalysis,
} from "@/app/spaces/cine-engine";
import {
  CINE_MODE_LABELS,
  type CineMode,
  type CineVisualDirection,
} from "@/app/spaces/cine-types";

const MODEL = "gpt-4o";
const ROUTE = "/api/spaces/cine/analyze";

type CineAnalyzeRequest = {
  script?: string;
  mode?: CineMode;
  visualDirection?: CineVisualDirection;
};

function safeString(value: unknown, max = 12000): string {
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

function systemPrompt(): string {
  return [
    "Eres un analizador cinematográfico para Foldder. Tu tarea es convertir un guion audiovisual en una estructura limpia de preproducción.",
    "Debes separar voz en off, texto en pantalla, notas visuales, personajes, localizaciones, escenas y elementos visuales clave.",
    "No inventes escenas innecesarias.",
    "No conviertas etiquetas como Voz en off, Texto en pantalla, Notas visuales o Duración en personajes.",
    "No conviertas títulos de texto en pantalla en personajes.",
    "No generes fondos genéricos si hay localizaciones claras.",
    "Cada personaje debe ser una entidad visual real: persona, animal, criatura u objeto protagonista con función narrativa fuerte.",
    "Cada fondo debe ser una localización visual reutilizable: casa, bosque, sendero, pirámide, interior de pirámide, calle, habitación, etc.",
    "Devuelve solo JSON válido, sin markdown, sin comentarios y sin texto adicional.",
  ].join("\n");
}

function userPrompt(request: CineAnalyzeRequest): string {
  const modeLabel = request.mode ? CINE_MODE_LABELS[request.mode] : "no especificado";
  const visual = request.visualDirection;
  return [
    "Analiza este guion para crear una estructura de Nodo Cine.",
    "",
    "MODO AUDIOVISUAL",
    modeLabel,
    "",
    "DIRECCIÓN VISUAL DEL USUARIO",
    JSON.stringify({
      mode: visual?.mode,
      aspectRatio: visual?.aspectRatio,
      realismLevel: visual?.realismLevel,
      visualStyle: visual?.visualStyle,
      colorGrading: visual?.colorGrading,
      lightingStyle: visual?.lightingStyle,
      globalStylePrompt: visual?.globalStylePrompt,
      tone: visual?.tone,
      pacing: visual?.pacing,
      cameraStyle: visual?.cameraStyle,
    }, null, 2),
    "",
    "REGLAS DE ANÁLISIS",
    "- Agrupa escenas por unidad audiovisual real, no por cada párrafo si pertenecen al mismo momento.",
    "- Extrae coprotagonistas aunque aparezcan como acompañantes o amigos.",
    "- Detecta animales y criaturas con función narrativa como personajes.",
    "- Detecta objetos protagonistas solo si tienen función narrativa fuerte.",
    "- Detecta localizaciones visuales concretas y reutilizables.",
    "- Si aparece una pirámide, bosque, casa, interior, sendero, puerta o claro, debe aparecer como fondo o elemento visual central.",
    "- No colapses localizaciones distintas en un único fondo. Casa, sendero, claro, base de pirámide e interior de pirámide deben ser fondos distintos si aparecen.",
    "- Si una escena entra dentro de una pirámide, crea un fondo independiente llamado Interior de la pirámide.",
    "- Separa beats narrativos claros: presentación, viaje, comportamiento extraño, descubrimiento, exploración, entrada y cierre.",
    "- voiceOver debe contener narración/voz en off si existe.",
    "- onScreenText debe ser array de textos que se añadirán luego como overlay.",
    "- visualNotes debe describir lo que se ve en cámara.",
    "- durationSeconds debe ser número si aparece duración; si no, usa 5.",
    "- sceneKind debe ser present, flashback, memory u other.",
    "- framesMode debe ser single.",
    "- status debe ser draft.",
    "- Usa la dirección visual del usuario para condicionar tono visual, localizaciones, personajes, sugerencias de cámara, luz, paleta y ritmo.",
    "- Si visualStyle es black_white_noir, sugiere contraste, sombras y cámara sobria; no fuerces color.",
    "- Si visualStyle es animation_cartoon, crea descripciones aptas para animación, personajes icónicos y fondos claros.",
    "- Si colorGrading es golden_hour_warm, orienta paleta y notas visuales hacia calidez cinematográfica.",
    "- Si lightingStyle es dark, sugiere atmósferas de baja clave y sombras controladas; si es bright, claridad y luz limpia.",
    "- Usa aspectRatio para sugerir encuadres y composición, pero no cambies el contenido explícito del guion.",
    "",
    "Para un guion de Puffy, un buen resultado tendría personajes Puffy, Mateo y Cristóbal; fondos como casa soleada en el pueblo, sendero del bosque, claro con pirámide escondida, base de la pirámide antigua e interior de la pirámide; y unas 6 escenas narrativas.",
    "",
    "Devuelve exactamente este objeto JSON:",
    JSON.stringify({
      logline: "...",
      summary: "...",
      tone: "...",
      visualStyle: "...",
      characters: [
        {
          id: "character_slug",
          name: "...",
          role: "protagonist | secondary | extra | object",
          description: "...",
          visualPrompt: "...",
          lockedTraits: ["..."],
          wardrobe: "...",
          emotionalRange: ["..."],
          notes: "...",
          isLocked: false,
        },
      ],
      backgrounds: [
        {
          id: "background_slug",
          name: "...",
          type: "interior | exterior | natural | urban | studio | abstract | other",
          description: "...",
          visualPrompt: "...",
          lighting: "...",
          palette: ["..."],
          textures: ["..."],
          lockedElements: ["..."],
          notes: "...",
          isLocked: false,
        },
      ],
      scenes: [
        {
          id: "scene_slug",
          order: 1,
          title: "...",
          sourceText: "...",
          visualSummary: "...",
          voiceOver: "...",
          onScreenText: ["..."],
          visualNotes: "...",
          durationSeconds: 5,
          sceneKind: "present",
          characters: ["character_slug"],
          backgroundId: "background_slug",
          shot: {
            shotType: "wide",
            cameraMovement: "...",
            lensSuggestion: "...",
            lighting: "...",
            mood: "...",
            action: "...",
            durationSeconds: 5,
          },
          framesMode: "single",
          frames: {},
          status: "draft",
        },
      ],
    }, null, 2),
    "",
    "GUION",
    safeString(request.script, 18000),
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let walletCharge: ApiWalletCharge | null = null;
  let releaseWalletOnError = true;
  try {
    await assertApiServiceEnabled("openai-cine-analyze");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY no configurada." }, { status: 503 });
    }
    const usageUserEmail = authState.user.email;
    const request = await req.json() as CineAnalyzeRequest;
    const script = safeString(request.script, 20000);
    if (!script) {
      return NextResponse.json({ error: "Guion vacío." }, { status: 400 });
    }

    const promptContent = userPrompt({ ...request, script });
    const estimatedInputTokens = Math.ceil((systemPrompt().length + promptContent.length) / 4);
    const estimatedCostUsd = estimateOpenAIUsd(MODEL, estimatedInputTokens, 5200);
    walletCharge = await reserveApiWalletCharge({
      req,
      userEmail: usageUserEmail,
      serviceId: "openai-cine-analyze",
      provider: "openai",
      route: ROUTE,
      maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.5 }),
      metadata: { model: MODEL, mode: request.mode },
    });

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: promptContent },
      ],
      temperature: 0.28,
      max_tokens: 5200,
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";
    const usage = completion.usage;
    const actualCostUsd = usage
      ? estimateOpenAIUsd(MODEL, usage.prompt_tokens, usage.completion_tokens)
      : Math.min(0.04, estimatedCostUsd);
    releaseWalletOnError = false;
    await walletCharge?.capture({
      actualCostUsd,
      metadata: {
        model: MODEL,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
      },
    });

    const parsed = parseJsonObject(rawContent);
    const normalized = validateAndNormalizeCineAIAnalysis(parsed, script);

    await recordApiUsage({
      provider: "openai",
      userEmail: usageUserEmail,
      serviceId: "openai-cine-analyze",
      route: ROUTE,
      model: MODEL,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      note: "Cine script analysis",
    });

    return NextResponse.json(normalized);
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    if (releaseWalletOnError) await releaseApiWalletChargeOnError(walletCharge, error);
    const walletResponse = walletGateErrorResponse(error);
    if (walletResponse) return walletResponse;
    const message = error instanceof Error ? error.message : "No se pudo analizar el guion con IA.";
    console.error("Cine AI Analysis Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
