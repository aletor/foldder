import type {
  BrandVisualDnaGlobalVisualRules,
  BrandVisualDnaPeopleLanguage,
  BrandVisualDnaProductLanguage,
  BrandVisualDnaStrategicReading,
  BrandVisualDnaStyleCluster,
  BrandVisualDnaVisualRules,
} from "./types";

export function defaultVisualRules(): BrandVisualDnaVisualRules {
  return {
    colors: [],
    lighting: [],
    composition: [],
    textures: [],
    materials: [],
    camera_language: [],
    graphic_language: [],
    typography_presence: "subtle",
    content_density: "medium",
    premium_level: "medium",
    energy_level: "balanced",
    avoid: [
      "recrear o clonar imágenes concretas",
      "copiar estilos protegidos o campañas reconocibles",
      "solicitar identificación de marcas, artistas o celebridades",
    ],
  };
}

export function defaultPeopleLanguage(): BrandVisualDnaPeopleLanguage {
  return {
    presence_level: "none",
    role_of_people: [],
    framing: [],
    visibility_of_face: "not_visible",
    demographic_impression: [],
    styling: [],
    pose_and_body_language: [],
    emotional_tone: [],
    interaction_type: [],
    diversity_signal: "medium",
    human_representation_notes: [],
  };
}

export function defaultProductLanguage(): BrandVisualDnaProductLanguage {
  return {
    product_presence: "none",
    product_role: [],
    product_category: [],
    framing: [],
    scale_in_frame: "medium",
    orientation_and_placement: [],
    surface_and_material_focus: [],
    detail_priority: [],
    representation_mode: [],
    value_signal: [],
    product_representation_notes: [],
  };
}

export function defaultStrategicReading(): BrandVisualDnaStrategicReading {
  return {
    people_strategy: "",
    product_strategy: "",
    combined_effect: "",
    recommended_use_cases: [],
    not_recommended_use_cases: [],
  };
}

export function defaultGlobalVisualRules(): BrandVisualDnaGlobalVisualRules {
  return {
    dominant_colors: [],
    dominant_mood: [],
    dominant_lighting: [],
    dominant_composition: [],
    dominant_people_strategy: "",
    dominant_product_strategy: "",
    brand_feeling: [],
    safe_generation_rules: [
      "Usar solo abstracciones visuales y reglas de estilo; no reproducir piezas concretas.",
      "No pedir al modelo que imite una imagen de referencia literal.",
    ],
    avoid: defaultVisualRules().avoid,
  };
}

export function technicalFallbackStyleCluster(
  computed: { cluster_id: string; member_image_ids: string[]; weight_percentage: number; common_traits: string[] },
  styleName: string,
  description: string,
  visual: BrandVisualDnaVisualRules,
  confidence: number,
): BrandVisualDnaStyleCluster {
  return {
    cluster_id: computed.cluster_id,
    style_name: styleName,
    weight_percentage: computed.weight_percentage,
    representative_image_ids: computed.member_image_ids.slice(0, 4),
    description,
    visual_rules: visual,
    people_language: defaultPeopleLanguage(),
    product_language: defaultProductLanguage(),
    strategic_reading: defaultStrategicReading(),
    confidence,
  };
}
