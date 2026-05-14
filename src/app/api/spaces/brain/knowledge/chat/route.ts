import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import {
  recordApiUsage,
} from "@/lib/api-usage";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

type BrainDoc = {
  id: string;
  name: string;
  scope?: "core" | "context";
  status?: "Subido" | "Analizado" | "Error";
  extractedContext?: string;
  embedding?: number[];
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
    await assertApiServiceEnabled("openai-brain-chat");
    await assertApiServiceEnabled("openai-embeddings");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;

    const body = (await req.json()) as {
      question?: string;
      documents?: BrainDoc[];
      projectId?: string;
      workspaceId?: string;
    };
    const question = body.question?.trim() || "";
    const docs = Array.isArray(body.documents) ? body.documents : [];

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const analyzed = docs.filter(
      (d) =>
        d.status === "Analizado" &&
        typeof d.extractedContext === "string" &&
        d.extractedContext.trim().length > 0,
    );
    const coreDocs = analyzed.filter((d) => d.scope !== "context");
    const contextDocs = analyzed.filter((d) => d.scope === "context");

    if (analyzed.length === 0) {
      return NextResponse.json({
        answer:
          "Todavia no tengo contexto analizado en Brain. Sube documentos/URLs y pulsa \"Extraer ADN\" para poder responder.",
        sources: [],
        suggestedUploads: [
          "Brief de negocio y propuesta de valor",
          "Perfil de cliente ideal y pains",
          "Casos de uso o casos de exito",
          "Documentacion de producto/servicio",
        ],
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
    const queryEmb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const qv = queryEmb.data[0]?.embedding || [];
    const embU = queryEmb.usage;
    if (embU) {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-embeddings",
        route: "/api/spaces/brain/knowledge/chat",
        model: "text-embedding-3-small",
        operation: "embedding",
        inputTokens: embU.prompt_tokens ?? embU.total_tokens,
        outputTokens: 0,
        totalTokens: embU.total_tokens,
        projectId: typeof body.projectId === "string" ? body.projectId.trim() || undefined : undefined,
        workspaceId: typeof body.workspaceId === "string" ? body.workspaceId.trim() || undefined : undefined,
      });
    }

    const preferCore =
      /\b(tone|tono|voz|mensaje|copy|propuesta de valor|marca|branding)\b/i.test(question);
    const candidateDocs = preferCore && coreDocs.length > 0 ? coreDocs : analyzed;

    const scored = candidateDocs.map((doc) => {
      const ctx = doc.extractedContext || "";
      const scoreEmb =
        Array.isArray(doc.embedding) && doc.embedding.length > 0
          ? cosineSimilarity(qv, doc.embedding)
          : 0;
      const scoreLex = lexicalScore(question, ctx);
      const score = scoreEmb > 0 ? scoreEmb * 0.8 + scoreLex * 0.2 : scoreLex * 0.7;
      return { doc, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 4);
    const contextBlock = top
      .map(({ doc, score }) => {
        const ctx = (doc.extractedContext || "").slice(0, 6000);
        return `### Fuente: ${doc.name}\nScope: ${doc.scope === "context" ? "contexto_externo" : "empresa_core"}\nRelevancia: ${score.toFixed(3)}\n${ctx}`;
      })
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres Brain Copilot. Respondes SOLO con base en las fuentes proporcionadas. Si no hay evidencia suficiente, dilo claramente y no inventes. Trata fuentes scope=empresa_core como verdad de marca/tono. Trata scope=contexto_externo como benchmark/referencia y NO lo atribuyas como hechos propios de la empresa. Devuelve JSON estricto con: {\"answer\":\"string\",\"canAnswer\":boolean,\"suggestedUploads\":[\"string\"],\"missingTopics\":[\"string\"]}. Incluye sugerencias concretas de documentos/URLs para subir cuando falte contexto.",
        },
        {
          role: "user",
          content: `Pregunta del usuario:\n${question}\n\nFuentes disponibles:\n${contextBlock}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: {
      answer?: string;
      canAnswer?: boolean;
      suggestedUploads?: string[];
      missingTopics?: string[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { answer: raw, canAnswer: true, suggestedUploads: [], missingTopics: [] };
    }

    const usage = completion.usage;
    if (usage) {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
        serviceId: "openai-brain-chat",
        route: "/api/spaces/brain/knowledge/chat",
        model: "gpt-4o",
        operation: "chat",
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        projectId: typeof body.projectId === "string" ? body.projectId.trim() || undefined : undefined,
        workspaceId: typeof body.workspaceId === "string" ? body.workspaceId.trim() || undefined : undefined,
      });
    }

    return NextResponse.json({
      answer:
        parsed.answer?.trim() ||
        "No pude construir una respuesta fiable con el contexto disponible.",
      canAnswer: Boolean(parsed.canAnswer),
      sources: top.map(({ doc, score }) => ({
        id: doc.id,
        name: doc.name,
        score: Number(score.toFixed(3)),
      })),
      suggestedUploads: Array.isArray(parsed.suggestedUploads) ? parsed.suggestedUploads : [],
      missingTopics: Array.isArray(parsed.missingTopics) ? parsed.missingTopics : [],
      stats: { analyzed: analyzed.length, core: coreDocs.length, context: contextDocs.length },
    });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[brain/knowledge/chat]", error);
    return NextResponse.json({ error: "Failed to answer question." }, { status: 500 });
  }
}
