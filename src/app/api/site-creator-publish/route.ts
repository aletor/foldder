import { NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { materializeSiteCreatorPublishImages } from "@/app/spaces/site-creator/site-creator-publish-images";
import {
  applyPublishedAssetHrefs,
  type PublishImageRef,
} from "@/app/spaces/site-creator/site-creator-publish-placeholders";
import {
  createPublishedSiteId,
  deletePublishedSite,
  isValidPublishedSiteId,
  publicSitePath,
  writePublishedSite,
  type PublishedSiteFile,
} from "@/lib/site-creator-publish-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_TEXT_FILE_CHARS = 2_000_000;
const MAX_IMAGE_REFS = 200;

type PublishBody = {
  siteId?: string;
  html?: string;
  css?: string;
  js?: string;
  imageRefs?: PublishImageRef[];
};

function parseImageRefs(value: unknown): PublishImageRef[] | null {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_IMAGE_REFS) return null;
  const refs: PublishImageRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const rec = item as PublishImageRef;
    if (typeof rec.layerId !== "string" || !rec.layerId.trim()) return null;
    const s3Key =
      typeof rec.s3Key === "string" && rec.s3Key.trim() && !rec.s3Key.includes("..")
        ? rec.s3Key.trim()
        : undefined;
    const src = typeof rec.src === "string" && rec.src.trim() ? rec.src.trim() : undefined;
    refs.push({
      layerId: rec.layerId,
      s3Key,
      src,
      alreadyOptimized: rec.alreadyOptimized === true,
    });
  }
  return refs;
}

function parseTextFile(value: unknown, label: string): string | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_TEXT_FILE_CHARS) {
    throw new Error(`${label} demasiado grande para publicar.`);
  }
  return value;
}

export async function POST(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const body = (await req.json()) as PublishBody;
    const html = parseTextFile(body.html, "HTML");
    const css = parseTextFile(body.css, "CSS");
    const js = parseTextFile(body.js, "JS");
    if (html == null || css == null || js == null) {
      return NextResponse.json({ error: "Faltan HTML, CSS o JS compilados." }, { status: 400 });
    }
    const refs = parseImageRefs(body.imageRefs);
    if (!refs) {
      return NextResponse.json({ error: "Lista de imágenes no válida." }, { status: 400 });
    }

    const siteId =
      typeof body.siteId === "string" && isValidPublishedSiteId(body.siteId)
        ? body.siteId
        : createPublishedSiteId();

    const images = await materializeSiteCreatorPublishImages(refs);
    const htmlWithAssets = applyPublishedAssetHrefs(html, images.hrefByLayerId);

    const files: PublishedSiteFile[] = [
      ...images.files,
      {
        relativePath: "styles.css",
        body: Buffer.from(css, "utf8"),
        contentType: "text/css; charset=utf-8",
      },
      {
        relativePath: "script.js",
        body: Buffer.from(js, "utf8"),
        contentType: "text/javascript; charset=utf-8",
      },
      {
        relativePath: "index.html",
        body: Buffer.from(htmlWithAssets, "utf8"),
        contentType: "text/html; charset=utf-8",
      },
    ];

    const written = await writePublishedSite(siteId, files);
    const publishedAt = new Date().toISOString();
    const publicPath = publicSitePath(siteId);

    return NextResponse.json({
      siteId,
      publicPath,
      publishedAt,
      fileCount: written.fileCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo publicar el sitio.";
    console.error("[site-creator-publish][POST]", error);
    const status =
      message.includes("No se pudo copiar") ||
      message.includes("No se pudo optimizar") ||
      message.includes("no válido") ||
      message.includes("no permitido") ||
      message.includes("demasiado grande")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId") || "";
    if (!isValidPublishedSiteId(siteId)) {
      return NextResponse.json({ error: "siteId no válido." }, { status: 400 });
    }
    const deletedCount = await deletePublishedSite(siteId);
    return NextResponse.json({ ok: true, deletedCount });
  } catch (error) {
    console.error("[site-creator-publish][DELETE]", error);
    return NextResponse.json({ error: "No se pudo despublicar el sitio." }, { status: 500 });
  }
}
