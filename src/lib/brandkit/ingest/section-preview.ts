/**
 * Previews de ingesta derivados del brandKit consolidado — una sola fuente de verdad
 * para checklist, panel grande y PDF.
 */

import type { Genome } from "../model/trait";
import type { BrandKitIngestSectionId, BrandKitSectionPreview } from "./types";
import { buildConsolidatedFromGenome } from "./consolidated-registry";

export function sectionPreviewFromGenome(
  genome: Genome,
  section: BrandKitIngestSectionId,
): BrandKitSectionPreview | undefined {
  return buildConsolidatedFromGenome(genome)[section].preview;
}
