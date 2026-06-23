import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  ApiServiceDisabledError,
  assertApiServiceEnabled,
} from "@/lib/api-usage-controls";
import { ForbiddenMediaReferenceError } from "@/lib/api-media-access";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { resolveLayerizerMaster } from "@/lib/layerizer/layerizer-master";
import { getLayerizerProvider } from "@/lib/layerizer/layerizer-providers";
import type { SamPrompt } from "@/app/spaces/layerizer/layerizer-types";

export const maxDuration = 60;

/**
 * Preview de máscara de selección (Estado 2, pre-pago, sin cargo al wallet).
 *
 * Request:  { image: string; prompt: SamPrompt }
 * Response: { maskDataUrl: string; bbox: [x,y,w,h] }
 *
 * Con FAL_KEY usa SAM 3 (pixel-exacto). Sin ella, el fallback (Replicate matting sobre
 * el bbox) devuelve una silueta aproximada. El preview en vivo por websocket
 * (fal.realtime.connect) es una optimización futura; FAL_KEY nunca llega al cliente.
 */
export async function POST(req: NextRequest) {
  try {
    await assertApiServiceEnabled("layerizer-segment");
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = await req.json().catch(() => ({}));
    const image = typeof body?.image === "string" ? body.image.trim() : "";
    const prompt = body?.prompt as SamPrompt | undefined;
    if (!image) {
      return NextResponse.json({ error: "Missing image input" }, { status: 400 });
    }
    if (!prompt || typeof prompt.kind !== "string") {
      return NextResponse.json({ error: "Missing SAM prompt" }, { status: 400 });
    }

    const master = await resolveLayerizerMaster(authState.user.email, image);
    const meta = await sharp(master.buffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) {
      return NextResponse.json({ error: "Could not read image dimensions" }, { status: 400 });
    }

    const provider = getLayerizerProvider();
    const result = await provider.previewMask({ master: master.buffer, width, height, prompt });
    return NextResponse.json({ maskDataUrl: result.maskDataUrl, bbox: result.bbox });
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (error instanceof ForbiddenMediaReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
