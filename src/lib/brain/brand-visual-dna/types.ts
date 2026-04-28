/**
 * Brand Visual DNA — tipos alineados con el schema JSON `brand_visual_dna`.
 * Salida abstracta y reutilizable (sin prompts de recreación ni identificación de IPs).
 */

export type BrandVisualDnaTypographyPresence = "none" | "subtle" | "medium" | "dominant";
export type BrandVisualDnaContentDensity = "minimal" | "medium" | "dense";
export type BrandVisualDnaPremiumLevel = "low" | "medium" | "high";
export type BrandVisualDnaEnergyLevel = "calm" | "balanced" | "dynamic" | "aggressive";

export type BrandVisualDnaPeoplePresenceLevel = "none" | "occasional" | "frequent" | "dominant";
export type BrandVisualDnaFaceVisibility = "not_visible" | "partial" | "visible" | "dominant";
export type BrandVisualDnaDiversitySignal = "low" | "medium" | "high";

export type BrandVisualDnaProductPresence = "none" | "subtle" | "shared_focus" | "hero";
export type BrandVisualDnaProductScale = "small" | "medium" | "large" | "dominant";

export type BrandVisualDnaPeopleRole =
  | "protagonist"
  | "supporting"
  | "contextual"
  | "community"
  | "anonymous";

export type BrandVisualDnaPeopleFraming =
  | "close_up"
  | "medium_shot"
  | "full_body"
  | "group_shot"
  | "detail_hands"
  | "silhouette";

export type BrandVisualDnaDemographicImpression = "young_adult" | "adult" | "mixed_ages";

export type BrandVisualDnaPeopleStyling =
  | "elegant"
  | "casual_refined"
  | "minimal"
  | "fashion_forward"
  | "technical";

export type BrandVisualDnaPoseBodyLanguage =
  | "calm"
  | "confident"
  | "natural"
  | "candid"
  | "static"
  | "dynamic";

export type BrandVisualDnaEmotionalTone =
  | "serene"
  | "aspirational"
  | "intimate"
  | "joyful"
  | "serious"
  | "focused";

export type BrandVisualDnaInteractionType =
  | "person_with_product"
  | "person_with_environment"
  | "person_with_person"
  | "person_observing"
  | "no_interaction";

export type BrandVisualDnaProductRole =
  | "functional"
  | "aspirational"
  | "luxury_object"
  | "utility"
  | "design_piece"
  | "technical_tool";

export type BrandVisualDnaProductCategory =
  | "fashion"
  | "beauty"
  | "food"
  | "technology"
  | "home"
  | "sports"
  | "mobility"
  | "other";

export type BrandVisualDnaProductFraming =
  | "macro_detail"
  | "packshot"
  | "in_use"
  | "on_body"
  | "shelf_context"
  | "tabletop"
  | "floating"
  | "lifestyle_scene";

export type BrandVisualDnaProductPlacement =
  | "centered"
  | "off_center"
  | "symmetrical"
  | "layered"
  | "held_by_person"
  | "integrated_in_scene";

export type BrandVisualDnaSurfaceMaterial =
  | "matte"
  | "glossy"
  | "metallic"
  | "organic"
  | "transparent"
  | "textile"
  | "paper";

export type BrandVisualDnaDetailPriority =
  | "shape"
  | "texture"
  | "logo_visibility"
  | "packaging"
  | "finish"
  | "interface"
  | "craftsmanship";

export type BrandVisualDnaRepresentationMode =
  | "clean_packshot"
  | "editorial_product"
  | "product_in_context"
  | "product_in_use"
  | "technical_explainer";

export type BrandVisualDnaValueSignal =
  | "premium"
  | "accessible"
  | "innovative"
  | "handcrafted"
  | "performance"
  | "sustainable";

export type BrandVisualDnaPeopleLanguage = {
  presence_level: BrandVisualDnaPeoplePresenceLevel;
  role_of_people: BrandVisualDnaPeopleRole[];
  framing: BrandVisualDnaPeopleFraming[];
  visibility_of_face: BrandVisualDnaFaceVisibility;
  demographic_impression: BrandVisualDnaDemographicImpression[];
  styling: BrandVisualDnaPeopleStyling[];
  pose_and_body_language: BrandVisualDnaPoseBodyLanguage[];
  emotional_tone: BrandVisualDnaEmotionalTone[];
  interaction_type: BrandVisualDnaInteractionType[];
  diversity_signal: BrandVisualDnaDiversitySignal;
  human_representation_notes: string[];
};

export type BrandVisualDnaProductLanguage = {
  product_presence: BrandVisualDnaProductPresence;
  product_role: BrandVisualDnaProductRole[];
  product_category: BrandVisualDnaProductCategory[];
  framing: BrandVisualDnaProductFraming[];
  scale_in_frame: BrandVisualDnaProductScale;
  orientation_and_placement: BrandVisualDnaProductPlacement[];
  surface_and_material_focus: BrandVisualDnaSurfaceMaterial[];
  detail_priority: BrandVisualDnaDetailPriority[];
  representation_mode: BrandVisualDnaRepresentationMode[];
  value_signal: BrandVisualDnaValueSignal[];
  product_representation_notes: string[];
};

export type BrandVisualDnaStrategicReading = {
  people_strategy: string;
  product_strategy: string;
  combined_effect: string;
  recommended_use_cases: string[];
  not_recommended_use_cases: string[];
};

export type BrandVisualDnaVisualRules = {
  colors: string[];
  lighting: string[];
  composition: string[];
  textures: string[];
  materials: string[];
  camera_language: string[];
  graphic_language: string[];
  typography_presence: BrandVisualDnaTypographyPresence;
  content_density: BrandVisualDnaContentDensity;
  premium_level: BrandVisualDnaPremiumLevel;
  energy_level: BrandVisualDnaEnergyLevel;
  avoid: string[];
};

export type BrandVisualDnaStyleCluster = {
  cluster_id: string;
  style_name: string;
  weight_percentage: number;
  representative_image_ids: string[];
  description: string;
  visual_rules: BrandVisualDnaVisualRules;
  people_language: BrandVisualDnaPeopleLanguage;
  product_language: BrandVisualDnaProductLanguage;
  strategic_reading: BrandVisualDnaStrategicReading;
  confidence: number;
};

export type BrandVisualDnaGlobalVisualRules = {
  dominant_colors: string[];
  dominant_mood: string[];
  dominant_lighting: string[];
  dominant_composition: string[];
  dominant_people_strategy: string;
  dominant_product_strategy: string;
  brand_feeling: string[];
  safe_generation_rules: string[];
  avoid: string[];
};

export type BrandVisualDnaRoot = {
  brand_name: string;
  analysis_version: string;
  source_image_count: number;
  core_style: string;
  secondary_styles: string[];
  style_clusters: BrandVisualDnaStyleCluster[];
  global_visual_rules: BrandVisualDnaGlobalVisualRules;
};

export type BrandVisualDnaDocument = {
  brand_visual_dna: BrandVisualDnaRoot;
};

/** Estado de pipeline por imagen (compatible con tu lista; `fallback_used` también como bandera). */
export type BrandVisualDnaImagePipelineStatus =
  | "pending"
  | "analyzing"
  | "analyzed"
  | "failed"
  | "fallback_used";

export type BrandVisualDnaCompositionType =
  | "center_weighted"
  | "rule_of_thirds"
  | "symmetrical"
  | "layered"
  | "flat_lay"
  | "environmental_wide"
  | "mixed"
  | "unknown";

export type BrandVisualDnaOrientation = "landscape" | "portrait" | "square" | "unknown";

export type BrandVisualDnaBackgroundType =
  | "solid_neutral"
  | "gradient"
  | "busy_environment"
  | "minimal_studio"
  | "unknown";

export type BrandVisualDnaObjectCategoryHint =
  | "people"
  | "product"
  | "food"
  | "architecture"
  | "landscape"
  | "abstract_graphic"
  | "mixed"
  | "unknown";

/** Features técnicas objetivas (paso 1, sin narrativa de escena). */
export type BrandVisualDnaRawImageAnalysis = {
  image_id: string;
  status: BrandVisualDnaImagePipelineStatus;
  fallback_used: boolean;
  error?: string;
  /** Dominantes hex (muestra reducida). */
  dominant_colors: string[];
  brightness_0_1: number;
  contrast_0_1: number;
  saturation_0_1: number;
  text_presence_score_0_1: number;
  human_presence_score_0_1: number;
  product_presence_score_0_1: number;
  composition_type: BrandVisualDnaCompositionType;
  orientation: BrandVisualDnaOrientation;
  visual_density_0_1: number;
  background_type: BrandVisualDnaBackgroundType;
  object_category_hint: BrandVisualDnaObjectCategoryHint;
  width_px: number;
  height_px: number;
  analyzed_at?: string;
};

export type BrandVisualDnaImageEmbedding = {
  image_id: string;
  model: string;
  /** Vector normalizado (p. ej. histograma + estadísticas); longitud fija por versión. */
  vector: number[];
};

export type BrandVisualDnaComputedCluster = {
  cluster_id: string;
  member_image_ids: string[];
  /** Centroide en espacio de features técnicas. */
  centroid: number[];
  /** Porcentaje del total de imágenes del set. */
  weight_percentage: number;
  /** Rasgos comunes agregados (pre-IA). */
  common_traits: string[];
};

export type BrandVisualDnaFailedImage = {
  image_id: string;
  error: string;
};

/** Paquete persistible en `visualReferenceAnalysis.brandVisualDnaBundle`. */
export type BrandVisualDnaStoredBundle = {
  pipeline_version: string;
  analyzed_at: string;
  brand_visual_dna: BrandVisualDnaRoot;
  rawImageAnalyses: BrandVisualDnaRawImageAnalysis[];
  imageEmbeddings: BrandVisualDnaImageEmbedding[];
  styleClusters: BrandVisualDnaStyleCluster[];
  /** Clusters numéricos previos a la ficha IA (trazabilidad). */
  computed_clusters?: BrandVisualDnaComputedCluster[];
  warnings: string[];
  failedImages: BrandVisualDnaFailedImage[];
};

export type AnalyzeBrandImageSetOptions = {
  brandName?: string;
  maxClusters?: number;
  userEmail?: string;
  route?: string;
};

export type AnalyzeBrandImageSetInputImage = {
  id: string;
  imageUrl: string;
};

export type AnalyzeBrandImageSetResult = {
  rawImageAnalyses: BrandVisualDnaRawImageAnalysis[];
  imageEmbeddings: BrandVisualDnaImageEmbedding[];
  clusters: BrandVisualDnaComputedCluster[];
  styleClusters: BrandVisualDnaStyleCluster[];
  brandVisualDna: BrandVisualDnaRoot;
  warnings: string[];
  failedImages: BrandVisualDnaFailedImage[];
};
