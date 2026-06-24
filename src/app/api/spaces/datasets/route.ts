import { NextResponse } from "next/server";
import { createDataset } from "@/app/spaces/dataset/dataset-logic";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { normalizeDataset, totalCardCount } from "@/app/spaces/dataset/dataset-migrate";
import {
  DatasetVersionConflictError,
  listGlobalDatasets,
  upsertGlobalDataset,
} from "@/lib/dataset-store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

function isDataset(value: unknown): value is Dataset {
  if (!value || typeof value !== "object") return false;
  const row = value as Dataset & { schema?: unknown; cards?: unknown };
  if (typeof row.id !== "string" || typeof row.name !== "string") return false;
  if (Array.isArray(row.lists)) {
    return row.lists.every(
      (list) =>
        list &&
        typeof list === "object" &&
        typeof (list as { id?: string }).id === "string" &&
        Array.isArray((list as { schema?: unknown }).schema) &&
        Array.isArray((list as { cards?: unknown }).cards),
    );
  }
  return Array.isArray(row.schema) && Array.isArray(row.cards);
}

/** GET — lista Datasets globales de la cuenta. */
export async function GET(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const rows = await listGlobalDatasets(authState.user.email);
    const datasets = rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      updatedAt: row.updatedAt,
      listCount: normalizeDataset(row).lists.length,
      cardCount: totalCardCount(row),
      constantCount: row.constants.fields.length,
      consumerCount: row.consumerProjectIds.length,
    }));
    return NextResponse.json({ datasets });
  } catch (error) {
    console.error("[datasets][GET] failed:", error);
    return NextResponse.json({ error: "Failed to list datasets" }, { status: 500 });
  }
}

type PostBody = {
  name?: unknown;
  dataset?: unknown;
};

/** POST — crea un Dataset global nuevo. */
export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PostBody;
    const seed = isDataset(body.dataset)
      ? body.dataset
      : createDataset(typeof body.name === "string" ? body.name : "Dataset", "global");
    const saved = await upsertGlobalDataset(authState.user.email, {
      ...seed,
      scope: "global",
      projectId: undefined,
    });
    return NextResponse.json({ dataset: saved });
  } catch (error) {
    console.error("[datasets][POST] failed:", error);
    return NextResponse.json({ error: "Failed to create dataset" }, { status: 500 });
  }
}
