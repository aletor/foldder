import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  aggregateVisualPatterns,
  createVisualLearningCandidates,
} from "@/lib/brain/brain-visual-analysis";
import { reanalyzeVisualReferencesAsync } from "@/lib/brain/brain-vision-analyze-async";
import { createDefaultBrainVisionProvider } from "@/lib/brain/brain-vision-providers-impl";
import { hydrateProjectAssetsForBrainVision } from "@/lib/brain/brain-visual-assets-hydrate";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";
import { buildBrandVisualDnaFromVisualReferenceAnalysis } from "@/lib/brain/brain-brand-visual-dna-synthesis";
import { getBrainVersion } from "@/lib/brain/brain-meta";

export const runtime = "nodejs";

/**
 * Reanaliza referencias visuales con visión real (Gemini / OpenAI) cuando hay API keys,
 * o heurística mock si no. El cliente debe fusionar `visualReferenceAnalysis` en `metadata.assets`.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as { projectId?: string; assets?: unknown };
    const projectId = body.projectId?.trim() ?? "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    let assets = normalizeProjectAssets(body.assets ?? {});
    assets = await hydrateProjectAssetsForBrainVision(assets);
    const provider = createDefaultBrainVisionProvider();
    try {
      if (provider.id === "openai-vision") {
        await assertApiServiceEnabled("openai-vision-analysis");
      } else if (provider.id === "gemini-vision") {
        await assertApiServiceEnabled("gemini-vision-analysis");
      }
    } catch (e) {
      if (e instanceof ApiServiceDisabledError) {
        return NextResponse.json({ error: `API bloqueada en admin: ${e.label}` }, { status: 423 });
      }
      throw e;
    }

    const debug = Boolean((body as { debug?: boolean }).debug);
    const { layer, providerId, diagnostics } = await reanalyzeVisualReferencesAsync(projectId, assets, {
      userEmail: session.user.email ?? undefined,
      route: "/api/spaces/brain/visual/reanalyze",
      provider, // mismo que el comprobado con `assertApiServiceEnabled`
      debug,
    });
    const analyses = layer.analyses;
    const aggregated = layer.aggregated ?? aggregateVisualPatterns(analyses);
    const candidates = createVisualLearningCandidates(projectId, analyses, aggregated);
    const candidatesCreated = candidates.length;
    const brainVersion = getBrainVersion(assets.brainMeta);
    const brandVisualDna = buildBrandVisualDnaFromVisualReferenceAnalysis(
      { ...layer, aggregated },
      { brainVersion },
    );
    if (diagnostics?.length) {
      for (const row of diagnostics) {
        row.candidatesCreated = candidatesCreated;
      }
    }
    return NextResponse.json({
      visualReferenceAnalysis: { ...layer, aggregated },
      brandVisualDna: brandVisualDna ?? undefined,
      candidates,
      provider: providerId,
      ...(debug && diagnostics?.length
        ? { diagnostics, batch: { candidatesCreated } }
        : debug
          ? { diagnostics: [], batch: { candidatesCreated } }
          : {}),
    });
  } catch (e) {
    console.error("[brain/visual/reanalyze]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
