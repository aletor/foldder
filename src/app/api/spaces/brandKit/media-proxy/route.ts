import { NextRequest, NextResponse } from "next/server";
import { assertPublicHttpUrl, SsrfBlockedUrlError } from "@/lib/ssrf-url-guard";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { fetchRemoteImageBuffer } from "@/lib/brandkit/brand-kit-remote-image";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const ONE_HOUR = 3600;

export async function GET(req: NextRequest) {
  const authState = await requireSpacesAuthUser(req);
  if (!authState.ok) return authState.response;

  const rawUrl = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }

  try {
    await assertPublicHttpUrl(rawUrl);
  } catch (error) {
    const message = error instanceof SsrfBlockedUrlError ? error.message : "URL bloqueada";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const fetched = await fetchRemoteImageBuffer(rawUrl);
  if (!fetched) {
    return NextResponse.json({ error: "Upstream fetch failed." }, { status: 502 });
  }

  const { buffer, contentType } = fetched;
  if (!buffer.length) {
    return NextResponse.json({ error: "Empty image." }, { status: 404 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Cache-Control": `private, max-age=${ONE_HOUR}`,
      "Content-Type": contentType,
    },
  });
}
