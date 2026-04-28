import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseJsonObjectFromVisionModelText } from "@/lib/brain/brain-vision-json-from-text";
import { recordApiUsage, parseGeminiUsageMetadata } from "@/lib/api-usage";
import { assertApiServiceEnabled, ApiServiceDisabledError } from "@/lib/api-usage-controls";
import type { BrandVisualDnaComputedCluster, BrandVisualDnaRawImageAnalysis } from "./types";
import { defaultPeopleLanguage, defaultProductLanguage, defaultStrategicReading, defaultVisualRules } from "./defaults";
import type {
  BrandVisualDnaGlobalVisualRules,
  BrandVisualDnaPeopleLanguage,
  BrandVisualDnaProductLanguage,
  BrandVisualDnaStyleCluster,
  BrandVisualDnaStrategicReading,
  BrandVisualDnaVisualRules,
} from "./types";

const SYSTEM = `Eres un sistema de clasificación visual de marca. Respondes SOLO con JSON válido (sin markdown).

Reglas de seguridad y copyright (obligatorias):
- No describas escenas concretas ni narrativas.
- No nombres marcas, personajes, celebridades, artistas, campañas, IPs ni referencias reconocibles.
- No escribas prompts que permitan recrear o clonar imágenes concretas.
- No copies slogans ni textos largos legibles.
- No identifiques procedencia de las imágenes.

Tu tarea: a partir de AGREGADOS TÉCNICOS por cluster (sin píxeles), devuelve fichas de estilo ABSTRACTAS y ESTRATÉGICAS para un ADN visual reutilizable.`;

const USER_TEMPLATE = (payload: string) => `Entrada: resúmenes técnicos por cluster (métricas agregadas, sin URLs ni identidades).

${payload}

Devuelve un único JSON con esta forma:
{
  "core_style": string,
  "secondary_styles": string[],
  "global_visual_rules": {
    "dominant_colors": string[],
    "dominant_mood": string[],
    "dominant_lighting": string[],
    "dominant_composition": string[],
    "dominant_people_strategy": string,
    "dominant_product_strategy": string,
    "brand_feeling": string[],
    "safe_generation_rules": string[],
    "avoid": string[]
  },
  "style_clusters": [
    {
      "cluster_id": string,
      "style_name": string,
      "description": string,
      "confidence": number,
      "visual_rules": {
        "colors": string[],
        "lighting": string[],
        "composition": string[],
        "textures": string[],
        "materials": string[],
        "camera_language": string[],
        "graphic_language": string[],
        "typography_presence": "none" | "subtle" | "medium" | "dominant",
        "content_density": "minimal" | "medium" | "dense",
        "premium_level": "low" | "medium" | "high",
        "energy_level": "calm" | "balanced" | "dynamic" | "aggressive",
        "avoid": string[]
      },
      "people_language": { ... },
      "product_language": { ... },
      "strategic_reading": {
        "people_strategy": string,
        "product_strategy": string,
        "combined_effect": string,
        "recommended_use_cases": string[],
        "not_recommended_use_cases": string[]
      }
    }
  ]
}

Los objetos people_language y product_language deben seguir el schema del producto (campos presence_level, product_presence, arrays de literales permitidos, etc.). Si un campo no aplica, usa valores conservadores y arrays vacíos.

Los cluster_id deben coincidir exactamente con los de la entrada.`;

function strArr(v: unknown, max = 24): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function readVisualRules(o: unknown): BrandVisualDnaVisualRules {
  const d = defaultVisualRules();
  if (!o || typeof o !== "object") return d;
  const p = o as Record<string, unknown>;
  const tp = p.typography_presence;
  const cd = p.content_density;
  const pl = p.premium_level;
  const el = p.energy_level;
  return {
    colors: strArr(p.colors, 16).length ? strArr(p.colors, 16) : d.colors,
    lighting: strArr(p.lighting, 16).length ? strArr(p.lighting, 16) : d.lighting,
    composition: strArr(p.composition, 16).length ? strArr(p.composition, 16) : d.composition,
    textures: strArr(p.textures, 16).length ? strArr(p.textures, 16) : d.textures,
    materials: strArr(p.materials, 16).length ? strArr(p.materials, 16) : d.materials,
    camera_language: strArr(p.camera_language, 16).length ? strArr(p.camera_language, 16) : d.camera_language,
    graphic_language: strArr(p.graphic_language, 16).length ? strArr(p.graphic_language, 16) : d.graphic_language,
    typography_presence:
      tp === "none" || tp === "subtle" || tp === "medium" || tp === "dominant" ? tp : d.typography_presence,
    content_density: cd === "minimal" || cd === "medium" || cd === "dense" ? cd : d.content_density,
    premium_level: pl === "low" || pl === "medium" || pl === "high" ? pl : d.premium_level,
    energy_level: el === "calm" || el === "balanced" || el === "dynamic" || el === "aggressive" ? el : d.energy_level,
    avoid: strArr(p.avoid, 24).length ? strArr(p.avoid, 24) : d.avoid,
  };
}

function readPeopleLanguage(o: unknown): BrandVisualDnaPeopleLanguage {
  const d = defaultPeopleLanguage();
  if (!o || typeof o !== "object") return d;
  const p = o as Record<string, unknown>;
  const pl = p.presence_level;
  const vf = p.visibility_of_face;
  const div = p.diversity_signal;
  return {
    presence_level:
      pl === "none" || pl === "occasional" || pl === "frequent" || pl === "dominant" ? pl : d.presence_level,
    role_of_people: strArr(p.role_of_people, 12) as BrandVisualDnaPeopleLanguage["role_of_people"],
    framing: strArr(p.framing, 12) as BrandVisualDnaPeopleLanguage["framing"],
    visibility_of_face:
      vf === "not_visible" || vf === "partial" || vf === "visible" || vf === "dominant" ? vf : d.visibility_of_face,
    demographic_impression: strArr(p.demographic_impression, 8) as BrandVisualDnaPeopleLanguage["demographic_impression"],
    styling: strArr(p.styling, 12) as BrandVisualDnaPeopleLanguage["styling"],
    pose_and_body_language: strArr(p.pose_and_body_language, 12) as BrandVisualDnaPeopleLanguage["pose_and_body_language"],
    emotional_tone: strArr(p.emotional_tone, 12) as BrandVisualDnaPeopleLanguage["emotional_tone"],
    interaction_type: strArr(p.interaction_type, 12) as BrandVisualDnaPeopleLanguage["interaction_type"],
    diversity_signal: div === "low" || div === "medium" || div === "high" ? div : d.diversity_signal,
    human_representation_notes: strArr(p.human_representation_notes, 16),
  };
}

function readProductLanguage(o: unknown): BrandVisualDnaProductLanguage {
  const d = defaultProductLanguage();
  if (!o || typeof o !== "object") return d;
  const p = o as Record<string, unknown>;
  const pr = p.product_presence;
  const sc = p.scale_in_frame;
  return {
    product_presence:
      pr === "none" || pr === "subtle" || pr === "shared_focus" || pr === "hero" ? pr : d.product_presence,
    product_role: strArr(p.product_role, 12) as BrandVisualDnaProductLanguage["product_role"],
    product_category: strArr(p.product_category, 12) as BrandVisualDnaProductLanguage["product_category"],
    framing: strArr(p.framing, 12) as BrandVisualDnaProductLanguage["framing"],
    scale_in_frame: sc === "small" || sc === "medium" || sc === "large" || sc === "dominant" ? sc : d.scale_in_frame,
    orientation_and_placement: strArr(p.orientation_and_placement, 12) as BrandVisualDnaProductLanguage["orientation_and_placement"],
    surface_and_material_focus: strArr(p.surface_and_material_focus, 12) as BrandVisualDnaProductLanguage["surface_and_material_focus"],
    detail_priority: strArr(p.detail_priority, 12) as BrandVisualDnaProductLanguage["detail_priority"],
    representation_mode: strArr(p.representation_mode, 12) as BrandVisualDnaProductLanguage["representation_mode"],
    value_signal: strArr(p.value_signal, 12) as BrandVisualDnaProductLanguage["value_signal"],
    product_representation_notes: strArr(p.product_representation_notes, 16),
  };
}

function readStrategic(o: unknown): BrandVisualDnaStrategicReading {
  const d = defaultStrategicReading();
  if (!o || typeof o !== "object") return d;
  const p = o as Record<string, unknown>;
  return {
    people_strategy: typeof p.people_strategy === "string" ? p.people_strategy.trim().slice(0, 800) : d.people_strategy,
    product_strategy: typeof p.product_strategy === "string" ? p.product_strategy.trim().slice(0, 800) : d.product_strategy,
    combined_effect: typeof p.combined_effect === "string" ? p.combined_effect.trim().slice(0, 800) : d.combined_effect,
    recommended_use_cases: strArr(p.recommended_use_cases, 16),
    not_recommended_use_cases: strArr(p.not_recommended_use_cases, 16),
  };
}

function readGlobal(o: unknown): BrandVisualDnaGlobalVisualRules {
  const d = {
    dominant_colors: [] as string[],
    dominant_mood: [] as string[],
    dominant_lighting: [] as string[],
    dominant_composition: [] as string[],
    dominant_people_strategy: "",
    dominant_product_strategy: "",
    brand_feeling: [] as string[],
    safe_generation_rules: [] as string[],
    avoid: [] as string[],
  };
  if (!o || typeof o !== "object") return d;
  const p = o as Record<string, unknown>;
  return {
    dominant_colors: strArr(p.dominant_colors, 20),
    dominant_mood: strArr(p.dominant_mood, 16),
    dominant_lighting: strArr(p.dominant_lighting, 16),
    dominant_composition: strArr(p.dominant_composition, 16),
    dominant_people_strategy:
      typeof p.dominant_people_strategy === "string" ? p.dominant_people_strategy.trim().slice(0, 600) : "",
    dominant_product_strategy:
      typeof p.dominant_product_strategy === "string" ? p.dominant_product_strategy.trim().slice(0, 600) : "",
    brand_feeling: strArr(p.brand_feeling, 16),
    safe_generation_rules: strArr(p.safe_generation_rules, 20),
    avoid: strArr(p.avoid, 24),
  };
}

function aggregateClusterPayload(
  computed: BrandVisualDnaComputedCluster[],
  byId: Map<string, BrandVisualDnaRawImageAnalysis>,
): unknown {
  return computed.map((c) => {
    const members = c.member_image_ids.map((id) => byId.get(id)).filter(Boolean) as BrandVisualDnaRawImageAnalysis[];
    const avg = (fn: (m: BrandVisualDnaRawImageAnalysis) => number) =>
      members.length ? members.reduce((a, m) => a + fn(m), 0) / members.length : 0;
    return {
      cluster_id: c.cluster_id,
      weight_percentage: c.weight_percentage,
      common_traits: c.common_traits,
      aggregates: {
        avg_brightness: Number(avg((m) => m.brightness_0_1).toFixed(3)),
        avg_contrast: Number(avg((m) => m.contrast_0_1).toFixed(3)),
        avg_saturation: Number(avg((m) => m.saturation_0_1).toFixed(3)),
        avg_text_signal: Number(avg((m) => m.text_presence_score_0_1).toFixed(3)),
        avg_human_signal: Number(avg((m) => m.human_presence_score_0_1).toFixed(3)),
        avg_product_signal: Number(avg((m) => m.product_presence_score_0_1).toFixed(3)),
        avg_density: Number(avg((m) => m.visual_density_0_1).toFixed(3)),
        palette_union: [...new Set(members.flatMap((m) => m.dominant_colors))].slice(0, 12),
        composition_modes: [...new Set(members.map((m) => m.composition_type))],
        backgrounds: [...new Set(members.map((m) => m.background_type))],
        object_hints: [...new Set(members.map((m) => m.object_category_hint))],
      },
    };
  });
}

export type GeminiClusterInterpretResult = {
  core_style: string;
  secondary_styles: string[];
  global_visual_rules: BrandVisualDnaGlobalVisualRules;
  style_clusters: Array<
    Omit<BrandVisualDnaStyleCluster, "weight_percentage" | "representative_image_ids">
  >;
};

export async function interpretClustersWithGemini(params: {
  computedClusters: BrandVisualDnaComputedCluster[];
  analysesById: Map<string, BrandVisualDnaRawImageAnalysis>;
  userEmail?: string;
  route?: string;
}): Promise<GeminiClusterInterpretResult | null> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) return null;
  try {
    await assertApiServiceEnabled("gemini-brand-visual-dna");
  } catch (e) {
    if (e instanceof ApiServiceDisabledError) return null;
    throw e;
  }
  const modelName = process.env.BRAND_VISUAL_DNA_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const payload = JSON.stringify(aggregateClusterPayload(params.computedClusters, params.analysesById));

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM,
  });
  const r = await model.generateContent([{ text: USER_TEMPLATE(payload) }]);
  const text = r.response.text();
  const raw = parseJsonObjectFromVisionModelText(text);
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const core_style = typeof root.core_style === "string" ? root.core_style.trim().slice(0, 400) : "Estilo de marca";
  const secondary_styles = strArr(root.secondary_styles, 12);
  const global_visual_rules = readGlobal(root.global_visual_rules);
  const arr = Array.isArray(root.style_clusters) ? root.style_clusters : [];
  const style_clusters: GeminiClusterInterpretResult["style_clusters"] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const cluster_id = typeof o.cluster_id === "string" ? o.cluster_id.trim() : "";
    if (!cluster_id) continue;
    const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : 0.55;
    style_clusters.push({
      cluster_id,
      style_name: typeof o.style_name === "string" ? o.style_name.trim().slice(0, 120) : cluster_id,
      description: typeof o.description === "string" ? o.description.trim().slice(0, 1200) : "",
      visual_rules: readVisualRules(o.visual_rules),
      people_language: readPeopleLanguage(o.people_language),
      product_language: readProductLanguage(o.product_language),
      strategic_reading: readStrategic(o.strategic_reading),
      confidence,
    });
  }
  if (!style_clusters.length) return null;

  await recordApiUsage({
    provider: "gemini",
    userEmail: params.userEmail,
    serviceId: "gemini-brand-visual-dna",
    route: params.route ?? "/api/spaces/brain/brand-visual-dna/analyze",
    model: modelName,
    operation: "brand_visual_dna_clusters",
    ...(() => {
      const u = parseGeminiUsageMetadata(r.response);
      return {
        inputTokens: u?.inputTokens,
        outputTokens: u?.outputTokens,
        totalTokens: u?.totalTokens,
      };
    })(),
  });

  return { core_style, secondary_styles, global_visual_rules, style_clusters };
}
