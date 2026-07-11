/**
 * B6 — Compuerta de impresión del libro de estilo (modo cliente).
 */

import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import { bootstrapSidecarFromAssets } from "./board-projection";
import { getMeta } from "./interpretation";
import { hasPendingVoiceSynthesis, VOICE_EXAMPLES_ELEMENT_KEY } from "./synthesize-voice-examples";
import type { StyleGuideExportMode } from "./style-guide-export-types";

export type StyleGuidePrintBlockerCode = "voice_examples_not_validated" | "voice_examples_conflict";

export type StyleGuidePrintBlocker = {
  code: StyleGuidePrintBlockerCode;
  message: string;
};

export type StyleGuidePrintGateResult = {
  allowed: boolean;
  blockers: StyleGuidePrintBlocker[];
};

export function evaluateStyleGuidePrintGate(
  rawAssets: unknown,
  exportMode: StyleGuideExportMode,
): StyleGuidePrintGateResult {
  if (exportMode !== "cliente") {
    return { allowed: true, blockers: [] };
  }

  const assets = normalizeProjectAssets(rawAssets);
  const boardMeta = bootstrapSidecarFromAssets(assets);
  const voiceMeta = getMeta(boardMeta, VOICE_EXAMPLES_ELEMENT_KEY);

  if (voiceMeta.status === "conflict") {
    return {
      allowed: false,
      blockers: [
        {
          code: "voice_examples_conflict",
          message: "Resuelve el conflicto en ejemplos de voz antes de exportar el PDF cliente.",
        },
      ],
    };
  }

  if (hasPendingVoiceSynthesis(boardMeta)) {
    return {
      allowed: false,
      blockers: [
        {
          code: "voice_examples_not_validated",
          message: "Valida los ejemplos de voz en el Board antes de exportar el PDF cliente.",
        },
      ],
    };
  }

  return { allowed: true, blockers: [] };
}
