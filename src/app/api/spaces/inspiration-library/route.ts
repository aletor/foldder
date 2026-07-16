import { NextResponse } from "next/server";
import {
  addInspirationLibraryItem,
  listInspirationLibraryItems,
  type AddInspirationLibraryInput,
  type InspirationLibraryItemKind,
} from "@/lib/inspiration-library-store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

/** GET — lista los items de la librería de Inspiración del usuario (solo metadatos). */
export async function GET(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const items = await listInspirationLibraryItems(authState.user.email);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[inspiration-library][GET] failed:", error);
    return NextResponse.json({ error: "Failed to list inspiration library" }, { status: 500 });
  }
}

type PostBody = {
  kind?: unknown;
  title?: unknown;
  thumbUrl?: unknown;
  thumbS3Key?: unknown;
  pages?: unknown;
  imageUrl?: unknown;
  imageS3Key?: unknown;
  width?: unknown;
  height?: unknown;
  flow?: unknown;
  brandKit?: unknown;
  completenessPercent?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveKind(value: unknown): InspirationLibraryItemKind {
  if (value === "image") return "image";
  if (value === "flow") return "flow";
  if (value === "brand-kit") return "brand-kit";
  return "designer-template";
}

/** POST — añade una plantilla Designer, imagen, flujo o BrandKit a la librería. */
export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PostBody;
    const kind = resolveKind(body.kind);

    const input: AddInspirationLibraryInput = {
      kind,
      title: asString(body.title) || "Sin título",
      thumbUrl: asString(body.thumbUrl),
      thumbS3Key: asString(body.thumbS3Key),
    };

    if (kind === "designer-template") {
      if (!asString(body.thumbUrl)) {
        return NextResponse.json({ error: "thumbUrl_required" }, { status: 400 });
      }
      if (!Array.isArray(body.pages) || body.pages.length === 0) {
        return NextResponse.json({ error: "pages_required" }, { status: 400 });
      }
      input.pages = body.pages;
    } else if (kind === "flow") {
      const flow = body.flow as { nodes?: unknown; edges?: unknown } | undefined;
      if (!flow || !Array.isArray(flow.nodes) || flow.nodes.length === 0) {
        return NextResponse.json({ error: "flow_required" }, { status: 400 });
      }
      input.flow = {
        nodes: flow.nodes,
        edges: Array.isArray(flow.edges) ? flow.edges : [],
      };
    } else if (kind === "brand-kit") {
      if (!body.brandKit || typeof body.brandKit !== "object") {
        return NextResponse.json({ error: "brandKit_required" }, { status: 400 });
      }
      input.brandKit = body.brandKit;
      input.completenessPercent =
        typeof body.completenessPercent === "number" ? body.completenessPercent : undefined;
    } else {
      if (!asString(body.thumbUrl)) {
        return NextResponse.json({ error: "thumbUrl_required" }, { status: 400 });
      }
      const imageUrl = asString(body.imageUrl);
      if (!imageUrl) {
        return NextResponse.json({ error: "imageUrl_required" }, { status: 400 });
      }
      input.imageUrl = imageUrl;
      input.imageS3Key = asString(body.imageS3Key);
      input.width = typeof body.width === "number" ? body.width : undefined;
      input.height = typeof body.height === "number" ? body.height : undefined;
    }

    const item = await addInspirationLibraryItem(authState.user.email, input);
    return NextResponse.json({ item });
  } catch (error) {
    console.error("[inspiration-library][POST] failed:", error);
    return NextResponse.json({ error: "Failed to save inspiration item" }, { status: 500 });
  }
}
