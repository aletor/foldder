import type {
  BrainFieldSourceInfo,
  BrainSourceConfidence,
  BrainSourceTier,
  BrainStrategyFieldProvenance,
} from "@/lib/brain/brain-field-provenance";
import type { BrandVisualDnaStoredBundle } from "@/lib/brain/brand-visual-dna/types";
import { parseBrandVisualDnaBundle } from "@/lib/brain/brand-visual-dna/normalize-bundle";
import type {
  BrainBrandVisualDna,
  BrainExtractedContext,
  BrainMeta,
  ContentDna,
  SafeCreativeRules,
} from "@/lib/brain/brain-creative-memory-types";
import type { VisualDnaSlot } from "@/lib/brain/visual-dna-slot/types";
import { normalizeVisualDnaSlots } from "@/lib/brain/visual-dna-slot/normalize";
import { normalizeVisualDnaSlotSuppressedSourceIds } from "@/lib/brain/visual-dna-slot/slot-sync";
import { normalizeBrandVisualDna } from "@/lib/brain/brain-brand-visual-dna-synthesis";
import { normalizeSafeCreativeRules } from "@/lib/brain/brain-safe-creative-rules";
import { normalizeBrainMeta } from "@/lib/brain/brain-meta";
import { normalizeKnowledgeUrlsFromDocuments } from "@/lib/brain/brain-knowledge-urls";
import { capDecisionTraces, type BrainDecisionTrace } from "@/lib/brain/brain-decision-trace";

/**
 * Datos de «Assets» del proyecto (marca + fuente de conocimiento).
 * Se persisten en `project.metadata.assets` al guardar el proyecto.
 */

export type KnowledgeDocumentEntry = {
  id: string;
  name: string;
  size: number;
  mime: string;
  scope?: "core" | "context";
  contextKind?: "competencia" | "mercado" | "referencia" | "general";
  s3Path?: string;
  type?: "document" | "image";
  format?: "pdf" | "docx" | "txt" | "html" | "url" | "image";
  status?: "Subido" | "Analizado" | "Error";
  /** Flujo extendido (inglés); convive con `status` legado para UI. */
  workflowStatus?: "uploaded" | "queued" | "analyzing" | "analyzed" | "failed_retryable" | "failed_final" | "stale";
  retryCount?: number;
  maxRetries?: number;
  lastError?: string;
  lastAttemptAt?: string;
  analyzedAt?: string;
  analysisVersion?: string;
  staleReasons?: string[];
  requiresUpgrade?: boolean;
  analysisOrigin?: "remote_ai" | "local_heuristic" | "fallback" | "mock" | "manual";
  analysisProvider?: "openai" | "gemini" | "internal" | "none";
  analysisReliability?: "high" | "medium" | "low";
  isReliableForGeneration?: boolean;
  uploadedAt?: string;
  extractedContext?: string;
  /** Vista materializada del contexto (no reemplaza el JSON en `extractedContext` mientras migran clientes). */
  extractedContextStructured?: BrainExtractedContext;
  originalSourceUrl?: string;
  embedding?: number[];
  errorMessage?: string;
  /** data URL (base64); solo si cabe bajo el límite */
  dataUrl?: string;
  insights?: {
    claims: string[];
    metrics: string[];
    potentialUse: string[];
    freshness: string;
    reliability: number;
    usedInPieces: string[];
  };
};

export type ProjectBrandKit = {
  /** data URL imagen logo en positivo (fondo claro) */
  logoPositive: string | null;
  /** data URL imagen logo en negativo (fondo oscuro) */
  logoNegative: string | null;
  /** Hex `#RRGGBB` o null si el usuario aún no definió el color */
  colorPrimary: string | null;
  colorSecondary: string | null;
  colorAccent: string | null;
};

/** Memoria explícita solo para este proyecto (p. ej. tras KEEP_IN_PROJECT). */
export type BrainProjectMemoryEntry = {
  id: string;
  topic: string;
  value: string;
  createdAt: string;
  sourceLearningId?: string;
};

/** Contexto puntual u outlier (SAVE_AS_CONTEXT / MARK_OUTLIER). */
export type BrainContextualMemoryEntry = BrainProjectMemoryEntry & { isOutlier: boolean };

export type ProjectKnowledgeSource = {
  urls: string[];
  documents: KnowledgeDocumentEntry[];
  corporateContext?: string;
  projectOnlyMemories?: BrainProjectMemoryEntry[];
  contextualMemories?: BrainContextualMemoryEntry[];
};

export type BrainVoiceExample = {
  id: string;
  kind: "approved_voice" | "forbidden_voice" | "good_piece" | "bad_piece";
  label?: string;
  text: string;
};

export type BrainPersona = {
  id: string;
  name: string;
  pain: string;
  channel: string;
  sophistication: string;
  tags: string[];
  objections?: string[];
  proofNeeded?: string[];
  attentionTriggers?: string[];
  marketSophistication?: string;
};

export type BrainFunnelMessage = {
  id: string;
  stage: "awareness" | "consideration" | "conversion" | "retention";
  text: string;
};

export type BrainMessageBlueprint = {
  id: string;
  claim: string;
  support: string;
  audience: string;
  channel: string;
  stage: "awareness" | "consideration" | "conversion" | "retention";
  cta: string;
  evidence: string[];
};

export type BrainFactEvidence = {
  id: string;
  claim: string;
  evidence: string[];
  sourceDocIds: string[];
  strength: "fuerte" | "media" | "debil";
  verified: boolean;
  interpreted: boolean;
};

export type BrainGeneratedPiece = {
  id: string;
  createdAt: string;
  objective: string;
  channel: string;
  personaId: string;
  funnelStage: string;
  prompt: string;
  draft: string;
  critique: string;
  revised: string;
  status: "draft" | "approved" | "rejected";
  notes?: string;
};

export type BrainVisualStyleSlotKey = "protagonist" | "environment" | "textures" | "people";

export type BrainVisualStyleSlot = {
  key: BrainVisualStyleSlotKey;
  title: string;
  description: string;
  imageUrl: string | null;
  imageS3Key?: string;
  prompt?: string;
  source?: "auto" | "manual";
};

export type BrainVisualStyle = Record<BrainVisualStyleSlotKey, BrainVisualStyleSlot>;

/** Clasificación de referencia visual (no implica promoción automática a ADN). */
export type VisualImageClassification =
  | "CORE_VISUAL_DNA"
  | "PROJECT_VISUAL_REFERENCE"
  | "CONTEXTUAL_VISUAL_MEMORY"
  | "RAW_ASSET_ONLY";

/** Prioridad manual sobre la clasificación del analizador (mock o visión). */
export type BrainVisualImageUserOverride = VisualImageClassification | "EXCLUDED";

export type BrainVisualColorAnalysis = {
  dominant: string[];
  secondary: string[];
  temperature?: string;
  saturation?: string;
  contrast?: string;
};

/** Origen semántico de la imagen para telemetría / Brain Studio. */
export type BrainVisualTelemetryImageSource =
  | "USER_UPLOAD"
  | "BRAIN_SUGGESTION"
  | "PROJECT_ASSET"
  | "BRAIN_REFERENCE"
  | "EXTERNAL"
  | "GENERATED_IMAGE"
  | "PHOTOROOM_EDIT"
  | "VIDEO_FRAME"
  | "MOODBOARD_REFERENCE";

export type BrainVisualPeopleDetail = {
  present: boolean;
  description?: string;
  attitude?: string[];
  pose?: string[];
  energy?: string[];
  relationToCamera?: string;
};

export type BrainVisualClothingDetail = {
  present: boolean;
  style?: string[];
  colors?: string[];
  textures?: string[];
  formality?: "casual" | "casual_premium" | "formal" | "technical" | "sport" | "mixed";
};

export type BrainVisualGraphicDetail = {
  present: boolean;
  typography?: string[];
  shapes?: string[];
  iconography?: string[];
  layout?: string[];
  texture?: string[];
};

export type BrainVisualAnalysisStatus = "pending" | "queued" | "analyzing" | "analyzed" | "failed";

/** Calidad heurística del análisis (re-estudio / trazabilidad). */
export type BrainVisualAnalysisQualityTier = "specific" | "acceptable" | "too_generic" | "failed" | "mock";

/** Proveedor de visión usado al generar la fila (último reanálisis). */
export type BrainVisionProviderId = "mock" | "gemini-vision" | "openai-vision";

export type BrainVisionFallbackProvider = "mock" | "local-heuristic";

/** Análisis estructurado por imagen (capa interpretada; el binario sigue en assets). */
export type BrainVisualImageAnalysis = {
  id: string;
  sourceAssetId: string;
  sourceKind:
    | "knowledge_document"
    | "visual_style_slot"
    | "brand_logo"
    | "designer_image"
    | "photoroom_image"
    | "project_asset"
    | "generated_image";
  sourceLabel?: string;
  /** Texto compacto legible (compat); preferir subjectTags para señales densas. */
  subject: string;
  subjectTags?: string[];
  visualStyle: string[];
  mood: string[];
  colorPalette: BrainVisualColorAnalysis;
  composition: string[];
  people: string;
  clothingStyle: string;
  graphicStyle: string;
  brandSignals: string[];
  possibleUse: string[];
  /** Qué mensaje de marca sugiere la imagen a nivel visual (mock o visión). */
  implicitBrandMessage?: string;
  /** Mensajes visuales explícitos (visión estructurada). */
  visualMessage?: string[];
  classification: VisualImageClassification;
  coherenceScore?: number;
  analyzedAt: string;
  /** Marca manual: CORE, referencia de proyecto, contexto o excluida del ADN visual agregado. */
  userVisualOverride?: BrainVisualImageUserOverride;
  /** Dedupe estable: assetId, hash o URL normalizada. */
  analysisDedupeKey?: string;
  assetRef?: string;
  imageFingerprint?: string;
  visualTelemetrySource?: BrainVisualTelemetryImageSource;
  originNodeId?: string;
  /** Eco de BrainNodeType en string para no acoplar imports circulares. */
  originNodeType?: string;
  usedInExport?: boolean;
  pageId?: string;
  frameId?: string;
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  peopleDetail?: BrainVisualPeopleDetail;
  clothingDetail?: BrainVisualClothingDetail;
  graphicDetail?: BrainVisualGraphicDetail;
  reasoning?: string;
  analysisStatus?: BrainVisualAnalysisStatus;
  /** Proveedor que produjo este análisis (persistido con la fila). */
  visionProviderId?: BrainVisionProviderId;
  /** Proveedor remoto intentado cuando `visionProviderId` es mock por fallo. */
  visionProviderAttempted?: BrainVisionProviderId;
  /** Eco de la versión del analizador del lote (`BrainVisualReferenceLayer.analyzerVersion`). */
  analyzerVersion?: string;
  /** True si el contenido mostrado es heurístico / mock tras fallo o falta de píxeles. */
  fallbackUsed?: boolean;
  fallbackProvider?: BrainVisionFallbackProvider;
  failureReason?: string;
  /** Si había URL o data URL utilizable para visión remota. */
  imageUrlForVisionAvailable?: boolean;
  /** Clasificación de especificidad (post-proceso, p. ej. re-estudio Brain). */
  analysisQuality?: BrainVisualAnalysisQualityTier;
};

export type AggregatedVisualPatterns = {
  recurringStyles: string[];
  dominantMoods: string[];
  dominantPalette: string[];
  dominantSecondaryPalette: string[];
  frequentSubjects: string[];
  compositionNotes: string[];
  peopleClothingNotes: string[];
  graphicStyleNotes: string[];
  implicitBrandMessages: string[];
  narrativeSummary: string;
  countsByClassification: Partial<Record<VisualImageClassification, number>>;
  /** Referencias marcadas como excluidas del agregado ADN visual. */
  excludedFromVisualDnaCount: number;
  /** IDs de referencias que se alejan del patrón central. */
  outlierSourceAssetIds?: string[];
  /** Confianza agregada heurística (0–1). */
  patternConfidence?: number;
  /** Frase densa para candidatos Brain / UI (sin prefijos de producto). */
  patternSummary?: string;
};

/** Memoria visual interpretada encima de `metadata.assets`. */
export type BrainVisualReferenceLayer = {
  analyses: BrainVisualImageAnalysis[];
  aggregated?: AggregatedVisualPatterns;
  lastAnalyzedAt?: string;
  analyzerVersion?: string;
  /** Proveedor del último lote «Reanalizar imágenes». */
  lastVisionProviderId?: BrainVisionProviderId;
  /** Patrones visuales confirmados por el usuario (p. ej. promoción desde «Por revisar»). */
  confirmedVisualPatterns?: string[];
  /**
   * Mood board único generado con Nano Banana (Gemini imagen) a partir del agregado + referencias.
   * Data URL o URL https; se invalida cuando cambia `dnaCollageSourceFingerprint`.
   */
  dnaCollageImageDataUrl?: string;
  /** Huella de análisis / referencias usada para decidir si regenerar el tablero. */
  dnaCollageSourceFingerprint?: string;
  dnaCollageGeneratedAt?: string;
  /** ADN visual por clusters (técnico + IA sobre agregados); transversal a nodos creativos. */
  brandVisualDnaBundle?: BrandVisualDnaStoredBundle;
};

export function defaultBrainVisualStyle(): BrainVisualStyle {
  return {
    protagonist: {
      key: "protagonist",
      title: "Protagonista",
      description: "",
      imageUrl: null,
      imageS3Key: undefined,
      prompt: "",
      source: "auto",
    },
    environment: {
      key: "environment",
      title: "Entorno",
      description: "",
      imageUrl: null,
      imageS3Key: undefined,
      prompt: "",
      source: "auto",
    },
    textures: {
      key: "textures",
      title: "Texturas",
      description: "",
      imageUrl: null,
      imageS3Key: undefined,
      prompt: "",
      source: "auto",
    },
    people: {
      key: "people",
      title: "Personas",
      description: "",
      imageUrl: null,
      imageS3Key: undefined,
      prompt: "",
      source: "auto",
    },
  };
}

export type BrainStrategy = {
  voiceExamples: BrainVoiceExample[];
  tabooPhrases: string[];
  approvedPhrases: string[];
  languageTraits: string[];
  syntaxPatterns: string[];
  preferredTerms: string[];
  forbiddenTerms: string[];
  channelIntensity: Array<{ channel: string; intensity: number }>;
  allowAbsoluteClaims: boolean;
  personas: BrainPersona[];
  funnelMessages: BrainFunnelMessage[];
  messageBlueprints: BrainMessageBlueprint[];
  factsAndEvidence: BrainFactEvidence[];
  generatedPieces: BrainGeneratedPiece[];
  approvedPatterns: string[];
  rejectedPatterns: string[];
  visualStyle: BrainVisualStyle;
  /** Análisis visual de referencias (moodboards, slots, logos); opcional para compatibilidad. */
  visualReferenceAnalysis?: BrainVisualReferenceLayer;
  /** Síntesis oficial de ADN visual (prioriza visión remota frente a señales inferidas por documento). */
  brandVisualDna?: BrainBrandVisualDna;
  /** Capa editorial para nodos de contenido / guionista. */
  contentDna?: ContentDna;
  /** Reglas seguras transversales (imagen, texto, compliance). */
  safeCreativeRules?: SafeCreativeRules;
  /** ADN visual por imagen (tableros independientes; no sustituye brandVisualDna ni visualReferenceAnalysis). */
  visualDnaSlots?: VisualDnaSlot[];
  /**
   * IDs de documentos de conocimiento (imagen) cuyo slot se eliminó a mano.
   * El sync automático no vuelve a crear slots para estos documentos mientras existan en el pozo.
   */
  visualDnaSlotSuppressedSourceIds?: string[];
  /** Procedencia por bloques (resumen / ADN) tras analizar o promover aprendizajes. */
  fieldProvenance?: BrainStrategyFieldProvenance;
  /**
   * Trazas ligeras y unificadas de decisiones Brain (diagnóstico transversal).
   * Ordenadas por `createdAt` descendente y capadas para evitar payloads grandes.
   */
  decisionTraces?: BrainDecisionTrace[];
};

export const AUDIENCE_PERSONA_CATALOG: BrainPersona[] = [
  {
    id: "persona-creative-director-ad",
    name: "Creative Director / AD",
    pain: "Pierde contexto al cambiar de herramienta en mitad de un proyecto",
    channel: "LinkedIn",
    sophistication: "Alta",
    tags: ["Agencias", "Decisor de compra", "B2B"],
  },
  {
    id: "persona-filmmaker-indie",
    name: "Filmmaker independiente",
    pain: "Necesita coherencia visual entre piezas sin un equipo grande",
    channel: "Instagram",
    sophistication: "Media",
    tags: ["B2C", "Autofinanciado", "Video"],
  },
  {
    id: "persona-social-media-manager",
    name: "Social Media Manager",
    pain: "Calendario saturado y poco tiempo para adaptar piezas por canal",
    channel: "Instagram",
    sophistication: "Media",
    tags: ["In-house", "Performance", "Contenido"],
  },
  {
    id: "persona-brand-manager",
    name: "Brand Manager",
    pain: "Mantener consistencia de marca en equipos y proveedores externos",
    channel: "LinkedIn",
    sophistication: "Alta",
    tags: ["Enterprise", "Marca", "Gobernanza"],
  },
  {
    id: "persona-growth-lead",
    name: "Growth Lead",
    pain: "Necesita iterar rápido sin romper tono ni propuesta de valor",
    channel: "LinkedIn",
    sophistication: "Alta",
    tags: ["B2B", "Métricas", "Experimentación"],
  },
  {
    id: "persona-performance-marketer",
    name: "Performance Marketer",
    pain: "Multiplica creatividades pero sin narrativa clara por funnel",
    channel: "Meta Ads",
    sophistication: "Alta",
    tags: ["CPA", "Conversión", "Paid Media"],
  },
  {
    id: "persona-content-lead",
    name: "Content Lead",
    pain: "Coordinar estrategia editorial con diseño y ventas sin fricción",
    channel: "Blog SEO",
    sophistication: "Alta",
    tags: ["B2B", "Editorial", "Pipeline"],
  },
  {
    id: "persona-copywriter",
    name: "Copywriter senior",
    pain: "Falta de briefings precisos y criterios de validación consistentes",
    channel: "Email",
    sophistication: "Alta",
    tags: ["Mensajería", "Conversión", "Tone of voice"],
  },
  {
    id: "persona-marketing-manager-smb",
    name: "Marketing Manager SMB",
    pain: "Pocas manos para ejecutar campañas completas con calidad",
    channel: "LinkedIn",
    sophistication: "Media",
    tags: ["SMB", "Generalista", "ROI"],
  },
  {
    id: "persona-cmo-scaleup",
    name: "CMO de scaleup",
    pain: "Escalar output creativo sin añadir complejidad operativa",
    channel: "LinkedIn",
    sophistication: "Alta",
    tags: ["C-Level", "Eficiencia", "Escalado"],
  },
  {
    id: "persona-founder-gtm",
    name: "Founder en fase GTM",
    pain: "Define mensaje y producto al mismo tiempo con recursos limitados",
    channel: "X / LinkedIn",
    sophistication: "Media",
    tags: ["Startup", "Decisor", "Velocidad"],
  },
  {
    id: "persona-agency-account-director",
    name: "Account Director (Agencia)",
    pain: "Alinear entregables creativos con expectativas y timings del cliente",
    channel: "Email",
    sophistication: "Alta",
    tags: ["Agencias", "Cliente final", "Retención"],
  },
  {
    id: "persona-ecommerce-manager",
    name: "Ecommerce Manager",
    pain: "Necesita producir landings y creatividades con foco en conversión",
    channel: "Meta Ads",
    sophistication: "Media",
    tags: ["D2C", "ROAS", "Conversión"],
  },
  {
    id: "persona-product-marketing-manager",
    name: "Product Marketing Manager",
    pain: "Traducir funcionalidades en beneficios claros por segmento",
    channel: "Web / Docs",
    sophistication: "Alta",
    tags: ["B2B SaaS", "Posicionamiento", "Lanzamientos"],
  },
  {
    id: "persona-creator-solopreneur",
    name: "Creator / Solopreneur",
    pain: "Publica mucho pero le cuesta mantener consistencia de marca",
    channel: "Instagram",
    sophistication: "Media",
    tags: ["B2C", "Autónomo", "Contenido"],
  },
  {
    id: "persona-course-creator",
    name: "Creador de cursos",
    pain: "Necesita convertir conocimiento en piezas vendibles y coherentes",
    channel: "YouTube",
    sophistication: "Media",
    tags: ["Infoproducto", "Embudo", "Conversión"],
  },
  {
    id: "persona-sales-enable-manager",
    name: "Sales Enablement Manager",
    pain: "Ventas usa materiales desactualizados y poco adaptados al funnel",
    channel: "Email",
    sophistication: "Alta",
    tags: ["B2B", "Revenue", "Alineación marketing-ventas"],
  },
  {
    id: "persona-ops-marketing",
    name: "Marketing Ops",
    pain: "Demasiadas herramientas inconexas y poca trazabilidad",
    channel: "LinkedIn",
    sophistication: "Alta",
    tags: ["Operaciones", "Automatización", "Datos"],
  },
  {
    id: "persona-freelance-designer",
    name: "Freelance Designer",
    pain: "Iteraciones constantes sin briefing cerrado ni repositorio único",
    channel: "Behance / Instagram",
    sophistication: "Media",
    tags: ["Freelance", "Diseño", "Producción"],
  },
  {
    id: "persona-b2b-demand-gen-manager",
    name: "Demand Gen Manager (B2B)",
    pain: "Necesita piezas por etapa del funnel con narrativa consistente",
    channel: "LinkedIn",
    sophistication: "Alta",
    tags: ["B2B", "Pipeline", "Funnel completo"],
  },
];

export type ProjectAssetsMetadata = {
  brand: ProjectBrandKit;
  knowledge: ProjectKnowledgeSource;
  strategy: BrainStrategy;
  /** Versionado y frescura global del Brain (persistido con assets). */
  brainMeta?: BrainMeta;
};

const DEFAULT_BRAND: ProjectBrandKit = {
  logoPositive: null,
  logoNegative: null,
  colorPrimary: null,
  colorSecondary: null,
  colorAccent: null,
};

const DEFAULT_KNOWLEDGE: ProjectKnowledgeSource = {
  urls: [],
  documents: [],
};

const DEFAULT_STRATEGY: BrainStrategy = {
  voiceExamples: [],
  tabooPhrases: [],
  approvedPhrases: [],
  languageTraits: [],
  syntaxPatterns: [],
  preferredTerms: [],
  forbiddenTerms: [],
  channelIntensity: [],
  allowAbsoluteClaims: false,
  personas: [],
  funnelMessages: [],
  messageBlueprints: [],
  factsAndEvidence: [],
  generatedPieces: [],
  approvedPatterns: [],
  rejectedPatterns: [],
  visualStyle: defaultBrainVisualStyle(),
};

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_KNOWLEDGE_DOC_BYTES = 10 * 1024 * 1024;

export function defaultProjectAssets(): ProjectAssetsMetadata {
  return {
    brand: { ...DEFAULT_BRAND },
    knowledge: {
      urls: [...DEFAULT_KNOWLEDGE.urls],
      documents: [],
      corporateContext: "",
    },
    brainMeta: normalizeBrainMeta(undefined),
    strategy: {
      voiceExamples: [],
      tabooPhrases: [],
      approvedPhrases: [],
      languageTraits: [],
      syntaxPatterns: [],
      preferredTerms: [],
      forbiddenTerms: [],
      channelIntensity: [],
      allowAbsoluteClaims: false,
      personas: [],
      funnelMessages: [],
      messageBlueprints: [],
      factsAndEvidence: [],
      generatedPieces: [],
      approvedPatterns: [],
      rejectedPatterns: [],
      visualStyle: defaultBrainVisualStyle(),
    },
  };
}

export function normalizeProjectAssets(raw: unknown): ProjectAssetsMetadata {
  const base = defaultProjectAssets();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const brandIn = o.brand;
  const knowIn = o.knowledge;
  const strategyIn = o.strategy;
  const brainMeta = normalizeBrainMeta(o.brainMeta ?? base.brainMeta);

  const brand = { ...base.brand };
  if (brandIn && typeof brandIn === "object") {
    const b = brandIn as Record<string, unknown>;
    if (b.logoPositive === null || typeof b.logoPositive === "string") brand.logoPositive = b.logoPositive as string | null;
    if (b.logoNegative === null || typeof b.logoNegative === "string") brand.logoNegative = b.logoNegative as string | null;
    for (const key of ["colorPrimary", "colorSecondary", "colorAccent"] as const) {
      if (b[key] === null) {
        brand[key] = null;
      } else if (typeof b[key] === "string" && /^#[0-9A-Fa-f]{6}$/.test(b[key] as string)) {
        brand[key] = b[key] as string;
      }
    }
  }

  const knowledge = { ...base.knowledge, urls: [...base.knowledge.urls], documents: [...base.knowledge.documents] };
  if (knowIn && typeof knowIn === "object") {
    const k = knowIn as Record<string, unknown>;
    if (Array.isArray(k.urls)) {
      knowledge.urls = k.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    }
    if (Array.isArray(k.documents)) {
      knowledge.documents = k.documents
        .filter((d): d is KnowledgeDocumentEntry => {
          if (!d || typeof d !== "object") return false;
          const x = d as Record<string, unknown>;
          return typeof x.id === "string" && typeof x.name === "string" && typeof x.size === "number";
        })
        .map((d) => ({
          ...d,
          mime: typeof d.mime === "string" ? d.mime : "application/octet-stream",
          scope: d.scope === "context" ? "context" : "core",
          contextKind:
            d.contextKind === "competencia" ||
            d.contextKind === "mercado" ||
            d.contextKind === "referencia" ||
            d.contextKind === "general"
              ? d.contextKind
              : undefined,
          s3Path: typeof d.s3Path === "string" ? d.s3Path : undefined,
          type: d.type === "image" ? "image" : "document",
          format:
            d.format === "pdf" ||
            d.format === "docx" ||
            d.format === "txt" ||
            d.format === "html" ||
            d.format === "url" ||
            d.format === "image"
              ? d.format
              : undefined,
          status: d.status === "Analizado" || d.status === "Error" ? d.status : "Subido",
          uploadedAt: typeof d.uploadedAt === "string" ? d.uploadedAt : undefined,
          extractedContext: typeof d.extractedContext === "string" ? d.extractedContext : undefined,
          originalSourceUrl:
            typeof d.originalSourceUrl === "string" ? d.originalSourceUrl : undefined,
          embedding: Array.isArray(d.embedding)
            ? d.embedding.filter((n): n is number => typeof n === "number")
            : undefined,
          errorMessage: typeof d.errorMessage === "string" ? d.errorMessage : undefined,
          dataUrl: typeof d.dataUrl === "string" ? d.dataUrl : undefined,
          insights:
            d.insights && typeof d.insights === "object"
              ? {
                  claims: Array.isArray(d.insights.claims)
                    ? d.insights.claims.filter((x): x is string => typeof x === "string")
                    : [],
                  metrics: Array.isArray(d.insights.metrics)
                    ? d.insights.metrics.filter((x): x is string => typeof x === "string")
                    : [],
                  potentialUse: Array.isArray(d.insights.potentialUse)
                    ? d.insights.potentialUse.filter((x): x is string => typeof x === "string")
                    : [],
                  freshness: typeof d.insights.freshness === "string" ? d.insights.freshness : "",
                  reliability:
                    typeof d.insights.reliability === "number"
                      ? Math.max(0, Math.min(100, d.insights.reliability))
                      : 0,
                  usedInPieces: Array.isArray(d.insights.usedInPieces)
                    ? d.insights.usedInPieces.filter((x): x is string => typeof x === "string")
                    : [],
                }
              : undefined,
          ...(typeof (d as { workflowStatus?: string }).workflowStatus === "string"
            ? { workflowStatus: (d as { workflowStatus: KnowledgeDocumentEntry["workflowStatus"] }).workflowStatus }
            : {}),
          ...(typeof (d as { retryCount?: number }).retryCount === "number"
            ? { retryCount: Math.max(0, Math.floor((d as { retryCount: number }).retryCount)) }
            : {}),
          ...(typeof (d as { maxRetries?: number }).maxRetries === "number"
            ? { maxRetries: Math.max(1, Math.floor((d as { maxRetries: number }).maxRetries)) }
            : {}),
          ...(typeof (d as { lastError?: string }).lastError === "string"
            ? { lastError: (d as { lastError: string }).lastError.slice(0, 2000) }
            : {}),
          ...(typeof (d as { lastAttemptAt?: string }).lastAttemptAt === "string"
            ? { lastAttemptAt: (d as { lastAttemptAt: string }).lastAttemptAt }
            : {}),
          ...(typeof (d as { analyzedAt?: string }).analyzedAt === "string"
            ? { analyzedAt: (d as { analyzedAt: string }).analyzedAt }
            : {}),
          ...(typeof (d as { analysisVersion?: string }).analysisVersion === "string"
            ? { analysisVersion: (d as { analysisVersion: string }).analysisVersion }
            : {}),
          ...(Array.isArray((d as { staleReasons?: string[] }).staleReasons)
            ? {
                staleReasons: (d as { staleReasons: string[] }).staleReasons
                  .filter((x): x is string => typeof x === "string")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }
            : {}),
          ...((d as { requiresUpgrade?: boolean }).requiresUpgrade === true ? { requiresUpgrade: true } : {}),
          ...(typeof (d as { analysisOrigin?: string }).analysisOrigin === "string"
            ? {
                analysisOrigin: (d as { analysisOrigin: NonNullable<KnowledgeDocumentEntry["analysisOrigin"]> })
                  .analysisOrigin,
              }
            : {}),
          ...(typeof (d as { analysisProvider?: string }).analysisProvider === "string"
            ? {
                analysisProvider: (d as { analysisProvider: NonNullable<KnowledgeDocumentEntry["analysisProvider"]> })
                  .analysisProvider,
              }
            : {}),
          ...(typeof (d as { analysisReliability?: string }).analysisReliability === "string"
            ? {
                analysisReliability: (d as { analysisReliability: NonNullable<KnowledgeDocumentEntry["analysisReliability"]> })
                  .analysisReliability,
              }
            : {}),
          ...((d as { isReliableForGeneration?: boolean }).isReliableForGeneration === true ||
          (d as { isReliableForGeneration?: boolean }).isReliableForGeneration === false
            ? { isReliableForGeneration: Boolean((d as { isReliableForGeneration: boolean }).isReliableForGeneration) }
            : {}),
          ...(d.extractedContextStructured && typeof d.extractedContextStructured === "object"
            ? { extractedContextStructured: d.extractedContextStructured as BrainExtractedContext }
            : {}),
        }));
    }
    if (typeof k.corporateContext === "string") {
      knowledge.corporateContext = k.corporateContext;
    }
    if (Array.isArray(k.projectOnlyMemories)) {
      knowledge.projectOnlyMemories = k.projectOnlyMemories
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x) => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          topic: typeof x.topic === "string" ? x.topic.slice(0, 200) : "",
          value: typeof x.value === "string" ? x.value.slice(0, 2000) : "",
          createdAt: typeof x.createdAt === "string" ? x.createdAt : new Date().toISOString(),
          ...(typeof x.sourceLearningId === "string" ? { sourceLearningId: x.sourceLearningId } : {}),
        }))
        .filter((e) => e.topic.trim() || e.value.trim());
    }
    if (Array.isArray(k.contextualMemories)) {
      knowledge.contextualMemories = k.contextualMemories
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x) => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          topic: typeof x.topic === "string" ? x.topic.slice(0, 200) : "",
          value: typeof x.value === "string" ? x.value.slice(0, 2000) : "",
          createdAt: typeof x.createdAt === "string" ? x.createdAt : new Date().toISOString(),
          isOutlier: x.isOutlier === true,
          ...(typeof x.sourceLearningId === "string" ? { sourceLearningId: x.sourceLearningId } : {}),
        }))
        .filter((e) => e.topic.trim() || e.value.trim());
    }
    knowledge.urls = normalizeKnowledgeUrlsFromDocuments(knowledge.documents, knowledge.urls);
  }

  const strategy: BrainStrategy = {
    ...DEFAULT_STRATEGY,
    voiceExamples: [],
    tabooPhrases: [],
    approvedPhrases: [],
    languageTraits: [],
    syntaxPatterns: [],
    preferredTerms: [],
    forbiddenTerms: [],
    channelIntensity: [],
    allowAbsoluteClaims: false,
    personas: [],
    funnelMessages: [],
    messageBlueprints: [],
    factsAndEvidence: [],
    generatedPieces: [],
    approvedPatterns: [],
    rejectedPatterns: [],
    visualStyle: defaultBrainVisualStyle(),
  };

  if (strategyIn && typeof strategyIn === "object") {
    const s = strategyIn as Record<string, unknown>;
    if (Array.isArray(s.voiceExamples)) {
      strategy.voiceExamples = s.voiceExamples
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x): BrainVoiceExample => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          kind:
            x.kind === "approved_voice" ||
            x.kind === "forbidden_voice" ||
            x.kind === "good_piece" ||
            x.kind === "bad_piece"
              ? x.kind
              : "approved_voice",
          label: typeof x.label === "string" ? x.label : undefined,
          text: typeof x.text === "string" ? x.text : "",
        }))
        .filter((x) => x.text.trim().length > 0);
    }
    if (Array.isArray(s.tabooPhrases)) {
      strategy.tabooPhrases = s.tabooPhrases.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(s.approvedPhrases)) {
      strategy.approvedPhrases = s.approvedPhrases.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(s.languageTraits)) {
      strategy.languageTraits = s.languageTraits.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(s.syntaxPatterns)) {
      strategy.syntaxPatterns = s.syntaxPatterns.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(s.preferredTerms)) {
      strategy.preferredTerms = s.preferredTerms.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(s.forbiddenTerms)) {
      strategy.forbiddenTerms = s.forbiddenTerms.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(s.channelIntensity)) {
      strategy.channelIntensity = s.channelIntensity
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x) => ({
          channel: typeof x.channel === "string" ? x.channel : "",
          intensity: typeof x.intensity === "number" ? Math.max(0, Math.min(100, x.intensity)) : 0,
        }))
        .filter((x) => x.channel.trim().length > 0);
    }
    if (typeof s.allowAbsoluteClaims === "boolean") {
      strategy.allowAbsoluteClaims = s.allowAbsoluteClaims;
    }
    if (Array.isArray(s.personas)) {
      strategy.personas = s.personas
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x) => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          name: typeof x.name === "string" ? x.name : "Persona",
          pain: typeof x.pain === "string" ? x.pain : "",
          channel: typeof x.channel === "string" ? x.channel : "",
          sophistication: typeof x.sophistication === "string" ? x.sophistication : "",
          tags: Array.isArray(x.tags) ? x.tags.filter((t): t is string => typeof t === "string") : [],
          objections: Array.isArray(x.objections)
            ? x.objections.filter((t): t is string => typeof t === "string")
            : [],
          proofNeeded: Array.isArray(x.proofNeeded)
            ? x.proofNeeded.filter((t): t is string => typeof t === "string")
            : [],
          attentionTriggers: Array.isArray(x.attentionTriggers)
            ? x.attentionTriggers.filter((t): t is string => typeof t === "string")
            : [],
          marketSophistication:
            typeof x.marketSophistication === "string" ? x.marketSophistication : undefined,
        }));
    }
    if (Array.isArray(s.funnelMessages)) {
      strategy.funnelMessages = s.funnelMessages
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x): BrainFunnelMessage => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          stage:
            x.stage === "awareness" ||
            x.stage === "consideration" ||
            x.stage === "conversion" ||
            x.stage === "retention"
              ? (x.stage as BrainFunnelMessage["stage"])
              : "awareness",
          text: typeof x.text === "string" ? x.text : "",
        }))
        .filter((x) => x.text.trim().length > 0);
    }
    if (Array.isArray(s.messageBlueprints)) {
      strategy.messageBlueprints = s.messageBlueprints
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x): BrainMessageBlueprint => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          claim: typeof x.claim === "string" ? x.claim : "",
          support: typeof x.support === "string" ? x.support : "",
          audience: typeof x.audience === "string" ? x.audience : "",
          channel: typeof x.channel === "string" ? x.channel : "",
          stage:
            x.stage === "awareness" ||
            x.stage === "consideration" ||
            x.stage === "conversion" ||
            x.stage === "retention"
              ? (x.stage as BrainMessageBlueprint["stage"])
              : "awareness",
          cta: typeof x.cta === "string" ? x.cta : "",
          evidence: Array.isArray(x.evidence)
            ? x.evidence.filter((t): t is string => typeof t === "string")
            : [],
        }))
        .filter((x) => x.claim.trim().length > 0);
    }
    if (Array.isArray(s.factsAndEvidence)) {
      strategy.factsAndEvidence = s.factsAndEvidence
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x): BrainFactEvidence => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          claim: typeof x.claim === "string" ? x.claim : "",
          evidence: Array.isArray(x.evidence)
            ? x.evidence.filter((t): t is string => typeof t === "string")
            : [],
          sourceDocIds: Array.isArray(x.sourceDocIds)
            ? x.sourceDocIds.filter((t): t is string => typeof t === "string")
            : [],
          strength:
            x.strength === "fuerte" || x.strength === "media" || x.strength === "debil"
              ? (x.strength as BrainFactEvidence["strength"])
              : "debil",
          verified: Boolean(x.verified),
          interpreted: Boolean(x.interpreted),
        }))
        .filter((x) => x.claim.trim().length > 0);
    }
    if (Array.isArray(s.generatedPieces)) {
      strategy.generatedPieces = s.generatedPieces
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
        .map((x) => ({
          id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
          createdAt: typeof x.createdAt === "string" ? x.createdAt : new Date().toISOString(),
          objective: typeof x.objective === "string" ? x.objective : "",
          channel: typeof x.channel === "string" ? x.channel : "",
          personaId: typeof x.personaId === "string" ? x.personaId : "",
          funnelStage: typeof x.funnelStage === "string" ? x.funnelStage : "",
          prompt: typeof x.prompt === "string" ? x.prompt : "",
          draft: typeof x.draft === "string" ? x.draft : "",
          critique: typeof x.critique === "string" ? x.critique : "",
          revised: typeof x.revised === "string" ? x.revised : "",
          status:
            x.status === "approved" || x.status === "rejected" || x.status === "draft"
              ? x.status
              : "draft",
          notes: typeof x.notes === "string" ? x.notes : undefined,
        }));
    }
    if (Array.isArray(s.approvedPatterns)) {
      strategy.approvedPatterns = s.approvedPatterns.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(s.rejectedPatterns)) {
      strategy.rejectedPatterns = s.rejectedPatterns.filter((x): x is string => typeof x === "string");
    }
    if (s.visualStyle && typeof s.visualStyle === "object") {
      const visualIn = s.visualStyle as Record<string, unknown>;
      const baseVisual = defaultBrainVisualStyle();
      const parseSlot = (
        key: BrainVisualStyleSlotKey,
        fallbackTitle: string,
      ): BrainVisualStyleSlot => {
        const raw = visualIn[key];
        if (!raw || typeof raw !== "object") {
          return {
            ...baseVisual[key],
            title: fallbackTitle,
          };
        }
        const r = raw as Record<string, unknown>;
        return {
          key,
          title: typeof r.title === "string" && r.title.trim() ? r.title : fallbackTitle,
          description: typeof r.description === "string" ? r.description : "",
          imageUrl: typeof r.imageUrl === "string" && r.imageUrl.trim() ? r.imageUrl : null,
          imageS3Key: typeof r.imageS3Key === "string" ? r.imageS3Key : undefined,
          prompt: typeof r.prompt === "string" ? r.prompt : "",
          source: r.source === "manual" ? "manual" : "auto",
        };
      };
      strategy.visualStyle = {
        protagonist: parseSlot("protagonist", "Protagonista"),
        environment: parseSlot("environment", "Entorno"),
        textures: parseSlot("textures", "Texturas"),
        people: parseSlot("people", "Personas"),
      };
    }
    if (s.visualReferenceAnalysis && typeof s.visualReferenceAnalysis === "object") {
      const v = s.visualReferenceAnalysis as Record<string, unknown>;
      const CLASS: readonly VisualImageClassification[] = [
        "CORE_VISUAL_DNA",
        "PROJECT_VISUAL_REFERENCE",
        "CONTEXTUAL_VISUAL_MEMORY",
        "RAW_ASSET_ONLY",
      ];
      const OVERRIDE: readonly BrainVisualImageUserOverride[] = [...CLASS, "EXCLUDED"];
      const SOURCE_KINDS: readonly BrainVisualImageAnalysis["sourceKind"][] = [
        "knowledge_document",
        "visual_style_slot",
        "brand_logo",
        "designer_image",
        "photoroom_image",
        "project_asset",
        "generated_image",
      ];
      const TELEM_SRC: readonly BrainVisualTelemetryImageSource[] = [
        "USER_UPLOAD",
        "BRAIN_SUGGESTION",
        "PROJECT_ASSET",
        "BRAIN_REFERENCE",
        "EXTERNAL",
        "GENERATED_IMAGE",
        "PHOTOROOM_EDIT",
        "VIDEO_FRAME",
        "MOODBOARD_REFERENCE",
      ];
      const VISION_PROVIDER_IDS: readonly BrainVisionProviderId[] = ["mock", "gemini-vision", "openai-vision"];
      const analyses: BrainVisualImageAnalysis[] = [];
      if (Array.isArray(v.analyses)) {
        for (const row of v.analyses) {
          if (!row || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const cls = CLASS.includes(r.classification as VisualImageClassification)
            ? (r.classification as VisualImageClassification)
            : "PROJECT_VISUAL_REFERENCE";
          const userOv = OVERRIDE.includes(r.userVisualOverride as BrainVisualImageUserOverride)
            ? (r.userVisualOverride as BrainVisualImageUserOverride)
            : undefined;
          const cp = r.colorPalette && typeof r.colorPalette === "object" ? (r.colorPalette as Record<string, unknown>) : {};
          const sk =
            typeof r.sourceKind === "string" && SOURCE_KINDS.includes(r.sourceKind as BrainVisualImageAnalysis["sourceKind"])
              ? (r.sourceKind as BrainVisualImageAnalysis["sourceKind"])
              : "knowledge_document";
          const vts =
            typeof r.visualTelemetrySource === "string" &&
            TELEM_SRC.includes(r.visualTelemetrySource as BrainVisualTelemetryImageSource)
              ? (r.visualTelemetrySource as BrainVisualTelemetryImageSource)
              : undefined;
          analyses.push({
            id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
            sourceAssetId: typeof r.sourceAssetId === "string" ? r.sourceAssetId : "unknown",
            sourceKind: sk,
            sourceLabel: typeof r.sourceLabel === "string" ? r.sourceLabel : undefined,
            subject: typeof r.subject === "string" ? r.subject : "",
            subjectTags: Array.isArray(r.subjectTags)
              ? r.subjectTags.filter((x): x is string => typeof x === "string")
              : undefined,
            visualStyle: Array.isArray(r.visualStyle) ? r.visualStyle.filter((x): x is string => typeof x === "string") : [],
            mood: Array.isArray(r.mood) ? r.mood.filter((x): x is string => typeof x === "string") : [],
            colorPalette: {
              dominant: Array.isArray(cp.dominant) ? cp.dominant.filter((x): x is string => typeof x === "string") : [],
              secondary: Array.isArray(cp.secondary) ? cp.secondary.filter((x): x is string => typeof x === "string") : [],
              temperature: typeof cp.temperature === "string" ? cp.temperature : undefined,
              saturation: typeof cp.saturation === "string" ? cp.saturation : undefined,
              contrast: typeof cp.contrast === "string" ? cp.contrast : undefined,
            },
            composition: Array.isArray(r.composition)
              ? r.composition.filter((x): x is string => typeof x === "string")
              : [],
            people: typeof r.people === "string" ? r.people : "",
            clothingStyle: typeof r.clothingStyle === "string" ? r.clothingStyle : "",
            graphicStyle: typeof r.graphicStyle === "string" ? r.graphicStyle : "",
            brandSignals: Array.isArray(r.brandSignals)
              ? r.brandSignals.filter((x): x is string => typeof x === "string")
              : [],
            possibleUse: Array.isArray(r.possibleUse)
              ? r.possibleUse.filter((x): x is string => typeof x === "string")
              : [],
            implicitBrandMessage: typeof r.implicitBrandMessage === "string" ? r.implicitBrandMessage : undefined,
            visualMessage: Array.isArray(r.visualMessage)
              ? r.visualMessage.filter((x): x is string => typeof x === "string")
              : undefined,
            classification: cls,
            coherenceScore: typeof r.coherenceScore === "number" ? r.coherenceScore : undefined,
            analyzedAt: typeof r.analyzedAt === "string" ? r.analyzedAt : new Date().toISOString(),
            ...(userOv ? { userVisualOverride: userOv } : {}),
            ...(typeof r.analysisDedupeKey === "string" ? { analysisDedupeKey: r.analysisDedupeKey } : {}),
            ...(typeof r.assetRef === "string" ? { assetRef: r.assetRef } : {}),
            ...(typeof r.imageFingerprint === "string" ? { imageFingerprint: r.imageFingerprint } : {}),
            ...(vts ? { visualTelemetrySource: vts } : {}),
            ...(typeof r.originNodeId === "string" ? { originNodeId: r.originNodeId } : {}),
            ...(typeof r.originNodeType === "string" ? { originNodeType: r.originNodeType } : {}),
            ...(r.usedInExport === true ? { usedInExport: true } : {}),
            ...(typeof r.pageId === "string" ? { pageId: r.pageId } : {}),
            ...(typeof r.frameId === "string" ? { frameId: r.frameId } : {}),
            ...(typeof r.fileName === "string" ? { fileName: r.fileName } : {}),
            ...(typeof r.mimeType === "string" ? { mimeType: r.mimeType } : {}),
            ...(typeof r.width === "number" ? { width: r.width } : {}),
            ...(typeof r.height === "number" ? { height: r.height } : {}),
            ...(r.peopleDetail && typeof r.peopleDetail === "object"
              ? { peopleDetail: r.peopleDetail as BrainVisualImageAnalysis["peopleDetail"] }
              : {}),
            ...(r.clothingDetail && typeof r.clothingDetail === "object"
              ? { clothingDetail: r.clothingDetail as BrainVisualImageAnalysis["clothingDetail"] }
              : {}),
            ...(r.graphicDetail && typeof r.graphicDetail === "object"
              ? { graphicDetail: r.graphicDetail as BrainVisualImageAnalysis["graphicDetail"] }
              : {}),
            ...(typeof r.reasoning === "string" ? { reasoning: r.reasoning } : {}),
            ...(typeof r.analysisStatus === "string" &&
            ["pending", "queued", "analyzing", "analyzed", "failed"].includes(r.analysisStatus as string)
              ? { analysisStatus: r.analysisStatus as BrainVisualAnalysisStatus }
              : {}),
            ...(typeof r.visionProviderId === "string" &&
            VISION_PROVIDER_IDS.includes(r.visionProviderId as BrainVisionProviderId)
              ? { visionProviderId: r.visionProviderId as BrainVisionProviderId }
              : {}),
            ...(typeof r.analyzerVersion === "string" && r.analyzerVersion.trim()
              ? { analyzerVersion: r.analyzerVersion.trim() }
              : {}),
            ...(typeof r.visionProviderAttempted === "string" &&
            VISION_PROVIDER_IDS.includes(r.visionProviderAttempted as BrainVisionProviderId)
              ? { visionProviderAttempted: r.visionProviderAttempted as BrainVisionProviderId }
              : {}),
            ...(r.fallbackUsed === true ? { fallbackUsed: true } : {}),
            ...(r.fallbackProvider === "mock" || r.fallbackProvider === "local-heuristic"
              ? { fallbackProvider: r.fallbackProvider }
              : {}),
            ...(typeof r.failureReason === "string" && r.failureReason.trim()
              ? { failureReason: r.failureReason.trim().slice(0, 800) }
              : {}),
            ...(r.imageUrlForVisionAvailable === true || r.imageUrlForVisionAvailable === false
              ? { imageUrlForVisionAvailable: r.imageUrlForVisionAvailable }
              : {}),
            ...(typeof r.analysisQuality === "string" &&
            ["specific", "acceptable", "too_generic", "failed", "mock"].includes(String(r.analysisQuality))
              ? { analysisQuality: r.analysisQuality as BrainVisualAnalysisQualityTier }
              : {}),
          });
        }
      }
      let aggregated: AggregatedVisualPatterns | undefined;
      if (v.aggregated && typeof v.aggregated === "object") {
        const g = v.aggregated as Record<string, unknown>;
        const counts = g.countsByClassification;
        const countsByClassification: Partial<Record<VisualImageClassification, number>> = {};
        if (counts && typeof counts === "object" && !Array.isArray(counts)) {
          for (const k of CLASS) {
            const n = (counts as Record<string, unknown>)[k];
            if (typeof n === "number") countsByClassification[k] = n;
          }
        }
        aggregated = {
          recurringStyles: Array.isArray(g.recurringStyles)
            ? g.recurringStyles.filter((x): x is string => typeof x === "string")
            : [],
          dominantMoods: Array.isArray(g.dominantMoods) ? g.dominantMoods.filter((x): x is string => typeof x === "string") : [],
          dominantPalette: Array.isArray(g.dominantPalette)
            ? g.dominantPalette.filter((x): x is string => typeof x === "string")
            : [],
          dominantSecondaryPalette: Array.isArray(g.dominantSecondaryPalette)
            ? g.dominantSecondaryPalette.filter((x): x is string => typeof x === "string")
            : [],
          frequentSubjects: Array.isArray(g.frequentSubjects)
            ? g.frequentSubjects.filter((x): x is string => typeof x === "string")
            : [],
          compositionNotes: Array.isArray(g.compositionNotes)
            ? g.compositionNotes.filter((x): x is string => typeof x === "string")
            : [],
          peopleClothingNotes: Array.isArray(g.peopleClothingNotes)
            ? g.peopleClothingNotes.filter((x): x is string => typeof x === "string")
            : [],
          graphicStyleNotes: Array.isArray(g.graphicStyleNotes)
            ? g.graphicStyleNotes.filter((x): x is string => typeof x === "string")
            : [],
          implicitBrandMessages: Array.isArray(g.implicitBrandMessages)
            ? g.implicitBrandMessages.filter((x): x is string => typeof x === "string")
            : [],
          narrativeSummary: typeof g.narrativeSummary === "string" ? g.narrativeSummary : "",
          countsByClassification,
          excludedFromVisualDnaCount:
            typeof g.excludedFromVisualDnaCount === "number" ? g.excludedFromVisualDnaCount : 0,
          ...(Array.isArray(g.outlierSourceAssetIds)
            ? {
                outlierSourceAssetIds: g.outlierSourceAssetIds.filter((x): x is string => typeof x === "string"),
              }
            : {}),
          ...(typeof g.patternConfidence === "number" && Number.isFinite(g.patternConfidence)
            ? { patternConfidence: g.patternConfidence }
            : {}),
          ...(typeof g.patternSummary === "string" && g.patternSummary.trim() ? { patternSummary: g.patternSummary.trim() } : {}),
        };
      }
      const lastProv =
        typeof v.lastVisionProviderId === "string" &&
        VISION_PROVIDER_IDS.includes(v.lastVisionProviderId as BrainVisionProviderId)
          ? (v.lastVisionProviderId as BrainVisionProviderId)
          : undefined;
      const confirmedVisualPatterns = Array.isArray(v.confirmedVisualPatterns)
        ? v.confirmedVisualPatterns.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : undefined;
      const dnaCollageImageDataUrl =
        typeof v.dnaCollageImageDataUrl === "string" && v.dnaCollageImageDataUrl.trim().length > 0
          ? v.dnaCollageImageDataUrl.trim()
          : undefined;
      const dnaCollageSourceFingerprint =
        typeof v.dnaCollageSourceFingerprint === "string" && v.dnaCollageSourceFingerprint.trim().length > 0
          ? v.dnaCollageSourceFingerprint.trim()
          : undefined;
      const dnaCollageGeneratedAt =
        typeof v.dnaCollageGeneratedAt === "string" && v.dnaCollageGeneratedAt.trim().length > 0
          ? v.dnaCollageGeneratedAt.trim()
          : undefined;
      const brandVisualDnaBundle = parseBrandVisualDnaBundle(v.brandVisualDnaBundle);
      strategy.visualReferenceAnalysis = {
        analyses,
        aggregated,
        lastAnalyzedAt: typeof v.lastAnalyzedAt === "string" ? v.lastAnalyzedAt : undefined,
        analyzerVersion: typeof v.analyzerVersion === "string" ? v.analyzerVersion : undefined,
        ...(lastProv ? { lastVisionProviderId: lastProv } : {}),
        ...(confirmedVisualPatterns?.length ? { confirmedVisualPatterns } : {}),
        ...(dnaCollageImageDataUrl ? { dnaCollageImageDataUrl } : {}),
        ...(dnaCollageSourceFingerprint ? { dnaCollageSourceFingerprint } : {}),
        ...(dnaCollageGeneratedAt ? { dnaCollageGeneratedAt } : {}),
        ...(brandVisualDnaBundle ? { brandVisualDnaBundle } : {}),
      };
    }
    const brandVisualSynth = normalizeBrandVisualDna(s.brandVisualDna);
    if (brandVisualSynth) strategy.brandVisualDna = brandVisualSynth;
    if (s.contentDna && typeof s.contentDna === "object") {
      const c = s.contentDna as ContentDna;
      strategy.contentDna = {
        ...c,
        audienceProfiles: Array.isArray(c.audienceProfiles) ? c.audienceProfiles : [],
        contentPillars: Array.isArray(c.contentPillars) ? c.contentPillars.filter((x): x is string => typeof x === "string") : [],
        topics: Array.isArray(c.topics) ? c.topics.filter((x): x is string => typeof x === "string") : [],
        trendOpportunities: Array.isArray(c.trendOpportunities)
          ? c.trendOpportunities.filter((x): x is string => typeof x === "string")
          : [],
        preferredFormats: Array.isArray(c.preferredFormats)
          ? c.preferredFormats.filter((x): x is string => typeof x === "string")
          : [],
        articleStructures: Array.isArray(c.articleStructures)
          ? c.articleStructures.filter((x): x is string => typeof x === "string")
          : [],
        forbiddenClaims: Array.isArray(c.forbiddenClaims)
          ? c.forbiddenClaims.filter((x): x is string => typeof x === "string")
          : [],
        approvedClaims: Array.isArray(c.approvedClaims)
          ? c.approvedClaims.filter((x): x is string => typeof x === "string")
          : [],
        writingDo: Array.isArray(c.writingDo) ? c.writingDo.filter((x): x is string => typeof x === "string") : [],
        writingAvoid: Array.isArray(c.writingAvoid) ? c.writingAvoid.filter((x): x is string => typeof x === "string") : [],
        narrativeAngles: Array.isArray(c.narrativeAngles)
          ? c.narrativeAngles.filter((x): x is string => typeof x === "string")
          : [],
        evidence: Array.isArray(c.evidence) ? c.evidence : [],
        confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
      };
    }
    const safeRules = normalizeSafeCreativeRules(s.safeCreativeRules);
    if (safeRules) strategy.safeCreativeRules = safeRules;
    if (Array.isArray(s.visualDnaSlots)) {
      strategy.visualDnaSlots = normalizeVisualDnaSlots(s.visualDnaSlots);
    }
    {
      const docIds = new Set(knowledge.documents.map((d) => d.id));
      const suppressed = normalizeVisualDnaSlotSuppressedSourceIds(s.visualDnaSlotSuppressedSourceIds, docIds);
      if (suppressed.length) strategy.visualDnaSlotSuppressedSourceIds = suppressed;
      else delete strategy.visualDnaSlotSuppressedSourceIds;
    }
    if (s.fieldProvenance && typeof s.fieldProvenance === "object") {
      const fp = s.fieldProvenance as Record<string, unknown>;
      const TIERS: readonly BrainSourceTier[] = [
        "confirmed",
        "core_document",
        "visual_real",
        "user_manual",
        "pending",
        "heuristic",
        "mock",
        "default",
        "legacy",
        "unknown",
      ];
      const nextFp: BrainStrategyFieldProvenance = { ...(strategy.fieldProvenance ?? {}) };
      for (const [k, val] of Object.entries(fp)) {
        if (!val || typeof val !== "object") continue;
        const o = val as Record<string, unknown>;
        const tierRaw = typeof o.sourceTier === "string" ? o.sourceTier : "unknown";
        const tier = TIERS.includes(tierRaw as BrainSourceTier) ? (tierRaw as BrainSourceTier) : "unknown";
        const confRaw = o.sourceConfidence;
        const sourceConfidence: BrainSourceConfidence =
          confRaw === "high" || confRaw === "medium" || confRaw === "low" ? confRaw : "medium";
        const row: BrainFieldSourceInfo = {
          label: typeof o.label === "string" ? o.label.slice(0, 200) : k,
          sourceTier: tier,
          sourceConfidence,
          ...(typeof o.updatedAt === "string" ? { updatedAt: o.updatedAt } : {}),
          ...(typeof o.value === "string" && o.value.trim() ? { value: o.value.trim().slice(0, 500) } : {}),
          ...(typeof o.badge === "string" && o.badge.trim() ? { badge: o.badge.trim().slice(0, 64) } : {}),
          ...(typeof o.changedPath === "string" && o.changedPath.trim()
            ? { changedPath: o.changedPath.trim().slice(0, 200) }
            : {}),
          ...(Array.isArray(o.assetIds) ? { assetIds: o.assetIds.filter((x): x is string => typeof x === "string") } : {}),
          ...(Array.isArray(o.documentIds)
            ? { documentIds: o.documentIds.filter((x): x is string => typeof x === "string") }
            : {}),
          ...(Array.isArray(o.imageIds) ? { imageIds: o.imageIds.filter((x): x is string => typeof x === "string") } : {}),
          ...(Array.isArray(o.learningIds)
            ? { learningIds: o.learningIds.filter((x): x is string => typeof x === "string") }
            : {}),
          ...(typeof o.analyzerVersion === "string" ? { analyzerVersion: o.analyzerVersion } : {}),
          ...(typeof o.provider === "string" ? { provider: o.provider } : {}),
          ...(o.fallbackUsed === true ? { fallbackUsed: true } : {}),
        };
        nextFp[k] = row;
      }
      strategy.fieldProvenance = nextFp;
    }
    if (Array.isArray(s.decisionTraces)) {
      const traces = capDecisionTraces(s.decisionTraces, { max: 50, order: "desc", payloadRiskMax: 25 });
      if (traces.length) strategy.decisionTraces = traces;
      else delete strategy.decisionTraces;
    }
  }

  return { brand, knowledge, strategy, brainMeta };
}

/** Texto compacto para el asistente del lienzo (sin data URLs de logos). */
export function summarizeProjectAssetsForAssistant(raw: unknown): string {
  const a = normalizeProjectAssets(raw);
  const nUrl = a.knowledge.urls.length;
  const nDoc = a.knowledge.documents.length;
  const hasPos = Boolean(a.brand.logoPositive);
  const hasNeg = Boolean(a.brand.logoNegative);
  return [
    `Brand colors (hex): primary ${a.brand.colorPrimary}, secondary ${a.brand.colorSecondary}, accent ${a.brand.colorAccent}.`,
    `Logos in Brain: positive=${hasPos ? "yes" : "no"}, negative=${hasNeg ? "yes" : "no"}.`,
    `Knowledge: ${nUrl} link(s), ${nDoc} document(s).`,
    `Analyzed docs: ${a.knowledge.documents.filter((d) => d.status === "Analizado").length}.`,
    `Personas: ${a.strategy.personas.length}.`,
    `Voice examples: ${a.strategy.voiceExamples.length}.`,
    `Facts & evidence: ${a.strategy.factsAndEvidence.length}.`,
    `Visual style: protagonist="${a.strategy.visualStyle.protagonist.description || "-"}"; environment="${a.strategy.visualStyle.environment.description || "-"}"; textures="${a.strategy.visualStyle.textures.description || "-"}"; people="${a.strategy.visualStyle.people.description || "-"}".`,
    (() => {
      const v = a.strategy.visualReferenceAnalysis;
      const n = v?.analyses?.length ?? 0;
      const sum = v?.aggregated?.narrativeSummary?.trim();
      if (sum) return `Visual references (Brain): ${sum}`;
      return `Visual reference images analyzed in Brain: ${n}.`;
    })(),
  ].join(" ");
}
