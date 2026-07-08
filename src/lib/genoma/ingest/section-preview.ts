/**
 * Previews de ingesta derivados del genoma consolidado — una sola fuente de verdad
 * para checklist, panel grande y PDF.
 */

import type { Genome } from "../model/trait";
import type { GenomaIngestSectionId, GenomaSectionPreview } from "./types";
import { buildConsolidatedFromGenome } from "./consolidated-registry";

export function sectionPreviewFromGenome(
  genome: Genome,
  section: GenomaIngestSectionId,
): GenomaSectionPreview | undefined {
  return buildConsolidatedFromGenome(genome)[section].preview;
}
