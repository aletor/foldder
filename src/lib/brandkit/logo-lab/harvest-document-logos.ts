/**
 * Rescate + ranking de logos a nivel documento (logo-lab).
 * Se ejecuta una vez al analizar o al cargar un fixture — no en cada interacción UI.
 */

import type { PageVisionPassRunAudit } from "@/lib/brandkit/ingest/page-vision-pass-runner";
import type { PageVisionLogoInstance } from "@/lib/brandkit/ingest/page-vision-pass-schema";
import { renderVisionBatchFramePng } from "@/lib/brandkit/logo-lab/render-page";
import { refineLogoLabBbox } from "@/lib/brandkit/logo-lab/refine-bbox";
import {
  pickBestLogoLabDocumentCandidate,
  scoreLogoLabDocumentCandidate,
  type LogoLabDocumentCandidate,
} from "@/lib/brandkit/logo-lab/pick-best-logo";
import { resolveAuditBbox } from "@/lib/brandkit/ingest/page-vision-pass-bbox";
import {
  logoLabRefineKey,
  type LogoLabDocumentHarvest,
  type LogoLabRefinePayload,
} from "@/lib/brandkit/logo-lab/harvest-types";

export type { LogoLabDocumentHarvest, LogoLabRefinePayload } from "@/lib/brandkit/logo-lab/harvest-types";
export { logoLabRefineKey } from "@/lib/brandkit/logo-lab/harvest-types";

function listAuditLogoInstances(
  audit: PageVisionPassRunAudit,
): { pageNumber: number; index: number; instance: PageVisionLogoInstance }[] {
  return audit.pages.flatMap((p) =>
    (p.result?.logoInstances ?? []).map((instance, index) => ({
      pageNumber: p.pageNumber,
      index,
      instance,
    })),
  );
}

async function refineInstance(
  pdfBuffer: Buffer,
  pageNumber: number,
  instance: PageVisionLogoInstance,
): Promise<LogoLabRefinePayload | null> {
  try {
    const frame = await renderVisionBatchFramePng(pdfBuffer, pageNumber);
    const seedBbox = resolveAuditBbox(instance.bbox);
    const refined = await refineLogoLabBbox({
      pdfBuffer,
      pageNumber,
      seedBbox,
      framePng: frame.pngBuffer,
      frameWidth: frame.width,
      frameHeight: frame.height,
    });
    return {
      seedBbox: refined.seedBbox,
      refinedBbox: refined.refinedBbox,
      method: refined.method,
      logoCropBase64: refined.logoCropPng.toString("base64"),
    };
  } catch {
    return null;
  }
}

export async function harvestLogoLabDocument(input: {
  pdfBuffer: Buffer;
  audit: PageVisionPassRunAudit;
}): Promise<LogoLabDocumentHarvest> {
  const instances = listAuditLogoInstances(input.audit);
  const refines: Record<string, LogoLabRefinePayload> = {};

  await Promise.all(
    instances.map(async ({ pageNumber, index, instance }) => {
      const refine = await refineInstance(input.pdfBuffer, pageNumber, instance);
      if (refine) refines[logoLabRefineKey(pageNumber, index)] = refine;
    }),
  );

  const candidates: LogoLabDocumentCandidate[] = instances.map(({ pageNumber, index, instance }) => ({
    pageNumber,
    index,
    instance,
    refine: refines[logoLabRefineKey(pageNumber, index)] ?? null,
  }));

  const bestCandidate = pickBestLogoLabDocumentCandidate(candidates);
  const best = bestCandidate
    ? {
        pageNumber: bestCandidate.pageNumber,
        index: bestCandidate.index,
        score: scoreLogoLabDocumentCandidate(bestCandidate),
      }
    : null;

  return { refines, best };
}
