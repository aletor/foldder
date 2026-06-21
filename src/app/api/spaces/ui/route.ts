import { NextResponse } from "next/server";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { updateSpacesV2ProjectUi } from "@/lib/spaces-v2-store";

export const runtime = "nodejs";

const SPACES_V2_DDB_TABLE_ENV = "FOLDDER_SPACES_V2_DDB_TABLE";
const MAX_UI_BYTES = 16_000;

type UiPatchBody = {
  id?: unknown;
  ui?: unknown;
};

function spacesV2TableName(): string {
  return process.env[SPACES_V2_DDB_TABLE_ENV]?.trim() || "";
}

function numberOrUndefined(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value * 1000) / 1000));
}

function stringOrUndefined(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function sanitizeUiSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const canvasBgId = stringOrUndefined(source.canvasBgId, 80);
  if (canvasBgId) out.canvasBgId = canvasBgId;

  if (source.canvasViewMode === "free" || source.canvasViewMode === "cards") {
    out.canvasViewMode = source.canvasViewMode;
  }

  const cardsFocusIndex = numberOrUndefined(source.cardsFocusIndex, 0, 10_000);
  if (cardsFocusIndex != null) out.cardsFocusIndex = Math.floor(cardsFocusIndex);

  const viewport = source.viewport;
  if (viewport && typeof viewport === "object" && !Array.isArray(viewport)) {
    const vp = viewport as Record<string, unknown>;
    out.viewport = {
      x: numberOrUndefined(vp.x, -1_000_000, 1_000_000) ?? 0,
      y: numberOrUndefined(vp.y, -1_000_000, 1_000_000) ?? 0,
      zoom: numberOrUndefined(vp.zoom, 0.05, 4) ?? 0.7,
    };
  }

  if (Array.isArray(source.navigationStack)) {
    const stack = source.navigationStack
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(-24)
      .map((item) => item.slice(0, 140));
    if (stack.length) out.navigationStack = stack;
  }

  const activeSpaceId = stringOrUndefined(source.activeSpaceId, 140);
  if (activeSpaceId) out.activeSpaceId = activeSpaceId;
  if (typeof source.sidebarLockedCollapsed === "boolean") {
    out.sidebarLockedCollapsed = source.sidebarLockedCollapsed;
  }

  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_UI_BYTES) return null;
  return out;
}

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    if (!isDynamoEnabled(SPACES_V2_DDB_TABLE_ENV)) {
      return NextResponse.json({ error: "spaces_v2 is required for UI-only saves" }, { status: 409 });
    }

    const body = (await req.json().catch(() => null)) as UiPatchBody | null;
    const projectId = stringOrUndefined(body?.id, 140);
    if (!projectId) return NextResponse.json({ error: "project id required" }, { status: 400 });

    const ui = sanitizeUiSnapshot(body?.ui);
    if (!ui) return NextResponse.json({ error: "invalid ui snapshot" }, { status: 400 });

    const result = await updateSpacesV2ProjectUi(spacesV2TableName(), {
      ownerEmail: authState.user.email,
      projectId,
      ui,
    });
    if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      revision: result.revision,
    });
  } catch (error) {
    console.error("[spaces/ui] failed:", error);
    return NextResponse.json({ error: "Failed to save project UI" }, { status: 500 });
  }
}
