import type { Candidate, LogoValue, Provenance } from "./genoma-types";
import type { PageVisionPassRunAudit } from "./ingest/page-vision-pass-runner";
import {
  isPageVisionNivel1Enabled,
  runPageVisionPassNivel1ForPdf,
} from "./ingest/page-vision-pass-nivel1-runner";
import { runPageVisionPassForPdf } from "./ingest/page-vision-pass-runner";
import {
  buildProvisionalLogoCandidatesFromPageVision,
  pageVisionAuditHasLogos,
} from "./ingest/page-vision-pass-apply";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { extractPdfPaletteForGenome } from "./ingest/pdf-palette-extract";
import { extractTypographyFromPdf, type TypographyExtraction } from "./extractors/typography";
import { bufferContentSha256 } from "./ingest/paid-operations-server";
import { persistGenomaSourcePdf } from "./ingest/genoma-source-pdf-store";
import { mapVisionLogoEntryToCandidate } from "./genoma-pdf-logo-vision";

export { isLikelyBrandManualPdf } from "./genoma-pdf-brand-manual-detect";

function fileProvenance(fileId: string, detail: string): Provenance {
  return { type: "file_upload", detail, fileId };
}

export function paletteSignalsFromPageVisionAudit(
  audit: PageVisionPassRunAudit,
  fileName: string,
  contentSha256: string,
): { hex: string; provenance: Provenance; weight?: number }[] {
  const out: { hex: string; provenance: Provenance; weight?: number }[] = [];
  const seen = new Set<string>();
  for (const page of audit.pages) {
    if (!page.ok || !page.result) continue;
    for (const image of page.result.images) {
      for (const raw of image.visualDna.paletaAprox) {
        const hex = raw.trim();
        if (hex === "unknown" || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
        const key = hex.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          hex: key,
          provenance: {
            type: "pdf_xobject",
            detail: `visión PDF · pág. ${page.pageNumber} · ${fileName}`,
            fileId: contentSha256,
          },
          weight: 0.88,
        });
      }
    }
  }
  return out;
}

export function typographyFamiliesFromPageVisionAudit(audit: PageVisionPassRunAudit): string[] {
  const families = new Set<string>();
  for (const page of audit.pages) {
    if (!page.ok || !page.result) continue;
    for (const role of page.result.typographyRoles) {
      const style = role.styleObserved?.trim();
      if (style && style !== "unknown" && style.length >= 2) families.add(style);
    }
  }
  return [...families];
}

export function typographyFamiliesFromExtraction(extraction: TypographyExtraction): string[] {
  const families: string[] = [];
  for (const candidate of [...extraction.primary, ...extraction.secondary]) {
    const family = candidate.value.family?.trim();
    if (family) families.push(family);
  }
  return families;
}

function brandManualVisionPageNumbers(totalPages: number): number[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 12) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const picked = new Set<number>([1, 2, 3, 4, totalPages]);
  if (totalPages >= 2) picked.add(totalPages - 1);
  return [...picked].sort((a, b) => a - b);
}

async function runBrandManualVisionAudit(input: {
  buffer: Buffer;
  fileName: string;
  contentSha256: string;
  userEmail: string;
  route?: string;
  totalPages: number;
}): Promise<PageVisionPassRunAudit> {
  const forcedPageNumbers = brandManualVisionPageNumbers(input.totalPages);
  const passInput = {
    buffer: input.buffer,
    fileName: input.fileName,
    contentSha256: input.contentSha256,
    userEmail: input.userEmail,
    route: input.route ?? "/api/spaces/genoma/ingest",
    writeAudit: false as const,
    forcedPageNumbers,
  };

  if (isPageVisionNivel1Enabled()) {
    return runPageVisionPassNivel1ForPdf(passInput);
  }

  return runPageVisionPassForPdf({
    ...passInput,
    selectionScope: "guaranteed-only",
  });
}

export type BrandManualVisualExtractResult = {
  logoCandidates: Candidate<LogoValue>[];
  paletteSignals: { hex: string; provenance: Provenance; weight?: number }[];
  typographyFamilies: string[];
  contentSha256: string;
  pdfStorageKey: string;
  totalPages: number;
  visionDetail?: string;
};

export async function extractBrandManualVisualsFromPdf(input: {
  buffer: Buffer;
  fileName: string;
  userEmail: string;
  route?: string;
  visionEnabled?: boolean;
}): Promise<BrandManualVisualExtractResult> {
  const contentSha256 = bufferContentSha256(input.buffer);
  const totalPages = await countPdfPagesInBuffer(input.buffer, 200).catch(() => 0);
  const pdfStorageKey = await persistGenomaSourcePdf(input.userEmail, contentSha256, input.buffer);

  const paletteSignals: BrandManualVisualExtractResult["paletteSignals"] = [];
  const typographyFamilies: string[] = [];
  const logoCandidates: Candidate<LogoValue>[] = [];

  const paletteExtract = await extractPdfPaletteForGenome(input.buffer, Math.max(1, totalPages));
  for (const swatch of paletteExtract.palette) {
    paletteSignals.push({
      hex: swatch.hex,
      provenance: fileProvenance(contentSha256, `render PDF · ${swatch.role}`),
      weight: Math.min(0.92, 0.55 + swatch.confidence * 0.35),
    });
  }

  const typography = await extractTypographyFromPdf(input.buffer, { maxPages: Math.max(1, totalPages) });
  typographyFamilies.push(...typographyFamiliesFromExtraction(typography));

  if (!input.visionEnabled) {
    return {
      logoCandidates,
      paletteSignals,
      typographyFamilies,
      contentSha256,
      pdfStorageKey,
      totalPages,
      visionDetail: "Extracción determinista (sin visión IA)",
    };
  }

  const audit = await runBrandManualVisionAudit({
    buffer: input.buffer,
    fileName: input.fileName,
    contentSha256,
    userEmail: input.userEmail,
    route: input.route,
    totalPages,
  });

  paletteSignals.push(...paletteSignalsFromPageVisionAudit(audit, input.fileName, contentSha256));
  typographyFamilies.push(...typographyFamiliesFromPageVisionAudit(audit));

  if (pageVisionAuditHasLogos(audit)) {
    const entries = await buildProvisionalLogoCandidatesFromPageVision(
      audit,
      input.buffer,
      contentSha256.slice(0, 16),
    );
    for (let index = 0; index < entries.length; index += 1) {
      logoCandidates.push(
        await mapVisionLogoEntryToCandidate({
          entry: entries[index]!,
          fileName: input.fileName,
          contentSha256,
          totalPages,
          userEmail: input.userEmail,
          index,
        }),
      );
    }
  }

  const analyzed = audit.pages.length;
  const withLogo = audit.pages.filter(
    (page) => page.ok && (page.result?.logoInstances.length ?? 0) > 0,
  ).length;

  return {
    logoCandidates,
    paletteSignals,
    typographyFamilies,
    contentSha256,
    pdfStorageKey,
    totalPages,
    visionDetail: `${logoCandidates.length} logos · ${paletteSignals.length} colores · ${typographyFamilies.length} fuentes · ${withLogo}/${analyzed} pág.`,
  };
}
