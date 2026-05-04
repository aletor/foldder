import type {
  BrandVisualDnaComputedCluster,
  BrandVisualDnaGlobalVisualRules,
  BrandVisualDnaRawImageAnalysis,
  BrandVisualDnaRoot,
  BrandVisualDnaStyleCluster,
} from "./types";
import { defaultGlobalVisualRules, defaultStrategicReading, technicalFallbackStyleCluster } from "./defaults";
import type { GeminiClusterInterpretResult } from "./gemini-cluster-interpreter";

function typographyFromSignal(text: number): BrandVisualDnaStyleCluster["visual_rules"]["typography_presence"] {
  if (text > 0.45) return "dominant";
  if (text > 0.28) return "medium";
  if (text > 0.12) return "subtle";
  return "none";
}

function technicalClusterStyle(
  computed: BrandVisualDnaComputedCluster,
  analysesById: Map<string, BrandVisualDnaRawImageAnalysis>,
): BrandVisualDnaStyleCluster {
  const members = computed.member_image_ids
    .map((id) => analysesById.get(id))
    .filter(Boolean) as BrandVisualDnaRawImageAnalysis[];
  const palette = [...new Set(members.flatMap((m) => m.dominant_colors))].slice(0, 10);
  const avg = (fn: (m: BrandVisualDnaRawImageAnalysis) => number) =>
    members.length ? members.reduce((a, m) => a + fn(m), 0) / members.length : 0;
  const text = avg((m) => m.text_presence_score_0_1);
  const hum = avg((m) => m.human_presence_score_0_1);
  const prod = avg((m) => m.product_presence_score_0_1);
  const bright = avg((m) => m.brightness_0_1);
  const sat = avg((m) => m.saturation_0_1);
  const visDensity = avg((m) => m.visual_density_0_1);
  const baseCluster = technicalFallbackStyleCluster(
    computed,
    `Cluster ${computed.cluster_id.replace("cluster_", "C")}`,
    `Estilo derivado solo de señales técnicas agregadas (${computed.common_traits.join("; ") || "sin rasgos textuales"}).`,
    {
      colors: palette.map((h) => `Familia cromática cercana a ${h} (abstracción; no reproduce una pieza concreta).`),
      lighting: [
        bright > 0.58 ? "Alta luminancia media" : bright < 0.38 ? "Escena con sombra predominante" : "Luminancia equilibrada",
      ],
      composition: computed.common_traits.filter((t) => t.startsWith("composición")).slice(0, 4),
      textures:
        visDensity > 0.42
          ? ["Superficies con variación micro-textural visible a escala reducida"]
          : ["Superficies mayormente uniformes"],
      materials: [],
      camera_language: ["Lenguaje de captura neutro (inferido por densidad y encuadre abstracto)"],
      graphic_language: text > 0.35 ? ["Capa gráfica o textual perceptible a nivel de bloque"] : ["Gráfica mínima o ambiental"],
      typography_presence: typographyFromSignal(text),
      content_density: visDensity > 0.55 ? "dense" : visDensity < 0.28 ? "minimal" : "medium",
      premium_level: sat < 0.25 && bright > 0.45 ? "high" : "medium",
      energy_level: visDensity > 0.58 ? "dynamic" : visDensity < 0.3 ? "calm" : "balanced",
      avoid: defaultGlobalVisualRules().avoid,
    },
    0.42,
  );
  return {
    ...baseCluster,
    people_language: {
      ...baseCluster.people_language,
      presence_level: hum > 0.35 ? "frequent" : hum > 0.18 ? "occasional" : "none",
    },
    product_language: {
      ...baseCluster.product_language,
      product_presence: prod > 0.42 ? "hero" : prod > 0.22 ? "shared_focus" : prod > 0.12 ? "subtle" : "none",
    },
    strategic_reading: {
      ...defaultStrategicReading(),
      people_strategy:
        hum > 0.35
          ? "Presencia humana recurrente a nivel de señal abstracta; tratar como guía de energía social, no de retrato literal."
          : "Poca señal humana agregada; priorizar objetos, espacio o tipografía.",
      product_strategy:
        prod > 0.35
          ? "El producto o hero object concentra atención en el encuadre medio (señal estadística)."
          : "El producto no domina el cluster; útil para storytelling de ambiente o lifestyle no centrado en packshot.",
      combined_effect: "Lectura generada sin modelo generativo (fallback técnico).",
      recommended_use_cases: ["Exploraciones de estilo internas", "Brief de coherencia cromática y ritmo visual"],
      not_recommended_use_cases: ["Copia fiel de piezas de referencia", "Recreación literal de campañas"],
    },
  };
}

function mergeAiRow(
  computed: BrandVisualDnaComputedCluster,
  ai: GeminiClusterInterpretResult["style_clusters"][number] | undefined,
  analysesById: Map<string, BrandVisualDnaRawImageAnalysis>,
): BrandVisualDnaStyleCluster {
  if (!ai) return technicalClusterStyle(computed, analysesById);
  return {
    cluster_id: computed.cluster_id,
    style_name: ai.style_name,
    weight_percentage: computed.weight_percentage,
    representative_image_ids: computed.member_image_ids.slice(0, 4),
    description: ai.description,
    visual_rules: ai.visual_rules,
    people_language: ai.people_language,
    product_language: ai.product_language,
    strategic_reading: ai.strategic_reading,
    confidence: ai.confidence,
  };
}

/** Empareja respuesta IA con clusters numéricos (por id; si falla, por orden). */
export function mergeComputedClustersWithGemini(
  computed: BrandVisualDnaComputedCluster[],
  ai: GeminiClusterInterpretResult | null,
  analysesById: Map<string, BrandVisualDnaRawImageAnalysis>,
): BrandVisualDnaStyleCluster[] {
  const byId = new Map((ai?.style_clusters ?? []).map((s) => [s.cluster_id, s]));
  const used = new Set<string>();
  const out: BrandVisualDnaStyleCluster[] = [];
  for (const c of computed) {
    let row = byId.get(c.cluster_id);
    if (row) used.add(c.cluster_id);
    if (!row && ai?.style_clusters.length) {
      const unused = ai.style_clusters.find((s) => !used.has(s.cluster_id));
      if (unused) {
        row = unused;
        used.add(unused.cluster_id);
      }
    }
    out.push(row ? mergeAiRow(c, row, analysesById) : technicalClusterStyle(c, analysesById));
  }
  return out;
}

function buildGlobalFromAnalyses(
  analyses: BrandVisualDnaRawImageAnalysis[],
  clusters: BrandVisualDnaStyleCluster[],
  aiGlobal: BrandVisualDnaGlobalVisualRules | undefined,
): BrandVisualDnaGlobalVisualRules {
  const base = aiGlobal && Object.keys(aiGlobal).length ? { ...defaultGlobalVisualRules(), ...aiGlobal } : defaultGlobalVisualRules();
  const ok = analyses.filter((a) => a.status === "analyzed" || a.status === "fallback_used");
  const colors = [...new Set(ok.flatMap((a) => a.dominant_colors))].slice(0, 14);
  if (!base.dominant_colors.length && colors.length) base.dominant_colors = colors.map((h) => `Familia cromática ${h} (uso abstracto)`);
  if (!base.dominant_composition.length) {
    base.dominant_composition = [...new Set(ok.map((a) => a.composition_type))].slice(0, 6);
  }
  if (!base.dominant_lighting.length) {
    const bright = ok.length ? ok.reduce((s, a) => s + a.brightness_0_1, 0) / ok.length : 0.5;
    base.dominant_lighting.push(
      bright > 0.58 ? "Iluminación alta y aire claro" : bright < 0.38 ? "Sombras profundas y contraluz suave" : "Luz media neutra",
    );
  }
  if (!base.brand_feeling.length && clusters.length) {
    base.brand_feeling = clusters.flatMap((c) => c.visual_rules.textures.slice(0, 1)).slice(0, 6);
  }
  if (!base.safe_generation_rules.length) {
    base.safe_generation_rules = defaultGlobalVisualRules().safe_generation_rules;
  }
  if (!base.avoid.length) base.avoid = defaultGlobalVisualRules().avoid;
  return base;
}

export function assembleBrandVisualDnaRoot(params: {
  brandName: string;
  source_image_count: number;
  analyses: BrandVisualDnaRawImageAnalysis[];
  computedClusters: BrandVisualDnaComputedCluster[];
  styleClusters: BrandVisualDnaStyleCluster[];
  ai: GeminiClusterInterpretResult | null;
}): BrandVisualDnaRoot {
  const global_visual_rules = buildGlobalFromAnalyses(
    params.analyses,
    params.styleClusters,
    params.ai?.global_visual_rules,
  );
  const core_style =
    params.ai?.core_style?.trim() ||
    (params.styleClusters[0]?.style_name ?? "Sistema visual técnico (sin interpretación generativa)");
  const secondary_styles =
    params.ai?.secondary_styles?.length ?
      params.ai.secondary_styles
    : params.styleClusters.slice(1, 4).map((c) => c.style_name);

  return {
    brand_name: params.brandName.trim(),
    analysis_version: "1.0",
    source_image_count: params.source_image_count,
    core_style,
    secondary_styles,
    style_clusters: params.styleClusters,
    global_visual_rules,
  };
}

export { technicalClusterStyle };
