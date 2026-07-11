import type { LogoLabRefinePayload } from "@/lib/brandkit/logo-lab/pick-best-logo";

export type { LogoLabRefinePayload } from "@/lib/brandkit/logo-lab/pick-best-logo";

/** Resultado del rescatado documental — serializable, seguro en cliente. */
export type LogoLabDocumentHarvest = {
  refines: Record<string, LogoLabRefinePayload>;
  best: {
    pageNumber: number;
    index: number;
    score: number;
  } | null;
};

export function logoLabRefineKey(pageNumber: number, index: number): string {
  return `${pageNumber}:${index}`;
}
