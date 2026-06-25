import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  createPopulateShare,
  findPopulateShareByToken,
  listPopulateShares,
  updatePopulateShare,
} from "@/lib/populate-share-db";
import type { PopulateSharePayload, PopulateShareRecord } from "@/lib/populate-share-types";
import { DEFAULT_POPULATE_SHARE_OPTIONS } from "@/lib/populate-share-types";

const LIST_CACHE_TTL_MS = 1500;
const listCache = new Map<string, { expiresAt: number; links: unknown[] }>();

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
  const baseOk =
    typeof p.title === "string" &&
    typeof p.promptTemplate === "string" &&
    p.formModel != null &&
    typeof p.formModel === "object" &&
    p.templateModel != null &&
    typeof p.templateModel === "object" &&
    typeof p.fixedRefUrls === "object" &&
    Array.isArray(p.imageInputs);
  if (!baseOk) return false;
  if (p.designer != null) {
    return Array.isArray(p.designer.pages) && Array.isArray(p.designer.formFields);
  }
  return true;
}

/** ¿El payload tiene contenido suficiente para generar (variables de imagen o campos Designer)? */
function payloadHasContent(p: PopulateSharePayload): boolean {
  if (p.designer != null) return p.designer.formFields.length > 0;
  return !p.formModel.empty;
}

/** GET ?shareKey= — lista enlaces de un nodo Populate. */
export async function GET(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const { searchParams } = new URL(req.url);
    const shareKey = searchParams.get("shareKey") || "";
    if (!shareKey.trim()) {
      return NextResponse.json({ error: "shareKey required" }, { status: 400 });
    }

    const cacheKey = shareKey.trim();
    const now = Date.now();
    const cached = listCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ links: cached.links });
    }

    const list = await listPopulateShares(shareKey);
    const safe = list.map((r) => ({
      id: r.id,
      token: r.token,
      shareKey: r.shareKey,
      populateNodeId: r.populateNodeId,
      name: r.name,
      slug: r.slug,
      visits: r.visits,
      generations: r.generations,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      options: r.options,
    }));
    listCache.set(cacheKey, { links: safe, expiresAt: now + LIST_CACHE_TTL_MS });
    return NextResponse.json({ links: safe });
  } catch (error) {
    console.error("[populate-share][GET] failed:", error);
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}

type PostBody = {
  shareKey: string;
  populateNodeId: string;
  name: string;
  slug?: string;
  /** Si existe, actualiza la instantánea del enlace en lugar de crear uno nuevo. */
  existingToken?: string;
  options?: Partial<PopulateShareRecord["options"]>;
  payload: PopulateSharePayload;
};

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PostBody;
    if (!body.shareKey || typeof body.shareKey !== "string") {
      return NextResponse.json({ error: "shareKey required" }, { status: 400 });
    }
    if (!body.populateNodeId || typeof body.populateNodeId !== "string") {
      return NextResponse.json({ error: "populateNodeId required" }, { status: 400 });
    }
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!isValidPayload(body.payload)) {
      return NextResponse.json({ error: "payload invalid" }, { status: 400 });
    }
    if (!payloadHasContent(body.payload)) {
      return NextResponse.json(
        { error: "El formulario no tiene campos. Inserta variables o marca campos dinámicos primero." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const options = {
      ...DEFAULT_POPULATE_SHARE_OPTIONS,
      ...body.options,
      autoDisableAt: body.options?.autoDisableAt ?? null,
    };

    const existingToken = body.existingToken?.trim();
    if (existingToken) {
      const existing = await findPopulateShareByToken(existingToken);
      if (!existing) {
        return NextResponse.json({ error: "Enlace no encontrado" }, { status: 404 });
      }
      if (existing.ownerEmail !== authState.user.email) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      const updated = await updatePopulateShare(existingToken, {
        name: body.name.trim(),
        options,
        payload: body.payload,
        updatedAt: now,
      });
      if (!updated) {
        return NextResponse.json({ error: "Enlace no encontrado" }, { status: 404 });
      }
      listCache.clear();
      return NextResponse.json({
        link: {
          id: updated.id,
          token: updated.token,
          slug: updated.slug,
          name: updated.name,
          visits: updated.visits,
          generations: updated.generations,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      });
    }

    const token = randomToken();
    const baseSlug = slugifyBase(body.slug?.trim() || body.name);
    const slug = `${baseSlug}-${token.slice(0, 6)}`;

    const record: PopulateShareRecord = {
      id: uuidv4(),
      token,
      shareKey: body.shareKey,
      populateNodeId: body.populateNodeId,
      ownerEmail: authState.user.email,
      name: body.name.trim(),
      slug,
      options,
      payload: body.payload,
      createdAt: now,
      updatedAt: now,
      visits: 0,
      generations: 0,
    };

    await createPopulateShare(record);
    listCache.clear();

    return NextResponse.json({
      link: {
        id: record.id,
        token: record.token,
        slug: record.slug,
        name: record.name,
        visits: record.visits,
        generations: record.generations,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
  } catch (e) {
    console.error("[populate-share][POST] failed:", e);
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}
