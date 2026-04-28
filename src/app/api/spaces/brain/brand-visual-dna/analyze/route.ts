import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { hydrateProjectAssetsForBrainVision } from "@/lib/brain/brain-visual-assets-hydrate";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import { analyzeBrandImageSet } from "@/lib/brain/brand-visual-dna/analyze-brand-image-set";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as {
      projectId?: string;
      assets?: unknown;
      brandName?: string;
      imageIds?: string[];
      maxClusters?: number;
    };
    const projectId = body.projectId?.trim() ?? "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    let assets = normalizeProjectAssets(body.assets ?? {});
    assets = await hydrateProjectAssetsForBrainVision(assets);

    const refs = collectVisualImageAssetRefs(assets);
    let images = refs
      .map((r) => ({ id: r.id, imageUrl: r.imageUrlForVision?.trim() ?? "" }))
      .filter((x) => x.imageUrl.startsWith("data:image") || /^https:\/\//i.test(x.imageUrl));

    if (Array.isArray(body.imageIds) && body.imageIds.length) {
      const allow = new Set(body.imageIds.map((x) => String(x).trim()).filter(Boolean));
      images = images.filter((im) => allow.has(im.id));
    }

    if (!images.length) {
      return NextResponse.json(
        { error: "No hay imágenes con URL https o data URL utilizable para el análisis técnico." },
        { status: 400 },
      );
    }

    const result = await analyzeBrandImageSet(images, {
      brandName: typeof body.brandName === "string" && body.brandName.trim() ? body.brandName.trim() : "Marca",
      maxClusters: typeof body.maxClusters === "number" && body.maxClusters > 0 ? body.maxClusters : undefined,
      userEmail: session.user.email ?? undefined,
      route: "/api/spaces/brain/brand-visual-dna/analyze",
    });

    return NextResponse.json({
      bundle: result.bundle,
      warnings: result.warnings,
      failedImages: result.failedImages,
      clusterCount: result.clusters.length,
    });
  } catch (e) {
    console.error("[brand-visual-dna/analyze]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
