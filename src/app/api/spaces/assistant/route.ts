import { NextResponse } from "next/server";
import {
  recordApiUsage,
} from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import {
  mergeAssistantDeltaIntoWorkspace,
  remapCollidingAssistantDelta,
  shouldRemapAssistantDeltaCollisions,
} from "@/lib/assistant-graph-merge";
import {
  applyNodeRemovals,
  tryResolveRemoveLastNodeId,
  tryResolveRemoveSelectedIds,
} from "@/lib/assistant-remove-intent";
import { buildAssistantSystemPrompt } from "@/lib/assistant-prompt";
import { summarizeProjectAssetsForAssistant } from "@/app/spaces/project-assets-metadata";
import {
  orderExecuteNodeIds,
  tryInferExecuteNodeIds,
} from "@/lib/assistant-execute-order";
import {
  buildCostApprovalMessage,
  estimatePaidApisForAssistantPlan,
} from "@/lib/assistant-cost-estimate";
import {
  lightenNodesForAssistant,
  lightenUnknown,
  trimNodesToCharBudget,
} from "@/lib/assistant-context-trim";
import OpenAI from "openai";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

/**
 * Modelo OpenAI para el asistente de grafo.
 * - Por defecto: gpt-4o-mini (barato y fiable con JSON).
 * - Alternativas más baratas (si tu cuenta las tiene): gpt-4.1-nano, gpt-4o-mini sigue siendo muy competitivo en calidad/precio para structured output.
 * - Si bajas de calidad con modelos muy pequeños, sube errores de JSON; prueba primero 4o-mini.
 */
const ASSISTANT_MODEL = process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4o-mini";

type AssistantDeltaNode = {
  type?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function POST(req: Request) {
  try {
    await assertApiServiceEnabled("openai-assistant");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;
    const { prompt, currentNodes = [], currentEdges = [], projectAssets } = await req.json() as {
      prompt?: string;
      currentNodes?: unknown;
      currentEdges?: unknown;
      /** `metadata.assets` del proyecto — resumen para el prompt (Brain). */
      projectAssets?: unknown;
    };

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const cn = Array.isArray(currentNodes) ? currentNodes : [];
    const ce = Array.isArray(currentEdges) ? currentEdges : [];

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    /** Nodos seleccionados (lógica servidor / merge) — sin recortar. */
    const selectedNodes = (
      cn as { id?: string; type?: string; selected?: boolean; position?: unknown; data?: unknown }[]
    ).filter((n) => n && n.selected === true);

    /** Misma selección pero sin data URLs / blobs → cabe en el contexto del modelo. */
    const selectionForLlm = selectedNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: lightenUnknown(n.data, 0),
    }));

    const selectionBlock =
      selectionForLlm.length > 0
        ? `### USER FOCUS — selected node(s) (user intends edits to refer to these when they say "this node", "este nodo", "selected", etc.):\n${JSON.stringify(selectionForLlm)}\n`
        : "### USER FOCUS: no node selected. User should select node(s) on the canvas before vague commands (e.g. change the prompt), or name id/type explicitly.\n";

    const brainBlock =
      projectAssets !== undefined && projectAssets !== null
        ? `### Brain / project assets (metadata)\n${summarizeProjectAssetsForAssistant(projectAssets)}\n(Stored when the user saves the project. Prefer these hex colors for brand-coherent suggestions — e.g. \`background\` \`data.color\` — when the user asks for client/brand styling. You cannot edit Brain from JSON.)\n\n`
        : "";

    const { nodes: cnForLlm, omitted: omittedNodes } = trimNodesToCharBudget(
      lightenNodesForAssistant(cn)
    );
    const trimNote =
      omittedNodes > 0
        ? `\n[System: full workspace list truncated — ${omittedNodes} node(s) omitted from the tail to fit the model context. Selected nodes above are complete.]\n`
        : "";

    const contextMessage =
      cn.length > 0
        ? `${brainBlock}${selectionBlock}${trimNote}### Current Workspace State:\nNodes: ${JSON.stringify(cnForLlm)}\nEdges: ${JSON.stringify(ce)}`
        : `${brainBlock}${selectionBlock}### Workspace is currently EMPTY.`;

    const systemPrompt = buildAssistantSystemPrompt();

    const response = await openai.chat.completions.create({
      model: ASSISTANT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `CONTEXT:\n${contextMessage}\n\nUSER REQUEST: ${prompt}` },
      ],
      response_format: { type: "json_object" },
    });

    const rawContent = response.choices[0].message.content || "{}";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(rawContent) as Record<string, unknown>;
    } catch {
      console.error("[Assistant] Model returned non-JSON:", rawContent.slice(0, 500));
      return NextResponse.json(
        { error: "El modelo no devolvió JSON válido. Reintenta o acorta el mensaje." },
        { status: 502 }
      );
    }
    console.log("[Assistant] Final GPT Response:", JSON.stringify(result, null, 2));

    const u = response.usage;
    if (u) {
      await recordApiUsage({
        provider: "openai",
        userEmail: usageUserEmail,
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
        userEmail: usageUserEmail,
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

    if (result.clarify && typeof result.clarify === "object") {
      return NextResponse.json(result);
    }

    let rawDeltaNodes = Array.isArray(result.nodes) ? [...result.nodes] : [];

    if (result.nodes && Array.isArray(result.nodes)) {
      result.nodes = result.nodes.map((node: AssistantDeltaNode) => {
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

    /** Evita que plantillas con ids genéricos (opt_p0, lst_ojos…) machaquen listados/prompts previos. */
    if (
      cn.length > 0 &&
      Array.isArray(result.nodes) &&
      result.nodes.length > 0 &&
      shouldRemapAssistantDeltaCollisions(prompt, selectedNodes.length)
    ) {
      const remapped = remapCollidingAssistantDelta(
        cn,
        ce,
        result.nodes,
        Array.isArray(result.edges) ? result.edges : []
      );
      result.nodes = remapped.nodes as typeof result.nodes;
      result.edges = remapped.edges as typeof result.edges;
      rawDeltaNodes = Array.isArray(result.nodes) ? [...result.nodes] : [];

      if (remapped.nodeIdRemap.size > 0 && Array.isArray(result.executeNodeIds)) {
        result.executeNodeIds = result.executeNodeIds.map((id: unknown) => {
          if (typeof id !== "string" || !id) return id;
          return remapped.nodeIdRemap.get(id) ?? id;
        });
      }
    }

    let mergedNodes: unknown[] = [...cn];
    let mergedEdges: unknown[] = [...ce];

    if (Array.isArray(result.nodes)) {
      if (cn.length > 0) {
        const merged = mergeAssistantDeltaIntoWorkspace(
          cn,
          ce,
          result.nodes,
          Array.isArray(result.edges) ? result.edges : []
        );
        mergedNodes = merged.nodes;
        mergedEdges = merged.edges;
      } else {
        mergedNodes = result.nodes;
        mergedEdges = Array.isArray(result.edges) ? result.edges : [];
      }
    }

    const removeIds: string[] = [];
    if (Array.isArray(result.removeNodeIds)) {
      for (const x of result.removeNodeIds) {
        if (typeof x === "string" && x) removeIds.push(x);
      }
    }
    const lastId = tryResolveRemoveLastNodeId(
      prompt,
      cn as { id: string; position?: { x?: number; y?: number } }[]
    );
    if (lastId) removeIds.push(lastId);
    removeIds.push(
      ...tryResolveRemoveSelectedIds(
        prompt,
        selectedNodes as { id: string }[]
      )
    );
    const uniqueRemove = [...new Set(removeIds)];

    const afterRemove = applyNodeRemovals(mergedNodes, mergedEdges, uniqueRemove);
    result.nodes = afterRemove.nodes;
    result.edges = afterRemove.edges;
    delete result.removeNodeIds;

    const edgeList = (result.edges as { source?: string; target?: string }[]) || [];
    const safeEdges = edgeList.filter(
      (e): e is { source: string; target: string } =>
        typeof e.source === "string" && typeof e.target === "string"
    );
    const nodeList = (result.nodes as { id?: string; type?: string }[]) || [];
    const safeNodes = nodeList.filter(
      (n): n is { id: string; type?: string } => typeof n.id === "string" && !!n.id
    );

    let execIds: string[] = [];
    if (Array.isArray(result.executeNodeIds)) {
      execIds = result.executeNodeIds.filter(
        (x: unknown): x is string => typeof x === "string" && x.length > 0
      );
      execIds = orderExecuteNodeIds(execIds, safeEdges);
    } else {
      execIds = tryInferExecuteNodeIds(prompt, safeNodes, safeEdges);
    }
    result.executeNodeIds = execIds;

    const costApproved = /\[COST_APPROVED\]/i.test(prompt);
    if (!costApproved && Array.isArray(result.nodes)) {
      const est = estimatePaidApisForAssistantPlan({
        rawDeltaNodes: rawDeltaNodes as { id?: string; type?: string }[],
        mergedNodes: result.nodes as { id?: string; type?: string }[],
        executeNodeIds: execIds,
      });
      if (est) {
        result.pendingCostApproval = true;
        result.costApproval = {
          message: buildCostApprovalMessage(est),
          summary: est.summary,
          apis: est.lines.map((l) => ({
            id: l.id,
            name: l.name,
            count: l.count,
            eurMin: l.eurMin,
            eurMax: l.eurMax,
          })),
          totalEurMin: est.totalEurMin,
          totalEurMax: est.totalEurMax,
        };
      }
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("Assistant API Error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
