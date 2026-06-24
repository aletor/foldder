import { NextResponse } from "next/server";
import { registerDatasetConsumers } from "@/lib/dataset-store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

type PostBody = {
  projectId?: unknown;
  datasetIds?: unknown;
};

/** POST — registra qué proyecto consume qué Datasets globales (referencia viva). */
export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PostBody;
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const datasetIds = Array.isArray(body.datasetIds)
      ? body.datasetIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (!datasetIds.length) {
      return NextResponse.json({ ok: true, registered: 0 });
    }

    await registerDatasetConsumers(authState.user.email, projectId, datasetIds);
    return NextResponse.json({ ok: true, registered: datasetIds.length });
  } catch (error) {
    console.error("[datasets/consumers][POST] failed:", error);
    return NextResponse.json({ error: "Failed to register dataset consumers" }, { status: 500 });
  }
}
