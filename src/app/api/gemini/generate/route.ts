import { NextRequest, NextResponse } from "next/server";
import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export async function POST(req: NextRequest) {
  console.log("[Gemini REST] Request received");
  try {
    await assertApiServiceEnabled("gemini-nano");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const body = await req.json();
    const result = await geminiImageGenerate(body, undefined, {
      usageUserEmail: authState.user.email,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (error instanceof GeminiGenerateError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gemini REST] Exception:", message);
    return NextResponse.json({ error: `Server Exception: ${message}` }, { status: 500 });
  }
}
