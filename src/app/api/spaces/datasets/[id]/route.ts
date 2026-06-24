import { NextResponse } from "next/server";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import {
  DatasetVersionConflictError,
  datasetConsumerCount,
  deleteGlobalDataset,
  getGlobalDataset,
  upsertGlobalDataset,
} from "@/lib/dataset-store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

function isDataset(value: unknown): value is Dataset {
  if (!value || typeof value !== "object") return false;
  const row = value as Dataset & { schema?: unknown; cards?: unknown };
  return typeof row.id === "string" && typeof row.name === "string";
}

type RouteContext = { params: Promise<{ id: string }> };

/** GET — Dataset global por id (referencia viva). */
export async function GET(req: Request, context: RouteContext) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const { id } = await context.params;
    const dataset = await getGlobalDataset(authState.user.email, id);
    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }
    return NextResponse.json({
      dataset,
      consumerCount: datasetConsumerCount(dataset),
      consumerProjectIds: dataset.consumerProjectIds,
    });
  } catch (error) {
    console.error("[datasets/[id]][GET] failed:", error);
    return NextResponse.json({ error: "Failed to read dataset" }, { status: 500 });
  }
}

type PutBody = {
  dataset?: unknown;
  expectedVersion?: unknown;
};

/** PUT — guarda cambios en un Dataset global (optimistic lock opcional por version). */
export async function PUT(req: Request, context: RouteContext) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const { id } = await context.params;
    const body = (await req.json()) as PutBody;
    if (!isDataset(body.dataset) || body.dataset.id !== id) {
      return NextResponse.json({ error: "dataset.id must match route id" }, { status: 400 });
    }

    const expectedVersion =
      typeof body.expectedVersion === "number" && Number.isFinite(body.expectedVersion)
        ? body.expectedVersion
        : null;

    const saved = await upsertGlobalDataset(authState.user.email, {
      ...body.dataset,
      scope: "global",
      projectId: undefined,
    }, { expectedVersion });

    return NextResponse.json({
      dataset: saved,
      consumerCount: datasetConsumerCount(saved),
      consumerProjectIds: saved.consumerProjectIds,
    });
  } catch (error) {
    if (error instanceof DatasetVersionConflictError) {
      return NextResponse.json(
        {
          error: "Dataset version conflict",
          datasetId: error.datasetId,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        },
        { status: 409 },
      );
    }
    console.error("[datasets/[id]][PUT] failed:", error);
    return NextResponse.json({ error: "Failed to save dataset" }, { status: 500 });
  }
}

/** DELETE — elimina un Dataset global (solo si no tiene consumidores). */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const { id } = await context.params;
    const existing = await getGlobalDataset(authState.user.email, id);
    if (!existing) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }
    if (existing.consumerProjectIds.length > 1) {
      return NextResponse.json(
        { error: "Cannot delete: dataset is consumed by multiple projects" },
        { status: 409 },
      );
    }

    await deleteGlobalDataset(authState.user.email, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[datasets/[id]][DELETE] failed:", error);
    return NextResponse.json({ error: "Failed to delete dataset" }, { status: 500 });
  }
}
