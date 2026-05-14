import { NextRequest, NextResponse } from "next/server";
import { recordApiUsage } from "@/lib/api-usage";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";

const BEE_BASE = "https://api.beeble.ai/v1";

async function proxyRequest(req: NextRequest, pathSegments: string[]) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    await assertApiServiceEnabled("beeble-api");

    const subpath = pathSegments.join("/");
    if (!subpath) {
      return NextResponse.json({ error: "Missing Beeble path" }, { status: 400 });
    }

    const targetUrl = `${BEE_BASE}/${subpath}${req.nextUrl.search}`;
    const headerKey = (
      req.headers.get("x-api-key") ||
      req.headers.get("x-beeble-api-key") ||
      ""
    ).trim();
    const apiKey = headerKey || process.env.BEEBLE_API_KEY || "";

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Falta API key Beeble: cabecera x-api-key o variable BEEBLE_API_KEY en el servidor.",
        },
        { status: 401 },
      );
    }

    const headers: Record<string, string> = {
      "x-api-key": apiKey,
    };

    let body: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const ct = req.headers.get("content-type");
      if (ct) headers["Content-Type"] = ct;
      body = await req.arrayBuffer();
    }

    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    });

    const outCt = res.headers.get("content-type") || "application/json";
    const text = await res.text();
    const reqBytes = body?.byteLength ?? 0;
    const respBytes = Buffer.byteLength(text, "utf8");
    await recordApiUsage({
      provider: "beeble",
      userEmail: authState.user.email,
      serviceId: "beeble-api",
      route: "/api/beeble/[...path]",
      operation: req.method.toLowerCase(),
      costIsKnown: false,
      costUsd: 0,
      bytes: reqBytes + respBytes,
      metadata: { subpath, upstreamStatus: res.status },
    });
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": outCt,
      },
    });
  } catch (error) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    console.error("[beeble/proxy]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Beeble proxy failed" },
      { status: 500 },
    );
  }
}

type RouteCtx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path ?? []);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path ?? []);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path ?? []);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path ?? []);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path ?? []);
}
