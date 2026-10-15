import { NextResponse } from "next/server";
import { getPresignedUrl, s3ObjectExists } from "@/lib/s3-utils";

export const runtime = "nodejs";

const HERO_FILES = [
  "trusted-access.mp4",
  "video-post-oaro-3.mp4",
  "oaro-id-secure.mp4",
  "der2.mp4",
  "main.mp4",
] as const;

type HeroFile = (typeof HERO_FILES)[number];

function isHeroFile(value: string): value is HeroFile {
  return (HERO_FILES as readonly string[]).includes(value);
}

function marketingHeroObjectKey(file: HeroFile): string {
  return `marketing/home-v2/hero/${file}`;
}

/**
 * El mp4 sale de S3 cuando el objeto ya existe.
 * La home sigue en `/home-v2/hero/` hasta esa subida: si no, cada reproducción
 * pagaría una Function para acabar sirviendo el mismo archivo estático.
 */
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!isHeroFile(file)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const key = marketingHeroObjectKey(file);
  try {
    if (await s3ObjectExists(key)) {
      const signed = await getPresignedUrl(key, 3600);
      return new NextResponse(null, {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=600",
          Location: signed,
        },
      });
    }
  } catch (error) {
    console.warn("[home-media] S3 redirect failed; using static file.", error);
  }

  return NextResponse.redirect(new URL(`/home-v2/hero/${file}`, req.url), 302);
}
