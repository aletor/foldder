import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { recordApiUsage } from "@/lib/api-usage";
import { buildReadableCorporateContext } from "@/lib/brain-knowledge-utils";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

type BrainDoc = {
  id: string;
  name: string;
  size: number;
  mime: string;
  s3Path?: string;
  type?: "document" | "image";
  format?: "pdf" | "docx" | "txt" | "url" | "image";
  status?: "Subido" | "Analizado" | "Error";
  uploadedAt?: string;
  extractedContext?: string;
  originalSourceUrl?: string;
  embedding?: number[];
  errorMessage?: string;
};

export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled("openai-embeddings");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const usageUserEmail = authState.user.email;
    const { id, context, documents, projectId, workspaceId } = (await req.json()) as {
      id?: string;
      context?: unknown;
      documents?: BrainDoc[];
      projectId?: string;
      workspaceId?: string;
    };

    if (!id || !context || !Array.isArray(documents)) {
      return NextResponse.json({ error: "Missing id, context or documents" }, { status: 400 });
    }

    const nextDocs = [...documents];
    const idx = nextDocs.findIndex((d) => d.id === id);
    if (idx === -1) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const contextString = typeof context === "string" ? context : JSON.stringify(context, null, 2);
    nextDocs[idx] = { ...nextDocs[idx], extractedContext: contextString, status: "Analizado", errorMessage: undefined };

    try {
      const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY not configured");
      }
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: contextString,
      });
      nextDocs[idx].embedding = embeddingResponse.data[0]?.embedding;
      const eu = embeddingResponse.usage;
      if (eu) {
        await recordApiUsage({
          provider: "openai",
          userEmail: usageUserEmail,
          serviceId: "openai-embeddings",
          route: "/api/spaces/brain/knowledge/update",
          model: "text-embedding-3-small",
          operation: "embedding",
          inputTokens: eu.prompt_tokens ?? eu.total_tokens,
          outputTokens: 0,
          totalTokens: eu.total_tokens,
          projectId: typeof projectId === "string" ? projectId.trim() || undefined : undefined,
          workspaceId: typeof workspaceId === "string" ? workspaceId.trim() || undefined : undefined,
          metadata: { documentId: id },
        });
      }
    } catch (embErr) {
      console.error("[brain/knowledge/update] embedding failed:", embErr);
    }

    const corporateContext = buildReadableCorporateContext(nextDocs);
    return NextResponse.json({
      success: true,
      message: "Contexto actualizado correctamente",
      documents: nextDocs,
      corporateContext,
    });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[brain/knowledge/update]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
