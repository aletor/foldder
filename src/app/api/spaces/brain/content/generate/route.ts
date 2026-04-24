import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import {
  recordApiUsage,
  resolveUsageUserEmailFromRequest,
} from "@/lib/api-usage";

type BrainDoc = {
  id: string;
  name: string;
  scope?: "core" | "context";
  status?: "Subido" | "Analizado" | "Error";
  extractedContext?: string;
  embedding?: number[];
};

type BrainStrategy = {
  voiceExamples?: Array<{ id: string; kind: string; text: string }>;
  tabooPhrases?: string[];
  approvedPhrases?: string[];
  languageTraits?: string[];
  syntaxPatterns?: string[];
  preferredTerms?: string[];
  forbiddenTerms?: string[];
  channelIntensity?: Array<{ channel: string; intensity: number }>;
  allowAbsoluteClaims?: boolean;
  personas?: Array<{
    id: string;
    name: string;
    pain: string;
    channel: string;
    sophistication: string;
    tags: string[];
  }>;
  funnelMessages?: Array<{ id: string; stage: string; text: string }>;
  messageBlueprints?: Array<{
    id: string;
    claim: string;
    support: string;
    audience: string;
    channel: string;
    stage: string;
    cta: string;
    evidence: string[];
  }>;
  factsAndEvidence?: Array<{
    id: string;
    claim: string;
    evidence: string[];
    sourceDocIds: string[];
    strength: string;
    verified: boolean;
    interpreted: boolean;
  }>;
  visualStyle?: {
    protagonist?: { description?: string };
    environment?: { description?: string };
    textures?: { description?: string };
    people?: { description?: string };
  };
};

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = vecA[i] || 0;
    const b = vecB[i] || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function lexicalScore(query: string, context: string): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  if (terms.length === 0) return 0;
  const hay = context.toLowerCase();
  const hits = terms.filter((t) => hay.includes(t)).length;
  return hits / terms.length;
}

export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled("openai-assistant");
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = (await req.json()) as {
      briefing?: {
        objective?: string;
        channel?: string;
        personaId?: string;
        funnelStage?: "awareness" | "consideration" | "conversion" | "retention";
        ask?: string;
      };
      documents?: BrainDoc[];
      strategy?: BrainStrategy;
      officialFacts?: Array<{
        id?: string;
        claim?: string;
        evidence?: string[];
        strength?: string;
        verified?: boolean;
        interpreted?: boolean;
      }>;
    };

    const briefing = body.briefing || {};
    const objective = briefing.objective?.trim() || "";
    const channel = briefing.channel?.trim() || "";
    const personaId = briefing.personaId?.trim() || "";
    const funnelStage = briefing.funnelStage?.trim() || "";
    const ask = briefing.ask?.trim() || "";

    if (!objective || !channel || !personaId || !funnelStage) {
      return NextResponse.json(
        { error: "Missing briefing fields: objective/channel/persona/funnelStage" },
        { status: 400 },
      );
    }

    const strategy = body.strategy || {};
    const docs = Array.isArray(body.documents) ? body.documents : [];
    const analyzedDocs = docs.filter(
      (d) =>
        d.status === "Analizado" &&
        typeof d.extractedContext === "string" &&
        d.extractedContext.trim().length > 0,
    );
    const coreDocs = analyzedDocs.filter((d) => d.scope !== "context");
    const contextDocs = analyzedDocs.filter((d) => d.scope === "context");

    const persona = (strategy.personas || []).find((p) => p.id === personaId);
    if (!persona) return NextResponse.json({ error: "Persona not found in strategy" }, { status: 400 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

    const retrievalQuery = `${objective} ${channel} ${persona.name} ${persona.pain} ${funnelStage} ${ask}`.trim();
    const queryEmb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: retrievalQuery,
    });
    const qv = queryEmb.data[0]?.embedding || [];

    const scoreDocs = (arr: BrainDoc[]) =>
      arr
        .map((doc) => {
          const text = doc.extractedContext || "";
          const scoreEmb =
            Array.isArray(doc.embedding) && doc.embedding.length > 0
              ? cosineSimilarity(qv, doc.embedding)
              : 0;
          const scoreLex = lexicalScore(retrievalQuery, text);
          return { doc, score: scoreEmb > 0 ? scoreEmb * 0.8 + scoreLex * 0.2 : scoreLex };
        })
        .sort((a, b) => b.score - a.score);

    const topCore = scoreDocs(coreDocs).slice(0, 3).map((x) => x.doc);
    const topContext = scoreDocs(contextDocs).slice(0, 2).map((x) => x.doc);

    const approvedVoice = (strategy.voiceExamples || [])
      .filter((x) => x.kind === "approved_voice" || x.kind === "good_piece")
      .map((x) => x.text)
      .slice(0, 6);
    const forbiddenVoice = (strategy.voiceExamples || [])
      .filter((x) => x.kind === "forbidden_voice" || x.kind === "bad_piece")
      .map((x) => x.text)
      .slice(0, 6);
    const taboo = (strategy.tabooPhrases || []).slice(0, 24);
    const approvedPhrases = (strategy.approvedPhrases || []).slice(0, 24);
    const funnelMsgs = (strategy.funnelMessages || [])
      .filter((m) => m.stage === funnelStage)
      .map((m) => m.text)
      .slice(0, 6);
    const blueprints = (strategy.messageBlueprints || [])
      .filter((m) => m.stage === funnelStage)
      .filter((m) => !m.channel || m.channel.toLowerCase().includes(channel.toLowerCase()) || channel.toLowerCase().includes(m.channel.toLowerCase()))
      .slice(0, 6);
    const officialFacts = Array.isArray(body.officialFacts)
      ? body.officialFacts
          .map((f) => ({
            claim: typeof f.claim === "string" ? f.claim.trim() : "",
            evidence: Array.isArray(f.evidence) ? f.evidence.filter((x): x is string => typeof x === "string") : [],
            strength: typeof f.strength === "string" ? f.strength : "debil",
            verified: Boolean(f.verified),
            interpreted: Boolean(f.interpreted),
          }))
          .filter((f) => f.claim.length > 0)
      : [];
    const facts =
      officialFacts.length > 0
        ? officialFacts.slice(0, 8)
        : (strategy.factsAndEvidence || [])
            .filter((f) => f.verified && (f.strength === "fuerte" || f.strength === "media"))
            .slice(0, 8);

    const coreContext = topCore
      .map((d) => `### CORE: ${d.name}\n${(d.extractedContext || "").slice(0, 4500)}`)
      .join("\n\n");
    const marketContext = topContext
      .map((d) => `### CONTEXTO EXTERNO: ${d.name}\n${(d.extractedContext || "").slice(0, 4500)}`)
      .join("\n\n");

    const generationPrompt = `Objetivo: ${objective}
Canal: ${channel}
Persona: ${persona.name}
Dolor principal: ${persona.pain}
Funnel: ${funnelStage}
Instrucción adicional: ${ask || "(sin instrucción adicional)"}

Frases aprobadas:
${approvedPhrases.map((x) => `- ${x}`).join("\n") || "- (sin frases aprobadas)"}

Tabú de marca:
${taboo.map((x) => `- ${x}`).join("\n") || "- (sin tabú declarado)"}

Ejemplos de voz aprobados:
${approvedVoice.map((x) => `- ${x}`).join("\n") || "- (sin ejemplos)"}

Ejemplos de voz prohibidos:
${forbiddenVoice.map((x) => `- ${x}`).join("\n") || "- (sin ejemplos)"}

Mensajes sugeridos para esta etapa:
${funnelMsgs.map((x) => `- ${x}`).join("\n") || "- (sin mensajes definidos)"}

Matriz de mensajes (claim/soporte/audiencia/canal/CTA/evidencia):
${blueprints.map((b) => `- CLAIM: ${b.claim}\n  SOPORTE: ${b.support}\n  AUDIENCIA: ${b.audience}\n  CANAL: ${b.channel}\n  CTA: ${b.cta}\n  EVIDENCIA: ${(b.evidence || []).join(" | ")}`).join("\n") || "- (sin matriz definida)"}

Hechos y pruebas verificadas:
${facts.map((f) => `- ${f.claim} | evidencia: ${(f.evidence || []).join(" | ")} | fuerza: ${f.strength}`).join("\n") || "- (sin hechos verificados)"}

Rasgos de lenguaje:
${(strategy.languageTraits || []).map((x) => `- ${x}`).join("\n") || "- (sin rasgos)"}

Patrones de sintaxis:
${(strategy.syntaxPatterns || []).map((x) => `- ${x}`).join("\n") || "- (sin patrones)"}

Términos preferidos:
${(strategy.preferredTerms || []).map((x) => `- ${x}`).join("\n") || "- (sin términos preferidos)"}

Términos prohibidos:
${[...(strategy.forbiddenTerms || []), ...taboo].map((x) => `- ${x}`).join("\n") || "- (sin términos prohibidos)"}

Claims absolutos permitidos:
${strategy.allowAbsoluteClaims ? "Sí, permitidos si están respaldados por evidencia." : "No permitidos. Evitar 'el mejor', 'siempre', 'nunca', etc."}

Guía de estilo gráfico (ADN visual):
- Protagonista: ${strategy.visualStyle?.protagonist?.description || "(sin definir)"}
- Entorno: ${strategy.visualStyle?.environment?.description || "(sin definir)"}
- Texturas: ${strategy.visualStyle?.textures?.description || "(sin definir)"}
- Personas: ${strategy.visualStyle?.people?.description || "(sin definir)"}

Contexto CORE (verdad de marca):
${coreContext || "(sin contexto core disponible)"}

Contexto EXTERNO (mercado/competencia; usar solo como referencia):
${marketContext || "(sin contexto externo disponible)"}`
      .trim();

    const gen = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un copywriter senior B2B/B2C. Genera una pieza exacta para el briefing. Usa contexto CORE como verdad de marca. Usa contexto EXTERNO solo como benchmark sin atribuirlo como claim propio. Respeta frases aprobadas y evita tabúes. Devuelve JSON: {\"internalPrompt\":\"string\",\"draft\":\"string\"}.",
        },
        { role: "user", content: generationPrompt },
      ],
    });

    const genRaw = gen.choices[0]?.message?.content || "{}";
    let genParsed: { internalPrompt?: string; draft?: string };
    try {
      genParsed = JSON.parse(genRaw);
    } catch {
      genParsed = { internalPrompt: generationPrompt, draft: genRaw };
    }

    const draft = genParsed.draft?.trim() || "";
    if (!draft) return NextResponse.json({ error: "Generation produced empty draft" }, { status: 500 });

    const critic = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres un revisor crítico de marca. Evalúa una pieza y corrígela. Revisa: tono correcto, diferenciadores, tabúes, adecuación a persona y funnel, y soporte factual/evidencia. Devuelve JSON: {\"score\": number, \"issues\": [\"string\"], \"critique\": \"string\", \"revised\": \"string\"}.",
        },
        {
          role: "user",
          content: `Briefing:\n${generationPrompt}\n\nBorrador a evaluar:\n${draft}`,
        },
      ],
    });

    const criticRaw = critic.choices[0]?.message?.content || "{}";
    let criticParsed: { score?: number; issues?: string[]; critique?: string; revised?: string };
    try {
      criticParsed = JSON.parse(criticRaw);
    } catch {
      criticParsed = { score: 50, issues: ["No se pudo parsear evaluación"], critique: criticRaw, revised: draft };
    }

    const totalPrompt = (gen.usage?.prompt_tokens || 0) + (critic.usage?.prompt_tokens || 0);
    const totalCompletion = (gen.usage?.completion_tokens || 0) + (critic.usage?.completion_tokens || 0);
    const totalAll = (gen.usage?.total_tokens || 0) + (critic.usage?.total_tokens || 0);
    await recordApiUsage({
      provider: "openai",
      userEmail: usageUserEmail,
      serviceId: "openai-assistant",
      route: "/api/spaces/brain/content/generate",
      model: "gpt-4o",
      inputTokens: totalPrompt,
      outputTokens: totalCompletion,
      totalTokens: totalAll,
      note: "briefing+critic chain",
    });

    return NextResponse.json({
      internalPrompt: genParsed.internalPrompt || generationPrompt,
      draft,
      critique: criticParsed.critique || "",
      score: typeof criticParsed.score === "number" ? criticParsed.score : 50,
      issues: Array.isArray(criticParsed.issues) ? criticParsed.issues : [],
      revised: criticParsed.revised || draft,
      sources: {
        core: topCore.map((d) => ({ id: d.id, name: d.name })),
        context: topContext.map((d) => ({ id: d.id, name: d.name })),
      },
    });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[brain/content/generate]", error);
    return NextResponse.json({ error: "Failed to generate with briefing." }, { status: 500 });
  }
}
