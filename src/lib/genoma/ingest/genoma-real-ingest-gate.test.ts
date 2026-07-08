/**
 * Gate honesto de ingesta — mismo path que la app (`ingestPdfIntoGenome`, sin audit cacheado).
 *
 * NO usa pageVisionAuditFixture. NO salta Fase A.
 * Sin GEMINI_API_KEY/GOOGLE_API_KEY válida en .env.local: FALLA explícitamente (nunca verde por omitir LLM).
 *
 * Verde = Fase A completed + logo de marca (no fallback DRA/11 por abort).
 */

import { vi } from "vitest";

vi.mock("./genoma-ingest-wallet", () => ({
  reserveGenomaIngestAnalysisCharge: vi.fn(async () => null),
  releaseGenomaIngestAnalysisCharge: vi.fn(async () => {}),
  settleGenomaIngestAnalysisCharge: vi.fn(async () => {}),
}));

vi.mock("./genoma-source-pdf-store", () => ({
  persistGenomaSourcePdf: vi.fn(async () => {}),
}));

import fs from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import {
  GEMINI_KEY_ERROR_MESSAGE,
  isValidGeminiApiKey,
  loadScriptEnv,
  resolveGeminiApiKey,
} from "../../../../scripts/load-script-env";
import {
  CATALOGO26_FILENAME,
  CATALOGO26_PDF,
  hasCatalogo26Pdf,
} from "../fixtures/brandkit-paths";
import { emptyGenome, getTrait } from "../model/trait";
import type { LogoValue } from "../model/trait-values";
import { ingestPdfIntoGenome } from "./pdf-ingest-server";
import { wordmarkIntegrityPasses } from "./page-vision-wordmark-integrity";

function loadNextEnvLikeApp(): void {
  loadScriptEnv();
}

function requireValidGeminiApiKeyForRealIngest(): string {
  const key = resolveGeminiApiKey();
  if (!isValidGeminiApiKey(key)) {
    expect.fail(
      `${GEMINI_KEY_ERROR_MESSAGE} — este test ejecuta ingesta REAL (LLM batch), no audits cacheados.`,
    );
  }
  return key;
}

describe.skipIf(!hasCatalogo26Pdf())("genoma real ingest gate · catalogo26", () => {
  beforeAll(() => {
    loadNextEnvLikeApp();
  });

  it("requiere API key válida (falla visible, no skip silencioso)", () => {
    requireValidGeminiApiKeyForRealIngest();
  });

  it(
    "ingesta e2e real sin pageVisionAuditFixture — Fase A completed y logo ATRESMEDIA",
    async () => {
      requireValidGeminiApiKeyForRealIngest();

      const prevPass = process.env.GENOMA_PAGE_VISION_PASS_ENABLED;
      const prevNivel1 = process.env.GENOMA_PAGE_VISION_NIVEL1;
      process.env.GENOMA_PAGE_VISION_PASS_ENABLED = "1";
      process.env.GENOMA_PAGE_VISION_NIVEL1 = "1";

      try {
        const buffer = fs.readFileSync(CATALOGO26_PDF);
        let genome = emptyGenome();
        let pageVisionSummary: string | undefined;
        let pageVisionStatus: string | undefined;

        for await (const event of ingestPdfIntoGenome(buffer, CATALOGO26_FILENAME, genome, {
          allowPaidAnalysis: true,
          allowMaterialPrompts: false,
        })) {
          if (event.type === "page_vision_pass") {
            pageVisionStatus = event.status;
            pageVisionSummary = event.summary;
          }
          if (event.type === "genome_update") genome = event.genome;
        }

        const meta = genome.sources[0]?.pageVisionPass;
        expect(meta?.skipReason, `Fase A abortó: ${meta?.summary ?? pageVisionSummary}`).not.toBe(
          "ingest_error",
        );
        expect(meta?.status).toBe("completed");
        expect(pageVisionStatus).toBe("completed");

        const trait = getTrait(genome, "logo.primary");
        expect(trait?.crownedIds?.length).toBe(1);
        const crowned = trait?.candidates.find((c) => c.id === trait!.crownedIds![0]);
        const logo = crowned?.value as LogoValue | undefined;
        expect(logo?.label).not.toMatch(/^DRA\//);
        expect(wordmarkIntegrityPasses(crowned?.signals ?? [])).toBe(true);
        expect(logo?.assetOrigin).toBe("vector_native");
      } finally {
        if (prevPass === undefined) delete process.env.GENOMA_PAGE_VISION_PASS_ENABLED;
        else process.env.GENOMA_PAGE_VISION_PASS_ENABLED = prevPass;
        if (prevNivel1 === undefined) delete process.env.GENOMA_PAGE_VISION_NIVEL1;
        else process.env.GENOMA_PAGE_VISION_NIVEL1 = prevNivel1;
      }
    },
    180_000,
  );
});
