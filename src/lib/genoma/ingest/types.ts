import type { Genome } from "../model/trait";
import type { MaterialPromptPayload } from "./material-prompt";

/** Secciones del libro en orden de aparición durante la ingesta. */
export type GenomaIngestSectionId = "palette" | "logo" | "typography" | "visual" | "voice";

export const GENOMA_INGEST_SECTION_ORDER: readonly GenomaIngestSectionId[] = [
  "palette",
  "logo",
  "typography",
  "visual",
  "voice",
] as const;

export type GenomaSectionPreview =
  | { kind: "palette"; swatches: string[] }
  | { kind: "logo"; imageUrl: string }
  | { kind: "typography"; family: string; weights?: string[] }
  | { kind: "visual"; count: number }
  | { kind: "voice"; traits: string[] };

/** Eventos NDJSON del stream de ingesta (servidor → cliente). */
export type GenomaIngestStreamEvent =
  | { type: "ingest_receive"; fileCount: number }
  | { type: "ingest_reading"; sourceCount: number }
  | { type: "url_visiting"; domain: string }
  | { type: "section_running"; section: GenomaIngestSectionId; label: string }
  | { type: "section_resolved"; section: GenomaIngestSectionId; preview?: GenomaSectionPreview; micro: string }
  | { type: "section_error"; section: GenomaIngestSectionId; fileName: string; message: string }
  | { type: "source_error"; fileName: string; message: string }
  | { type: "genome_update"; genome: Genome }
  | { type: "material_prompt"; prompt: MaterialPromptPayload }
  | { type: "micro"; text: string }
  | {
      type: "page_vision_pass";
      fileName: string;
      status: "running" | "completed" | "partial" | "failed" | "skipped";
      pagesAnalyzed?: number;
      pagesSelected?: number;
      skipReason?: string;
      summary?: string;
    }
  | { type: "logo_native_upgrade_running"; label: string }
  | {
      type: "logo_native_upgrade_resolved";
      micro: string;
      logoPath: import("../model/trait-values").LogoAssetOrigin | "unknown";
      logoNativeUpgradeMs: number;
    }
  | { type: "logo_intake_running"; phase: "reading" | "detecting" | "quality"; label?: string }
  | {
      type: "logo_intake_done";
      result: import("../logo-intake/types").LogoIntakeAnalyzeResult;
    }
  | { type: "logo_intake_error"; message: string }
  | { type: "pages_preparing"; done: number; total: number }
  | { type: "vision_started"; pages: number; thumbs: string[] }
  | { type: "vision_retrying"; attempt: number; max: number }
  | { type: "vision_finished"; ms: number }
  | { type: "candidates_found"; count: number; prohibitedExcluded: number }
  | {
      type: "logo_best_ready";
      thumb: string;
      proposal: import("../logo-intake/types").LogoProposal;
    }
  | { type: "palette_sampling"; done: number; total: number }
  | { type: "color_crowned"; hex: string; name?: string; role: string }
  | { type: "palette_done"; count: number }
  | { type: "ingest_done"; totalMs: number }
  | { type: "done" };

export function encodeIngestEvent(event: GenomaIngestStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}
