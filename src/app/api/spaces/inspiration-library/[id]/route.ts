import { NextResponse } from "next/server";
import {
  deleteInspirationLibraryItem,
  getInspirationBrandKit,
  getInspirationFlow,
  getInspirationTemplatePages,
} from "@/lib/inspiration-library-store";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — carga útil: páginas Designer, flujo o BrandKit. */
export async function GET(req: Request, context: RouteContext) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const { id } = await context.params;

    const pages = await getInspirationTemplatePages(authState.user.email, id);
    if (pages) {
      return NextResponse.json({ pages });
    }
    const flow = await getInspirationFlow(authState.user.email, id);
    if (flow) {
      return NextResponse.json({ flow });
    }
    const brandKit = await getInspirationBrandKit(authState.user.email, id);
    if (brandKit) {
      return NextResponse.json({ brandKit });
    }
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  } catch (error) {
    console.error("[inspiration-library/[id]][GET] failed:", error);
    return NextResponse.json({ error: "Failed to read inspiration item" }, { status: 500 });
  }
}

/** DELETE — elimina un item de la librería. */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const { id } = await context.params;
    const ok = await deleteInspirationLibraryItem(authState.user.email, id);
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[inspiration-library/[id]][DELETE] failed:", error);
    return NextResponse.json({ error: "Failed to delete inspiration item" }, { status: 500 });
  }
}
