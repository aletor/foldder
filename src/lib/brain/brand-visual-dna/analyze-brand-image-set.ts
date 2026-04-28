import { loadImageBufferFromUrl } from "./load-image-buffer";
import { extractTechnicalImageFeatures } from "./technical-features";
import { buildVisualFeatureEmbedding } from "./embedding";
import { clusterImagesByVisualFeatures } from "./cluster";
import { interpretClustersWithGemini } from "./gemini-cluster-interpreter";
import { assembleBrandVisualDnaRoot, mergeComputedClustersWithGemini } from "./assemble-brand-visual-dna";
import type {
  AnalyzeBrandImageSetInputImage,
  AnalyzeBrandImageSetOptions,
  AnalyzeBrandImageSetResult,
  BrandVisualDnaFailedImage,
  BrandVisualDnaImageEmbedding,
  BrandVisualDnaRawImageAnalysis,
  BrandVisualDnaStoredBundle,
} from "./types";

const PIPELINE_VERSION = "brand-visual-dna-1";

function failedRawAnalysis(image_id: string, err: string): BrandVisualDnaRawImageAnalysis {
  return {
    image_id,
    status: "failed",
    fallback_used: false,
    error: err.slice(0, 500),
    dominant_colors: ["#888888"],
    brightness_0_1: 0,
    contrast_0_1: 0,
    saturation_0_1: 0,
    text_presence_score_0_1: 0,
    human_presence_score_0_1: 0,
    product_presence_score_0_1: 0,
    composition_type: "unknown",
    orientation: "unknown",
    visual_density_0_1: 0,
    background_type: "unknown",
    object_category_hint: "unknown",
    width_px: 0,
    height_px: 0,
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Pipeline: features técnicas por imagen → embedding interno → clusters → IA solo sobre clusters (texto).
 * Si Gemini falla, se mantiene el análisis técnico y fichas de estilo fallback.
 */
export async function analyzeBrandImageSet(
  images: AnalyzeBrandImageSetInputImage[],
  options?: AnalyzeBrandImageSetOptions,
): Promise<AnalyzeBrandImageSetResult & { bundle: BrandVisualDnaStoredBundle }> {
  const warnings: string[] = [];
  const failedImages: BrandVisualDnaFailedImage[] = [];
  const rawImageAnalyses: BrandVisualDnaRawImageAnalysis[] = [];
  const imageEmbeddings: BrandVisualDnaImageEmbedding[] = [];

  const brandName = options?.brandName?.trim() || "Marca";

  for (const im of images) {
    const image_id = im.id?.trim() || "unknown";
    try {
      const buf = await loadImageBufferFromUrl(im.imageUrl);
      if (!buf) {
        const row = failedRawAnalysis(image_id, "No se pudo cargar la imagen (URL o data inválida).");
        rawImageAnalyses.push(row);
        failedImages.push({ image_id, error: row.error ?? "load_failed" });
        continue;
      }
      const feats = await extractTechnicalImageFeatures(image_id, buf);
      rawImageAnalyses.push({
        image_id,
        status: "analyzed",
        fallback_used: false,
        ...feats,
      });
      imageEmbeddings.push({
        image_id,
        model: "technical_embedding_v1",
        vector: buildVisualFeatureEmbedding({
          image_id,
          status: "analyzed",
          fallback_used: false,
          ...feats,
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const row = failedRawAnalysis(image_id, msg);
      rawImageAnalyses.push(row);
      failedImages.push({ image_id, error: msg.slice(0, 400) });
    }
  }

  const successful = rawImageAnalyses.filter((a) => a.status === "analyzed" || a.status === "fallback_used");
  if (!successful.length) {
    warnings.push("Sin imágenes analizables: no se pueden crear clusters.");
    const brandVisualDna = assembleBrandVisualDnaRoot({
      brandName,
      source_image_count: images.length,
      analyses: rawImageAnalyses,
      computedClusters: [],
      styleClusters: [],
      ai: null,
    });
    const bundle: BrandVisualDnaStoredBundle = {
      pipeline_version: PIPELINE_VERSION,
      analyzed_at: new Date().toISOString(),
      brand_visual_dna: brandVisualDna,
      rawImageAnalyses,
      imageEmbeddings,
      styleClusters: [],
      computed_clusters: [],
      warnings,
      failedImages,
    };
    return {
      rawImageAnalyses,
      imageEmbeddings,
      clusters: [],
      styleClusters: [],
      brandVisualDna,
      warnings,
      failedImages,
      bundle,
    };
  }

  const clusters = clusterImagesByVisualFeatures(successful, {
    maxClusters: options?.maxClusters ?? 5,
    totalSetCount: images.length,
  });

  if (!clusters.length) {
    warnings.push("Clustering vacío tras filtrar análisis.");
  }

  const analysesById = new Map(rawImageAnalyses.map((a) => [a.image_id, a]));

  let gemini: Awaited<ReturnType<typeof interpretClustersWithGemini>> = null;
  try {
    gemini = await interpretClustersWithGemini({
      computedClusters: clusters,
      analysesById,
      userEmail: options?.userEmail,
      route: options?.route,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`gemini_cluster_interpret_failed: ${msg.slice(0, 200)}`);
  }

  if (!gemini) {
    warnings.push("Interpretación por IA no disponible o inválida; usando solo agregados técnicos por cluster.");
  }

  const styleClusters = mergeComputedClustersWithGemini(clusters, gemini, analysesById);

  const brandVisualDna = assembleBrandVisualDnaRoot({
    brandName,
    source_image_count: images.length,
    analyses: rawImageAnalyses,
    computedClusters: clusters,
    styleClusters,
    ai: gemini,
  });

  const bundle: BrandVisualDnaStoredBundle = {
    pipeline_version: PIPELINE_VERSION,
    analyzed_at: new Date().toISOString(),
    brand_visual_dna: brandVisualDna,
    rawImageAnalyses,
    imageEmbeddings,
    styleClusters,
    computed_clusters: clusters,
    warnings,
    failedImages,
  };

  return {
    rawImageAnalyses,
    imageEmbeddings,
    clusters,
    styleClusters,
    brandVisualDna,
    warnings,
    failedImages,
    bundle,
  };
}
