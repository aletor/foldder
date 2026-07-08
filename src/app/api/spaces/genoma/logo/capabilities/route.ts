import { NextRequest, NextResponse } from "next/server";
import { resolveLogoVectorizeCapabilities } from "@/lib/genoma/logo-intake/vectorize-capabilities";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSpacesAuthUser(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json(resolveLogoVectorizeCapabilities());
}
