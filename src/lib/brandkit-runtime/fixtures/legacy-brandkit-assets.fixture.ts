import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";

/** Proyecto legacy representativo (sin boardMeta) para regresión T1. */
export const LEGACY_BRANDKIT_RUNTIME_FIXTURE: ProjectAssetsMetadata = {
  brand: {
    logoPositive: "data:image/png;base64,legacyLogoPositive",
    logoNegative: null,
    colorPrimary: "#112233",
    colorSecondary: "#AABBCC",
    colorAccent: "#FF5500",
  },
  knowledge: {
    urls: ["https://example.com/brand"],
    corporateContext: "Marca orientada a rendimiento y claridad.",
    documents: [
      {
        id: "doc-legacy-1",
        name: "BrandBook.pdf",
        size: 1024,
        mime: "application/pdf",
        status: "Analizado",
        scope: "core",
        brainSourceScope: "brand",
        s3Path: "knowledge-files/user-assets/test/brain/knowledge/legacy-brand.pdf",
        extractedContext: JSON.stringify({ tone: "directo" }),
      },
    ],
    projectOnlyMemories: [],
    contextualMemories: [],
  },
  brainMeta: {
    brainVersion: 3,
    analysisStatus: "idle",
    staleReasons: [],
    lastKnowledgeAnalysisAt: "2026-03-15T10:00:00.000Z",
  },
  strategy: {
    voiceExamples: [
      { id: "v1", kind: "approved_voice", text: "Hablamos claro, sin hype vacío." },
    ],
    tabooPhrases: ["gratis para siempre"],
    approvedPhrases: ["rendimiento real"],
    languageTraits: ["directo", "técnico", "cercano"],
    syntaxPatterns: ["frases cortas"],
    preferredTerms: ["rendimiento"],
    forbiddenTerms: ["milagro"],
    channelIntensity: [{ channel: "social", intensity: 0.7 }],
    allowAbsoluteClaims: false,
    personas: [
      {
        id: "p1",
        name: "Director creativo",
        pain: "Necesita coherencia de marca",
        channel: "LinkedIn",
        sophistication: "alta",
        tags: ["B2B"],
      },
    ],
    funnelMessages: [
      { id: "fm1", stage: "awareness", text: "Claridad visual para equipos exigentes." },
    ],
    messageBlueprints: [
      {
        id: "mb1",
        claim: "Coherencia sin fricción",
        support: "Un solo BrandKit para todo el pipeline",
        audience: "Equipos creativos",
        channel: "web",
        stage: "consideration",
        cta: "Probar Foldder",
        evidence: ["doc-legacy-1"],
      },
    ],
    factsAndEvidence: [],
    generatedPieces: [],
    approvedPatterns: [],
    rejectedPatterns: [],
    visualStyle: {
      protagonist: {
        key: "protagonist",
        title: "Protagonista",
        description: "Producto en primer plano, luz lateral suave.",
        imageUrl: null,
        source: "auto",
      },
      environment: {
        key: "environment",
        title: "Entorno",
        description: "Espacios industriales limpios, luz natural.",
        imageUrl: null,
        source: "auto",
      },
      textures: {
        key: "textures",
        title: "Texturas",
        description: "Metal cepillado y hormigón mate.",
        imageUrl: null,
        source: "auto",
      },
      people: {
        key: "people",
        title: "Personas",
        description: "Profesionales en acción, nunca posando a cámara.",
        imageUrl: null,
        source: "auto",
      },
      objects: {
        key: "objects",
        title: "Objetos",
        description: "Herramientas de precisión, detalle macro.",
        imageUrl: null,
        source: "auto",
      },
    },
  },
};
