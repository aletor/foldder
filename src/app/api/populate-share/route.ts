import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  createPopulateShare,
  findPopulateShareByToken,
  updatePopulateShare,
} from "@/lib/populate-share-db";
import type { PopulateSharePayload, PopulateShareRecord } from "@/lib/populate-share-types";
import {
  DEFAULT_POPULATE_SHARE_OPTIONS,
  normalizePopulateShareTemplates,
} from "@/lib/populate-share-types";
import { newPopulateMatchId } from "@/lib/populate-match-id";

function slugifyBase(s: string): string {
  const t = s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return t.length > 0 ? t : "form";
}

function randomToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidPayload(payload: unknown): payload is PopulateSharePayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as PopulateSharePayload;
  return (
    typeof p.title === "string" &&
    typeof p.listId === "string" &&
    Array.isArray(p.rowsSnapshot) &&
    normalizePopulateShareTemplates(p).length > 0
  );
}

type PostBody = {
  shareKey?: string;
  populateNodeId: string;
  name: string;
  existingToken?: string;
  projectId?: string;
  matchLabel?: string;
  payload: PopulateSharePayload;
};

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PostBody;
    if (!body.populateNodeId || typeof body.populateNodeId !== "string") {
      return NextResponse.json({ error: "populateNodeId required" }, { status: 400 });
    }
    if (!isValidPayload(body.payload)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const shareKey = (body.shareKey || body.populateNodeId).trim();
    const now = new Date().toISOString();
    const projectId = body.projectId?.trim() || "";
    const matchLabel =
      body.matchLabel?.trim() || body.name?.trim() || body.payload.title?.trim() || "Partido";

    if (body.existingToken) {
      const existing = await findPopulateShareByToken(body.existingToken);
      if (existing && existing.shareKey === shareKey) {
        const updated = await updatePopulateShare(body.existingToken, {
          name: body.name?.trim() || existing.name,
          payload: body.payload,
          projectId: projectId || existing.projectId,
          matchLabel: matchLabel || existing.matchLabel,
          updatedAt: now,
        });
        return NextResponse.json({ token: updated?.token ?? body.existingToken });
      }
    }

    const token = randomToken();
    const row: PopulateShareRecord = {
      id: uuidv4(),
      token,
      shareKey,
      populateNodeId: body.populateNodeId,
      ownerEmail: authState.user.email,
      projectId,
      matchId: newPopulateMatchId(),
      matchLabel,
      name: body.name?.trim() || body.payload.title || "Populate",
      slug: slugifyBase(body.name || "populate"),
      options: { ...DEFAULT_POPULATE_SHARE_OPTIONS },
      payload: body.payload,
      createdAt: now,
      updatedAt: now,
      visits: 0,
      generations: 0,
    };
    await createPopulateShare(row);
    return NextResponse.json({ token });
  } catch (e) {
    console.error("[populate-share][POST] failed:", e);
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}
