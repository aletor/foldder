import { NextRequest, NextResponse } from "next/server";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_MODEL = "gemini-2.5-flash";
const ROUTE = "/api/gemini/resolve-correction-dependency";

function safeModel(model: unknown): string {
  const value = typeof model === "string" ? model.trim() : "";
  if (!value) return DEFAULT_MODEL;
  if (value.toLowerCase().includes("pro")) return DEFAULT_MODEL;
  return value;
}

function cleanText(value: unknown, max = 2_000): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text.length > max ? text.slice(0, max) : text;
}

function extractText(data: unknown): string {
  const candidate = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return candidate.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text?.trim() ?? "";
}

function buildPrompt(args: {
  dependencyInstruction: string;
  dependencyZoneDescription: string;
  modifierInstruction: string;
  modifierZoneDescription: string;
}): string {
  return [
    "You resolve dependent image-edit instructions for a single non-destructive image generation pass.",
    "Combine the original intent and the modifying instruction into one natural final instruction.",
    "The modifier overrides conflicting details from the original. Keep all non-conflicting original details.",
    "Return ONLY the resolved instruction. Max 80 words. Be concrete, visual and production-ready.",
    "",
    `Original intent: ${args.dependencyInstruction}`,
    `Original zone: ${args.dependencyZoneDescription || "unspecified marked zone"}`,
    "",
    `Modification: ${args.modifierInstruction}`,
    `Modifier zone: ${args.modifierZoneDescription || "overlapping marked zone"}`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled("gemini-analyze");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = await req.json();
    const model = safeModel(body?.model);
    const dependencyInstruction = cleanText(body?.dependencyInstruction);
    const dependencyZoneDescription = cleanText(body?.dependencyZoneDescription);
    const modifierInstruction = cleanText(body?.modifierInstruction);
    const modifierZoneDescription = cleanText(body?.modifierZoneDescription);
    const requestId = cleanText(body?.requestId, 160);

    if (!dependencyInstruction) return NextResponse.json({ error: "dependencyInstruction required" }, { status: 400 });
    if (!modifierInstruction) return NextResponse.json({ error: "modifierInstruction required" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key not configured" }, { status: 500 });

    const prompt = buildPrompt({
      dependencyInstruction,
      dependencyZoneDescription,
      modifierInstruction,
      modifierZoneDescription,
    });
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 220,
          temperature: 0.1,
        },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const data = await response.json();
    if (!response.ok || data?.error) {
      const message = data?.error?.message || `Gemini dependency resolution failed (${response.status})`;
      return NextResponse.json({ error: message }, { status: response.ok ? 500 : response.status });
    }

    const resolvedInstruction = extractText(data);
    if (!resolvedInstruction) return NextResponse.json({ error: "No text response from Gemini" }, { status: 500 });

    const usage = parseGeminiUsageMetadata(data);
    await recordApiUsage({
      provider: "gemini",
      userEmail: authState.user.email,
      serviceId: "gemini-analyze",
      route: ROUTE,
      model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      costIsKnown: Boolean(usage),
      costUsd: usage ? undefined : 0.001,
      note: usage ? undefined : `dependency resolver estimate ${requestId}`,
    });

    return NextResponse.json({ model, resolvedInstruction });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json({ error: `API bloqueada en admin: ${error.label}` }, { status: 423 });
    }
    const message = error instanceof Error ? error.message : "dependency_resolution_failed";
    console.error("[gemini/resolve-correction-dependency]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
