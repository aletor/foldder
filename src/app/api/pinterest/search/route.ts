import { NextResponse } from "next/server";
import { extractBestPinterestImageUrl } from "@/lib/pinterest-pin-media";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

const PINTEREST_API = "https://api.pinterest.com/v5";

export type PinterestPinResult = {
  id: string;
  imageUrl: string;
  title?: string;
  link?: string;
};

function normalizePins(items: unknown[]): PinterestPinResult[] {
  const out: PinterestPinResult[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const pin = raw as Record<string, unknown>;
    const id = typeof pin.id === "string" ? pin.id : String(pin.id ?? "");
    const imageUrl = extractBestPinterestImageUrl(pin);
    if (!id || !imageUrl) continue;
    const title = typeof pin.title === "string" ? pin.title : undefined;
    const link = typeof pin.link === "string" ? pin.link : undefined;
    out.push({ id, imageUrl, title, link });
  }
  return out;
}

/**
 * 1) `/search/partner/pins` — búsqueda por término (beta, según app).
 * 2) Si falla o no hay items: `/search/pins` — pins del usuario que coincidan con la query.
 */
export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    await assertApiServiceEnabled("pinterest-search");
    const usageUserEmail = authState.user.email;
    const token = process.env.PINTEREST_ACCESS_TOKEN?.trim();
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Falta PINTEREST_ACCESS_TOKEN en el servidor. Crea una app en developers.pinterest.com, OAuth y pega el token de acceso.",
        },
        { status: 503 }
      );
    }

    let body: { query?: string; limit?: number };
    try {
      body = (await req.json()) as { query?: string; limit?: number };
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query requerido" }, { status: 400 });
    }

    const limit = Math.min(Math.max(Number(body.limit) || 4, 1), 10);
    const headers = { Authorization: `Bearer ${token}` };

    const fetchPartner = () => {
      const u = new URL(`${PINTEREST_API}/search/partner/pins`);
      u.searchParams.set("term", query);
      u.searchParams.set("result_limit", String(limit));
      return fetch(u.toString(), { headers, cache: "no-store" });
    };

    const fetchUserPins = () => {
      const u = new URL(`${PINTEREST_API}/search/pins`);
      u.searchParams.set("query", query);
      u.searchParams.set("page_size", String(limit));
      return fetch(u.toString(), { headers, cache: "no-store" });
    };

    let items: unknown[] = [];
    let source: "partner" | "user_pins" = "partner";

    const partnerRes = await fetchPartner();
    await recordApiUsage({
      provider: "pinterest",
      userEmail: usageUserEmail,
      serviceId: "pinterest-search",
      route: "/api/pinterest/search",
      operation: "search_partner_pins",
      costIsKnown: false,
      costUsd: 0,
      metadata: { httpStatus: partnerRes.status },
    });
    if (partnerRes.ok) {
      const j = (await partnerRes.json()) as { items?: unknown[] };
      items = Array.isArray(j.items) ? j.items : [];
    } else {
      const t = await partnerRes.text().catch(() => "");
      console.warn("[pinterest/search] partner:", partnerRes.status, t.slice(0, 240));
    }

    if (items.length === 0) {
      const userRes = await fetchUserPins();
      await recordApiUsage({
        provider: "pinterest",
        userEmail: usageUserEmail,
        serviceId: "pinterest-search",
        route: "/api/pinterest/search",
        operation: "search_user_pins",
        costIsKnown: false,
        costUsd: 0,
        metadata: { httpStatus: userRes.status },
      });
      if (!userRes.ok) {
        const errText = await userRes.text().catch(() => "");
        let msg = `Pinterest API ${userRes.status}`;
        try {
          const j = JSON.parse(errText) as { message?: string };
          if (typeof j.message === "string") msg = j.message;
        } catch {
          if (errText) msg = errText.slice(0, 200);
        }
        return NextResponse.json({ error: msg }, { status: userRes.status >= 400 ? userRes.status : 502 });
      }
      const j = (await userRes.json()) as { items?: unknown[] };
      items = Array.isArray(j.items) ? j.items : [];
      source = "user_pins";
    }

    const pins = normalizePins(items).slice(0, limit);

    return NextResponse.json({
      pins,
      source,
      hint:
        source === "user_pins"
          ? "Resultados de tus pins guardados que coincidan con la búsqueda. La búsqueda global requiere acceso Partner en Pinterest."
          : undefined,
    });
  } catch (e) {
    if (e instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${e.label}` },
        { status: 423 },
      );
    }
    console.error("[pinterest/search]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
