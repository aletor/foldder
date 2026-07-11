/**
 * Nivel 1 — pre-pase determinista antes del LLM batch.
 * XObjects recurrentes · clústeres de plantilla · SVG embebidos · dominios en texto.
 * Best-effort: un fallo (p. ej. JPX) nunca tumba Fase A.
 */

import { extractEmbeddedSvgsFromPdfBuffer } from "../extractors/pdf-vector-logo";
import { extractEmbeddedRasterImagesFromPdf } from "@/lib/brain/pdf-visual-extract";
import { clusterPdfPagesByLayout } from "./page-vision-pass-page-clusters";
import {
  guaranteedVisionPageNumbers,
  type PageTemplateCluster,
} from "./page-vision-pass-selection";

export type PageVisionPrepassResult = {
  totalPages: number;
  templateClusters: PageTemplateCluster[];
  recurrentXObjectPages: number[];
  embeddedSvgCount: number;
  embeddedSvgLabels: string[];
  domainHints: string[];
  logoLikelyPages: number[];
  durationMs: number;
  /** true si alguna etapa falló pero se devolvió snapshot vacío parcial. */
  degraded?: boolean;
  prepassErrors?: string[];
};

const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*\.(com|net|es|org|invalid)\b/gi;

function emptyPrepassSnapshot(totalPages: number): PageVisionPrepassResult {
  const logoLikelyPages = [1];
  if (totalPages > 1) logoLikelyPages.push(totalPages);
  return {
    totalPages,
    templateClusters: [],
    recurrentXObjectPages: [],
    embeddedSvgCount: 0,
    embeddedSvgLabels: [],
    domainHints: [],
    logoLikelyPages: [...new Set(logoLikelyPages)].sort((a, b) => a - b),
    durationMs: 0,
    degraded: true,
  };
}

export async function runPageVisionPrepass(input: {
  buffer: Buffer;
  fileName: string;
  maxPages?: number;
  /** Menos raster/clusters — triaje Nivel 1 no necesita corpus completo. */
  profile?: "full" | "nivel1";
}): Promise<PageVisionPrepassResult> {
  const started = Date.now();
  const maxPages = input.maxPages ?? 200;
  const profile = input.profile ?? "full";
  const prepassErrors: string[] = [];

  let templateClusters: PageTemplateCluster[] = [];
  try {
    const clusterCap = profile === "nivel1" ? Math.min(maxPages, 40) : maxPages;
    templateClusters = await clusterPdfPagesByLayout(input.buffer, clusterCap, clusterCap);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    prepassErrors.push(`layout_clusters:${msg}`);
    console.warn("[page-vision-prepass] layout clusters failed:", error);
  }

  let recurrentXObjectPages: number[] = [];
  try {
    const raster = await extractEmbeddedRasterImagesFromPdf(input.buffer, {
      maxPages: profile === "nivel1" ? 12 : Math.min(maxPages, 30),
    });
    recurrentXObjectPages = [...new Set(raster.map((r) => r.pageNumber))].sort((a, b) => a - b);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    prepassErrors.push(`embedded_raster:${msg}`);
    console.warn("[page-vision-prepass] embedded raster scan failed:", error);
  }

  let embeddedSvgCount = 0;
  let embeddedSvgLabels: string[] = [];
  try {
    const embedded = extractEmbeddedSvgsFromPdfBuffer(input.buffer, input.fileName);
    embeddedSvgCount = embedded.length;
    embeddedSvgLabels = embedded.map((e) => e.label).slice(0, 12);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    prepassErrors.push(`embedded_svg:${msg}`);
    console.warn("[page-vision-prepass] embedded svg scan failed:", error);
  }

  const domainHints = new Set<string>();
  try {
    const { loadPdfJsDocumentFromBuffer } = await import("@/lib/brain/pdfjs-server");
    const { pdf } = await loadPdfJsDocumentFromBuffer(input.buffer);
    try {
      const limit = Math.min(pdf.numPages, maxPages, profile === "nivel1" ? 10 : 20);
      for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
        try {
          const page = await pdf.getPage(pageNumber);
          const text = (await page.getTextContent()).items
            .map((item) => ("str" in item ? String(item.str ?? "") : ""))
            .join(" ");
          for (const match of text.matchAll(DOMAIN_RE)) domainHints.add(match[0]!.toLowerCase());
        } catch (pageError) {
          console.warn(`[page-vision-prepass] domain scan p${pageNumber} skipped:`, pageError);
        }
      }
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    prepassErrors.push(`domain_hints:${msg}`);
    console.warn("[page-vision-prepass] domain hints failed:", error);
  }

  const logoLikelyPages = new Set<number>([1]);
  for (const p of recurrentXObjectPages.slice(0, 8)) logoLikelyPages.add(p);
  for (const cluster of templateClusters.slice(0, 3)) {
    if (cluster.pageNumbers[0]) logoLikelyPages.add(cluster.pageNumbers[0]!);
  }
  if (maxPages > 1) logoLikelyPages.add(maxPages);

  return {
    totalPages: maxPages,
    templateClusters,
    recurrentXObjectPages,
    embeddedSvgCount,
    embeddedSvgLabels,
    domainHints: [...domainHints].slice(0, 8),
    logoLikelyPages: [...logoLikelyPages].sort((a, b) => a - b),
    durationMs: Date.now() - started,
    degraded: prepassErrors.length > 0 ? true : undefined,
    prepassErrors: prepassErrors.length ? prepassErrors : undefined,
  };
}

export function selectNivel1GuaranteedVisionPages(input: {
  totalPages: number;
  maxPages?: number;
}): number[] {
  const cap = Math.min(input.maxPages ?? 5, 5);
  const guaranteed = guaranteedVisionPageNumbers(input.totalPages);
  if (guaranteed.length <= cap) return guaranteed;

  const head = guaranteed.filter((p) => p <= 4);
  const tail = guaranteed.filter((p) => p > 4);
  const picked = new Set<number>();
  for (const page of head) {
    if (picked.size >= cap) break;
    picked.add(page);
  }
  for (let i = tail.length - 1; i >= 0 && picked.size < cap; i -= 1) {
    picked.add(tail[i]!);
  }
  return [...picked].sort((a, b) => a - b);
}

export function selectNivel1VisionPages(input: {
  totalPages: number;
  prepass: PageVisionPrepassResult;
  maxPages?: number;
}): number[] {
  const cap = Math.min(input.maxPages ?? 5, 5);
  const scores = new Map<number, number>();

  const bump = (page: number, score: number) => {
    if (page < 1 || page > input.totalPages) return;
    scores.set(page, (scores.get(page) ?? 0) + score);
  };

  bump(1, 100);
  bump(input.totalPages, 80);
  for (const page of input.prepass.logoLikelyPages) bump(page, 40);
  for (const cluster of input.prepass.templateClusters.slice(0, 4)) {
    bump(cluster.pageNumbers[0] ?? 1, 25);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, cap)
    .map(([page]) => page)
    .sort((a, b) => a - b);
}
