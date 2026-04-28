import { randomUUID } from "crypto";
import type { BrainStrategy } from "@/app/spaces/project-assets-metadata";
import type { BrainBrandVisualDna } from "./brain-creative-memory-types";
import type { SafeCreativeRules } from "./brain-creative-memory-types";

export function normalizeSafeCreativeRules(raw: unknown): SafeCreativeRules | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const strArr = (k: string) => (Array.isArray(o[k]) ? o[k].filter((x): x is string => typeof x === "string") : []);
  const evidence = Array.isArray(o.evidence)
    ? o.evidence
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === "object"))
        .map((e) => ({
          id: typeof e.id === "string" ? e.id : randomUUID(),
          sourceType: "manual" as const,
          reason: typeof e.reason === "string" ? e.reason : "rule",
        }))
    : [];
  return {
    schemaVersion: typeof o.schemaVersion === "string" ? o.schemaVersion : "1.0.0",
    visualAbstractionRules: strArr("visualAbstractionRules"),
    imageGenerationAvoid: strArr("imageGenerationAvoid"),
    protectedReferencePolicy: typeof o.protectedReferencePolicy === "string" ? o.protectedReferencePolicy : undefined,
    writingClaimRules: strArr("writingClaimRules"),
    brandSafetyRules: strArr("brandSafetyRules"),
    legalOrComplianceWarnings: strArr("legalOrComplianceWarnings"),
    canUse: strArr("canUse"),
    shouldAvoid: strArr("shouldAvoid"),
    doNotGenerate: strArr("doNotGenerate"),
    evidence,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  };
}

export function buildSafeCreativeRulesFromAssets(input: {
  strategy: BrainStrategy;
  brandVisualDna?: BrainBrandVisualDna | null;
}): SafeCreativeRules {
  const taboo = [...(input.strategy.tabooPhrases ?? []), ...(input.strategy.forbiddenTerms ?? [])]
    .map((s) => s.trim())
    .filter(Boolean);
  const dnaAvoid = input.brandVisualDna?.globalVisualRules.avoid ?? [];
  const dnaSafe = input.brandVisualDna?.globalVisualRules.safeGenerationRules ?? [];

  return {
    schemaVersion: "1.0.0",
    visualAbstractionRules: [
      "Prioriza abstracciones de luz, composición y materiales reutilizables.",
      "No guardes ni reinyectes prompts literales para clonar una imagen concreta.",
    ],
    imageGenerationAvoid: [
      ...dnaAvoid.slice(0, 20),
      "imitar campañas, artistas, fotógrafos o IPs identificables",
      "solicitudes tipo «hazlo igual que esta imagen» basadas en referencias literales",
    ],
    protectedReferencePolicy:
      "Las referencias visuales sirven para coherencia de estilo abstracto, no para reproducir piezas de terceros.",
    writingClaimRules: [
      "No inventar cifras, premios ni claims sin evidencia en hechos documentados.",
      "Marcar como inferencia lo que no esté respaldado en factsAndEvidence.",
    ],
    brandSafetyRules: ["Respetar tabúes y términos prohibidos de la estrategia Brain."],
    legalOrComplianceWarnings: [],
    canUse: [...(input.strategy.preferredTerms ?? []).slice(0, 12), ...dnaSafe.slice(0, 10)],
    shouldAvoid: taboo.slice(0, 24),
    doNotGenerate: [
      ...taboo.slice(0, 12),
      "nombres de marcas externas como descriptor de estilo",
      "identificación de celebridades o personajes protegidos como referencia de generación",
    ],
    evidence: [
      {
        id: randomUUID(),
        sourceType: "analysis",
        field: "safe_creative_rules",
        reason: "Reglas derivadas de estrategia Brain + ADN visual sintetizado (sin borrado de pendientes en servidor).",
        confidence: 0.55,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

const MAX_APPEND_LINES = 28;

/** Bloque de texto a añadir al prompt de generación de imagen (Nano Banana / similares). */
export function buildSafeCreativeRulesPromptAppendix(rules: SafeCreativeRules | undefined): string {
  if (!rules) return "";
  const lines: string[] = [];
  lines.push("=== Reglas creativas seguras (Brain) ===");
  if (rules.protectedReferencePolicy) lines.push(`Política de referencias: ${rules.protectedReferencePolicy}`);
  for (const r of rules.visualAbstractionRules.slice(0, 8)) {
    if (r.trim()) lines.push(`Abstracción visual: ${r}`);
  }
  for (const r of rules.imageGenerationAvoid.slice(0, MAX_APPEND_LINES)) {
    if (r.trim()) lines.push(`Evitar en imagen: ${r}`);
  }
  for (const r of rules.doNotGenerate.slice(0, 12)) {
    if (r.trim()) lines.push(`No generar: ${r}`);
  }
  for (const r of rules.shouldAvoid.slice(0, 10)) {
    if (r.trim()) lines.push(`Evitar: ${r}`);
  }
  lines.push(
    "No clonar composiciones literales de referencias ni recrear piezas identificables de terceros.",
    "No usar nombres de campañas, artistas, fotógrafos, celebridades ni IPs como estilo.",
    'No producir instrucciones tipo «make it like this image» o «igual que la referencia».',
    "Usar solo abstracciones visuales del ADN de marca; priorizar análisis remoto fiable frente a mock como señal fuerte.",
  );
  return lines.join("\n").trim();
}
