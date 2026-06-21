import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import {
  createPresenterShare,
  listPresenterShares,
} from "@/lib/presenter-share-db";
import type { PresenterShareOptions, PresenterSharePayload, PresenterShareRecord } from "@/lib/presenter-share-types";
import { DEFAULT_PRESENTER_SHARE_OPTIONS } from "@/lib/presenter-share-types";

const PRESENTER_LIST_CACHE_TTL_MS = 1500;
const presenterListCache = new Map<string, { expiresAt: number; links: unknown[] }>();

function slugifyBase(s: string): string {
  const t = s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return t.length > 0 ? t : "deck";
}

function randomToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** GET ?deckKey= — lista enlaces de un deck. */
export async function GET(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const { searchParams } = new URL(req.url);
    const deckKey = searchParams.get("deckKey") || "";
    if (!deckKey.trim()) {
      return NextResponse.json(
        { error: "deckKey required for listing shares" },
        { status: 400 },
      );
    }
    const cacheKey = deckKey.trim() || "__all__";
    const now = Date.now();
    const cached = presenterListCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ links: cached.links });
    }

    const list = await listPresenterShares(deckKey || undefined);
    const safe = list.map((r) => ({
      id: r.id,
      token: r.token,
      deckKey: r.deckKey,
      deckTitle: r.deckTitle,
      name: r.name,
      slug: r.slug,
      visits: r.visits,
      createdAt: r.createdAt,
      options: r.options,
    }));
    presenterListCache.set(cacheKey, {
      links: safe,
      expiresAt: now + PRESENTER_LIST_CACHE_TTL_MS,
    });
    return NextResponse.json({ links: safe });
  } catch (error) {
    console.error("[presenter-share][GET] failed:", error);
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}

type PostBody = {
  deckKey: string;
  deckTitle?: string;
  name: string;
  slug?: string;
  options?: Partial<PresenterShareOptions>;
  payload: PresenterSharePayload;
};

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PostBody;
    if (!body.deckKey || typeof body.deckKey !== "string") {
      return NextResponse.json({ error: "deckKey required" }, { status: 400 });
    }
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    if (!body.payload?.pages || !Array.isArray(body.payload.pages)) {
      return NextResponse.json({ error: "payload.pages required" }, { status: 400 });
    }

    const token = randomToken();
    const baseSlug = slugifyBase(body.slug?.trim() || body.name);
    const slug = `${baseSlug}-${token.slice(0, 6)}`;

    const options: PresenterShareOptions = {
      ...DEFAULT_PRESENTER_SHARE_OPTIONS,
      ...body.options,
      passcodePlain: body.options?.passcodePlain ?? DEFAULT_PRESENTER_SHARE_OPTIONS.passcodePlain,
      autoDisableAt: body.options?.autoDisableAt ?? null,
    };

    const record: PresenterShareRecord = {
      id: uuidv4(),
      token,
      deckKey: body.deckKey,
      deckTitle: typeof body.deckTitle === "string" && body.deckTitle.trim() ? body.deckTitle.trim() : "Presentation",
      name: body.name.trim(),
      slug,
      options,
      payload: {
        pages: body.payload.pages,
        transitionsByPageId: body.payload.transitionsByPageId ?? {},
        imageVideoPlacements: Array.isArray(body.payload.imageVideoPlacements)
          ? body.payload.imageVideoPlacements
          : [],
      },
      createdAt: new Date().toISOString(),
      visits: 0,
    };

    await createPresenterShare(record);
    presenterListCache.clear();

    return NextResponse.json({
      link: {
        id: record.id,
        token: record.token,
        slug: record.slug,
        name: record.name,
        visits: record.visits,
        createdAt: record.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}
