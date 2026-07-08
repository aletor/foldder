/**
 * B6 — Síntesis LLM de ejemplos de voz para el capítulo Voz del libro de estilo.
 */

import type { BrainVoiceExample, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  buildRawArtifactOptions,
  resolveProjectableTagline,
  resolveProjectableToneTraits,
} from "./voice-projection";
import { bootstrapSidecarFromAssets } from "./board-projection";
import type { EvidenceRef } from "./types";
import { getMeta, normalizeBrandKitBoardMeta, patchMeta } from "./interpretation";

export const VOICE_EXAMPLES_ELEMENT_KEY = "voice.examples" as const;
export const VOICE_SYNTHESIS_SOURCE_ID = "brandkit-style-guide-voice";

export type VoiceSynthesisContext = {
  tagline: string;
  toneTraits: string[];
  approvedPhrases: string[];
  tabooPhrases: string[];
  forbiddenTerms: string[];
  messageClaims: string[];
  existingExamples: BrainVoiceExample[];
};

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function buildVoiceSynthesisContext(rawAssets: unknown): VoiceSynthesisContext {
  const assets = normalizeProjectAssets(rawAssets);
  const boardMeta = bootstrapSidecarFromAssets(assets);
  const artifactOptions = buildRawArtifactOptions(assets);
  return {
    tagline: resolveProjectableTagline(assets, boardMeta, artifactOptions) ?? "",
    toneTraits: resolveProjectableToneTraits(assets, artifactOptions).slice(0, 8),
    approvedPhrases: assets.strategy.approvedPhrases.slice(0, 8),
    tabooPhrases: assets.strategy.tabooPhrases.slice(0, 8),
    forbiddenTerms: assets.strategy.forbiddenTerms.slice(0, 8),
    messageClaims: assets.strategy.messageBlueprints
      .map((bp) => bp.claim.trim())
      .filter(Boolean)
      .slice(0, 5),
    existingExamples: assets.strategy.voiceExamples.slice(0, 6),
  };
}

export function buildVoiceSynthesisPrompt(context: VoiceSynthesisContext): string {
  return [
    "Eres estratega de marca. Genera ejemplos de voz para un libro de estilo.",
    "Idioma: español de España (es-ES).",
    "Devuelve SOLO JSON con esta forma:",
    '{"voiceExamples":[{"kind":"approved_voice|forbidden_voice|good_piece|bad_piece","label":"string opcional","text":"string"}]}',
    "Reglas:",
    "- Entre 4 y 8 ejemplos.",
    "- Al menos 2 approved_voice o good_piece y al menos 1 forbidden_voice o bad_piece.",
    "- Frases cortas, aplicables a copy real (titular, post, email).",
    "- No inventes claims legales ni promesas absolutas si el contexto las prohíbe.",
    "",
    `Mensaje principal: ${context.tagline || "(pendiente)"}`,
    `Tono: ${context.toneTraits.join(", ") || "(pendiente)"}`,
    `Claims: ${context.messageClaims.join(" · ") || "(ninguno)"}`,
    `Frases aprobadas: ${context.approvedPhrases.join(" · ") || "(ninguna)"}`,
    `Evitar: ${[...context.tabooPhrases, ...context.forbiddenTerms].join(" · ") || "(ninguna)"}`,
    context.existingExamples.length
      ? `Ejemplos actuales (puedes mejorar, no copies literal): ${context.existingExamples.map((e) => e.text).join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseVoiceSynthesisResponse(raw: unknown): BrainVoiceExample[] {
  const payload =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const list = Array.isArray(payload.voiceExamples) ? payload.voiceExamples : Array.isArray(raw) ? raw : [];
  const out: BrainVoiceExample[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const kind =
      row.kind === "approved_voice" ||
      row.kind === "forbidden_voice" ||
      row.kind === "good_piece" ||
      row.kind === "bad_piece"
        ? row.kind
        : "approved_voice";
    const text = cleanText(row.text, 420);
    if (!text) continue;
    out.push({
      id: crypto.randomUUID(),
      kind,
      label: cleanText(row.label, 60) || undefined,
      text,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export function voiceExampleKindLabelEs(kind: BrainVoiceExample["kind"]): string {
  if (kind === "approved_voice") return "Voz aprobada";
  if (kind === "forbidden_voice") return "Voz prohibida";
  if (kind === "good_piece") return "Buen ejemplo";
  return "Mal ejemplo";
}

export function buildVoiceSynthesisEvidence(extractedAt = new Date().toISOString()): EvidenceRef[] {
  return [
    {
      sourceId: VOICE_SYNTHESIS_SOURCE_ID,
      kind: "llm-synthesis",
      detail: "style-guide-voice-examples",
      confidence: 0.78,
      extractedAt,
    },
  ];
}

export function applyVoiceExamplesSynthesisOnAssets(
  assets: ProjectAssetsMetadata,
  examples: BrainVoiceExample[],
  extractedAt = new Date().toISOString(),
): ProjectAssetsMetadata {
  const boardMeta = normalizeBrandKitBoardMeta(assets.brainMeta?.boardMeta);
  const nextMeta = {
    ...getMeta(boardMeta, VOICE_EXAMPLES_ELEMENT_KEY),
    status: "proposed" as const,
    confidence: 0.78,
    evidence: buildVoiceSynthesisEvidence(extractedAt),
    proposedAt: extractedAt,
  };
  return {
    ...assets,
    strategy: {
      ...assets.strategy,
      voiceExamples: examples,
    },
    brainMeta: {
      brainVersion: assets.brainMeta?.brainVersion ?? 1,
      analysisStatus: assets.brainMeta?.analysisStatus ?? "idle",
      staleReasons: assets.brainMeta?.staleReasons ?? [],
      ...assets.brainMeta,
      boardMeta: patchMeta(boardMeta, VOICE_EXAMPLES_ELEMENT_KEY, nextMeta),
    },
  };
}

export function hasPendingVoiceSynthesis(boardMetaInput: unknown): boolean {
  const boardMeta = normalizeBrandKitBoardMeta(boardMetaInput);
  const meta = getMeta(boardMeta, VOICE_EXAMPLES_ELEMENT_KEY);
  return meta.evidence.some((evidence) => evidence.kind === "llm-synthesis") && meta.status !== "validated";
}
