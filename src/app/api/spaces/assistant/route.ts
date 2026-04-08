import { NextResponse } from "next/server";
import { recordApiUsage } from "@/lib/api-usage";
import { buildAssistantSystemPrompt } from "@/lib/assistant-prompt";
import OpenAI from "openai";

/**
 * Modelo OpenAI para el asistente de grafo.
 * - Por defecto: gpt-4o-mini (barato y fiable con JSON).
 * - Alternativas más baratas (si tu cuenta las tiene): gpt-4.1-nano, gpt-4o-mini sigue siendo muy competitivo en calidad/precio para structured output.
 * - Si bajas de calidad con modelos muy pequeños, sube errores de JSON; prueba primero 4o-mini.
 */
const ASSISTANT_MODEL = process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4o-mini";

export async function POST(req: Request) {
  try {
    const { prompt, currentNodes = [], currentEdges = [] } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    const contextMessage =
      currentNodes.length > 0
        ? `### Current Workspace State:\nNodes: ${JSON.stringify(currentNodes)}\nEdges: ${JSON.stringify(currentEdges)}`
        : "### Workspace is currently EMPTY.";

    const systemPrompt = buildAssistantSystemPrompt();

    const response = await openai.chat.completions.create({
      model: ASSISTANT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `CONTEXT:\n${contextMessage}\n\nUSER REQUEST: ${prompt}` },
      ],
      response_format: { type: "json_object" },
    });

    let result = JSON.parse(response.choices[0].message.content || "{}");
    console.log("[Assistant] Final GPT Response:", JSON.stringify(result, null, 2));

    const u = response.usage;
    if (u) {
      await recordApiUsage({
        provider: "openai",
        serviceId: "openai-assistant",
        route: "/api/spaces/assistant",
        model: ASSISTANT_MODEL,
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
      });
    } else {
      await recordApiUsage({
        provider: "openai",
        serviceId: "openai-assistant",
        route: "/api/spaces/assistant",
        model: ASSISTANT_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0.003,
        note: "Asistente sin campo usage en respuesta (estimado)",
      });
    }

    if (result.nodes && Array.isArray(result.nodes)) {
      result.nodes = result.nodes.map((node: any) => {
        if (node.type === "urlImage" && node.data?.label) {
          return {
            ...node,
            data: {
              ...node.data,
              pendingSearch: true,
            },
          };
        }
        return node;
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Assistant API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
