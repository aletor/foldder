/**
 * Aplica resultados de Fase A al brandKit: logos consolidados + imágenes con visualDna.
 */

import sharp from "sharp";
import { renderPdfPages, type PixelBBox } from "@/lib/brain/pdf-page-render";
import { createCandidate, signal, type Candidate, type SourceRef } from "../model/evidence";
import type { ImageCategory } from "../model/trait-ids";
import type { ImageDnaValue, LogoValue, VisualDnaFields } from "../model/trait-values";
import type { VisualExtraction } from "../extractors/visual";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";
import type { PageVisionLogoInstance, VisualDna } from "./page-vision-pass-schema";
import type { BBoxXYXY } from "./page-vision-pass-bbox";
import { PAGE_VISION_PASS_DPI } from "./page-vision-pass-version";
import {
  clusterHarvestedLogos,
  harvestLogoPHash,
  mergeClustersByNativeAsset,
  type HarvestedLogo,
  type LogoCluster,
} from "./page-vision-logo-cluster";
import { extractNativeLogoInBbox, type NativeLogoAsset } from "./page-vision-native-extract";
import type { PaintWalkAudit } from "./page-vision-pdf-vector-walk";
import type { LogoVariantAsset } from "../model/trait-values";
import { refineAndCropPdfLogoInstance } from "./ingest-logo-pdf-refine";
import { buildHeuristicLogoCandidatesFromPdfCover } from "./ingest-logo-heuristic";

const LOGO_CROP_DPI = Math.max(PAGE_VISION_PASS_DPI, 216);

export type PageVisionLogoCandidateEntry = {
  candidate: Candidate<LogoValue>;
  imageUrl: string;
  signature: string;
  pageNumber: number;
  slot: "primary" | "secondary";
  pathAudit?: PaintWalkAudit;
  wordmarkIntegrityOk?: boolean;
};

function bboxXYXYToPixel(bbox: BBoxXYXY, pageWidth: number, pageHeight: number): PixelBBox {
  return {
    x: Math.round(bbox[0] * pageWidth),
    y: Math.round(bbox[1] * pageHeight),
    width: Math.max(1, Math.round((bbox[2] - bbox[0]) * pageWidth)),
    height: Math.max(1, Math.round((bbox[3] - bbox[1]) * pageHeight)),
  };
}

function bboxXYXYToSourceBbox(bbox: BBoxXYXY): LogoValue["sourceBbox"] {
  return {
    x: bbox[0],
    y: bbox[1],
    width: bbox[2] - bbox[0],
    height: bbox[3] - bbox[1],
  };
}

function variantLabel(variant: PageVisionLogoInstance["variant"]): string {
  switch (variant) {
    case "horizontal":
      return "logo horizontal";
    case "isotipo":
      return "isotipo";
    case "vertical":
      return "logo vertical";
    case "monocromo":
      return "logo monocromo";
    default:
      return "logo de marca";
  }
}

function logoVariantPolarity(instance: PageVisionLogoInstance): LogoValue["variant"] {
  return instance.onBackground === "oscuro" ? "negative" : "positive";
}

function visualDnaField(value: string | undefined): string {
  if (!value || value === "unknown") return "";
  return value.trim();
}

export function visualDnaToFields(v: VisualDna): VisualDnaFields {
  return {
    sujeto: visualDnaField(v.sujeto),
    ropa: visualDnaField(v.ropa),
    lugar: visualDnaField(v.lugar),
    animo: visualDnaField(v.animo),
    estiloArtistico: visualDnaField(v.estiloArtistico),
    encuadre: visualDnaField(v.encuadre),
    luzTratamiento: visualDnaField(v.luzTratamiento),
    paletaAprox: v.paletaAprox.filter((c) => c !== "unknown").join(", "),
    texturas: visualDnaField(v.texturas),
    vozVisual: visualDnaField(v.vozVisual),
  };
}

function imageDnaFromVisualObservation(
  visualDna: VisualDna,
  referenceImageUrl: string,
): ImageDnaValue {
  const fields = visualDnaToFields(visualDna);
  return {
    visualDna: fields,
    axes: {
      sujeto: fields.sujeto || undefined,
      entorno: fields.lugar || undefined,
      encuadre: fields.encuadre || undefined,
      paleta: fields.paletaAprox || undefined,
      tratamiento: fields.luzTratamiento || undefined,
      accion: fields.animo || undefined,
    },
    referenceImageUrl,
  };
}

function classifyImageCategory(visualDna: VisualDna, esFotoDeProducto: boolean): ImageCategory {
  if (esFotoDeProducto) return "objects";
  const sujeto = visualDnaField(visualDna.sujeto).toLowerCase();
  if (/persona|retrato|modelo|equipo|gente/.test(sujeto)) return "people";
  if (/paisaje|ciudad|interior|exterior|entorno|escenario/.test(sujeto)) return "environments";
  if (/textura|patrón|grafismo|abstract/.test(visualDnaField(visualDna.texturas).toLowerCase())) return "textures";
  return "general";
}

async function cropObservation(
  buffer: Buffer,
  pageNumber: number,
  bbox: BBoxXYXY,
  dpi: number,
  pageDimCache: Map<number, { width: number; height: number; pngBuffer: Buffer }>,
): Promise<Buffer> {
  let page = pageDimCache.get(pageNumber);
  if (!page) {
    const rendered = await renderPdfPages(buffer, { maxPages: pageNumber, dpi });
    const hit = rendered.find((p) => p.pageNumber === pageNumber);
    if (!hit) throw new Error("page_not_found");
    page = { width: hit.width, height: hit.height, pngBuffer: hit.pngBuffer };
    pageDimCache.set(pageNumber, page);
  }
  const pixel = bboxXYXYToPixel(bbox, page.width, page.height);
  const cropped = await sharp(page.pngBuffer)
    .extract({
      left: pixel.x,
      top: pixel.y,
      width: pixel.width,
      height: pixel.height,
    })
    .png()
    .toBuffer();
  const meta = await sharp(cropped).metadata();
  if ((meta.width ?? 0) < 24 || (meta.height ?? 0) < 12) {
    throw new Error("crop_too_small");
  }
  return cropped;
}

async function harvestLogosFromAudit(
  audit: PageVisionPassRunAudit,
  buffer: Buffer,
  pageDimCache: Map<number, { width: number; height: number; pngBuffer: Buffer }>,
): Promise<HarvestedLogo[]> {
  const out: HarvestedLogo[] = [];
  for (const page of audit.pages) {
    if (!page.ok || !page.result?.logoInstances.length) continue;
    for (const instance of page.result.logoInstances) {
      try {
        let cropBuffer: Buffer | null = null;
        let cropBbox: BBoxXYXY = instance.bbox;

        const refined = await refineAndCropPdfLogoInstance({
          pdfBuffer: buffer,
          pageNumber: page.pageNumber,
          instance,
        });
        if (refined) {
          cropBuffer = refined.png;
          cropBbox = refined.refinedBbox;
        }

        if (!cropBuffer) {
          cropBuffer = await cropObservation(
            buffer,
            page.pageNumber,
            instance.bbox,
            LOGO_CROP_DPI,
            pageDimCache,
          );
          cropBbox = instance.bbox;
        } else {
          const meta = await sharp(cropBuffer).metadata();
          if ((meta.width ?? 0) < 24 || (meta.height ?? 0) < 12) {
            cropBuffer = await cropObservation(
              buffer,
              page.pageNumber,
              cropBbox,
              LOGO_CROP_DPI,
              pageDimCache,
            );
          }
        }

        const logoPHash = await harvestLogoPHash(cropBuffer);
        out.push({
          pageNumber: page.pageNumber,
          instance: { ...instance, bbox: cropBbox },
          buffer: cropBuffer,
          logoPHash,
        });
      } catch {
        /* instancia descartada — crop inválido */
      }
    }
  }
  return out;
}

async function attachNativeAssetsToClusters(
  buffer: Buffer,
  clusters: LogoCluster[],
): Promise<Map<string, { positive?: NativeLogoAsset; negative?: NativeLogoAsset }>> {
  const nativeByKey = new Map<string, { positive?: NativeLogoAsset; negative?: NativeLogoAsset }>();
  for (const cluster of clusters) {
    const textInLogo = cluster.members.find(
      (m) => m.instance.textInLogo?.trim() && m.instance.textInLogo.toLowerCase() !== "unknown",
    )?.instance.textInLogo;
    const positiveRep = pickRepresentativeForPolarity(cluster, "positive");
    const negativeRep = pickRepresentativeForPolarity(cluster, "negative");
    const positive = await extractNativeLogoInBbox({
      buffer,
      pageNumber: positiveRep.pageNumber,
      bbox: positiveRep.instance.bbox,
      textInLogo,
      collectPathAudit: true,
    });
    const samePage =
      positiveRep.pageNumber === negativeRep.pageNumber &&
      positiveRep.instance.bbox.every((v, i) => v === negativeRep.instance.bbox[i]);
    const negative = samePage
      ? positive
      : await extractNativeLogoInBbox({
          buffer,
          pageNumber: negativeRep.pageNumber,
          bbox: negativeRep.instance.bbox,
          textInLogo,
        });
    nativeByKey.set(cluster.phash, { positive: positive ?? undefined, negative: negative ?? undefined });
  }
  return nativeByKey;
}

function nativeToDataUrl(native: NativeLogoAsset | undefined): string | undefined {
  if (!native?.svg) return native?.rasterBuffer ? `data:image/png;base64,${native.rasterBuffer.toString("base64")}` : undefined;
  return `data:image/svg+xml;base64,${Buffer.from(native.svg, "utf8").toString("base64")}`;
}

function logoValueFromNativeVariants(input: {
  rep: HarvestedLogo;
  positive?: NativeLogoAsset;
  negative?: NativeLogoAsset;
  imageUrl: string;
}): LogoValue {
  const variants: LogoVariantAsset[] = [];
  const positiveUrl = nativeToDataUrl(input.positive);
  const negativeUrl = nativeToDataUrl(input.negative);
  if (positiveUrl && input.positive) {
    variants.push({
      variant: "positive",
      imageUrl: positiveUrl,
      assetOrigin: input.positive.origin,
      sourcePageNumber: input.positive.pageNumber,
      sourceBbox: bboxXYXYToSourceBbox(input.positive.bbox),
    });
  }
  if (negativeUrl && input.negative && negativeUrl !== positiveUrl) {
    variants.push({
      variant: "negative",
      imageUrl: negativeUrl,
      assetOrigin: input.negative.origin,
      sourcePageNumber: input.negative.pageNumber,
      sourceBbox: bboxXYXYToSourceBbox(input.negative.bbox),
    });
  }
  const primaryNative = input.positive ?? input.negative;
  return {
    imageUrl: input.imageUrl,
    variant: logoVariantPolarity(input.rep.instance),
    variants: variants.length ? variants : undefined,
    label: variantLabel(input.rep.instance.variant),
    assetOrigin: primaryNative?.origin ?? "render_crop",
    sourcePageNumber: primaryNative?.pageNumber ?? input.rep.pageNumber,
    sourceBbox: bboxXYXYToSourceBbox(input.rep.instance.bbox),
  };
}

function clusterScore(cluster: LogoCluster): number {
  const persistence = cluster.pageNumbers.size;
  const completeness =
    cluster.members.filter((m) => m.instance.isComplete).length / Math.max(1, cluster.members.length);
  const avgConfidence =
    cluster.members.reduce((s, m) => s + m.instance.confidence, 0) / Math.max(1, cluster.members.length);
  return persistence * (0.5 + completeness * 0.5) * avgConfidence;
}

function pickRepresentative(cluster: LogoCluster): HarvestedLogo {
  return [...cluster.members].sort((a, b) => {
    const completeDiff = Number(b.instance.isComplete) - Number(a.instance.isComplete);
    if (completeDiff !== 0) return completeDiff;
    return b.instance.confidence - a.instance.confidence;
  })[0]!;
}

function pickRepresentativeForPolarity(
  cluster: LogoCluster,
  polarity: LogoValue["variant"],
): HarvestedLogo {
  const matching = cluster.members.filter((m) => logoVariantPolarity(m.instance) === polarity);
  return pickRepresentative({ ...cluster, members: matching.length ? matching : cluster.members });
}

export function pageVisionAuditHasLogos(audit: PageVisionPassRunAudit | null | undefined): boolean {
  if (!audit) return false;
  return audit.pages.some((p) => p.ok && (p.result?.logoInstances.length ?? 0) > 0);
}

function buildLogoCandidateEntries(input: {
  harvested: HarvestedLogo[];
  clusters: LogoCluster[];
  nativeByCluster: Map<string, { positive?: NativeLogoAsset; negative?: NativeLogoAsset }> | null;
  sourceId: string;
  provisional: boolean;
}): PageVisionLogoCandidateEntry[] {
  const ranked = input.clusters
    .map((cluster) => ({ cluster, score: clusterScore(cluster) }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 6).map(({ cluster }, index) => {
    const rep = pickRepresentative(cluster);
    const nativePair = input.nativeByCluster?.get(cluster.phash);
    const positiveNative = nativePair?.positive;
    const negativeNative = nativePair?.negative;
    const imageUrl =
      nativeToDataUrl(positiveNative) ??
      nativeToDataUrl(negativeNative) ??
      `data:image/png;base64,${rep.buffer.toString("base64")}`;
    const signature =
      positiveNative?.signature ?? negativeNative?.signature ?? positiveNative?.logoPHash ?? rep.logoPHash;
    const slot: "primary" | "secondary" = index === 0 ? "primary" : "secondary";
    const persistence = cluster.pageNumbers.size;
    const originLabel = input.provisional
      ? "render_crop"
      : (positiveNative?.origin ?? negativeNative?.origin ?? "render_crop");
    const integrity = positiveNative?.wordmarkIntegrity;
    const integrityOk = integrity?.ok ?? false;
    const integritySignals = integrity
      ? [
          signal("wordmark-integrity", {
            detail: integrity.detail,
            sourceRef: input.sourceId,
            scale: integrity.ok ? 1 : 0,
          }),
        ]
      : [];
    const logoValue = input.provisional
      ? {
          imageUrl,
          variant: logoVariantPolarity(rep.instance),
          label: variantLabel(rep.instance.variant),
          assetOrigin: "render_crop" as const,
          sourcePageNumber: rep.pageNumber,
          sourceBbox: bboxXYXYToSourceBbox(rep.instance.bbox),
        }
      : logoValueFromNativeVariants({
          rep,
          positive: positiveNative,
          negative: negativeNative,
          imageUrl,
        });

    const candidate = createCandidate<LogoValue>({
      value: logoValue,
      signals: [
        signal("llm-vision", {
          detail: input.provisional
            ? `Fase B · crop provisional · ${persistence} pág.`
            : `Fase B · ${originLabel} · ${persistence} pág. · ${rep.instance.isComplete ? "completo" : "parcial"}`,
          sourceRef: input.sourceId,
          scale: rep.instance.confidence,
        }),
        signal("recurrence", {
          detail: `persistencia ×${persistence}`,
          sourceRef: input.sourceId,
          scale: Math.min(1, persistence / 4),
        }),
        ...integritySignals,
      ],
      signature,
      sourceRefs: [input.sourceId],
    });

    return {
      imageUrl,
      signature,
      pageNumber: rep.pageNumber,
      slot,
      pathAudit: positiveNative?.pathAudit,
      wordmarkIntegrityOk: integrityOk,
      candidate: input.provisional
        ? {
            ...candidate,
            derived: {
              nativeUpgrade: {
                status: "pending",
                fromOrigin: "render_crop",
              },
            },
          }
        : candidate,
    };
  });
}

/** Crop del render — sin extracción nativa (camino interactivo <20s). */
export async function buildProvisionalLogoCandidatesFromPageVision(
  audit: PageVisionPassRunAudit,
  buffer: Buffer,
  sourceId: string,
): Promise<PageVisionLogoCandidateEntry[]> {
  const pageDimCache = new Map<number, { width: number; height: number; pngBuffer: Buffer }>();
  const harvested = await harvestLogosFromAudit(audit, buffer, pageDimCache);
  if (!harvested.length) return [];
  const clusters = clusterHarvestedLogos(harvested);
  return buildLogoCandidateEntries({
    harvested,
    clusters,
    nativeByCluster: null,
    sourceId,
    provisional: true,
  });
}

export async function buildLogoCandidatesFromPageVision(
  audit: PageVisionPassRunAudit,
  buffer: Buffer,
  sourceId: string,
): Promise<PageVisionLogoCandidateEntry[]> {
  const pageDimCache = new Map<number, { width: number; height: number; pngBuffer: Buffer }>();
  const harvested = await harvestLogosFromAudit(audit, buffer, pageDimCache);
  if (!harvested.length) return [];

  const provisionalClusters = clusterHarvestedLogos(harvested);
  const nativeByCluster = await attachNativeAssetsToClusters(buffer, provisionalClusters);
  const nativePhashMap = new Map(
    [...nativeByCluster.entries()].map(([k, v]) => [k, { logoPHash: v.positive?.logoPHash ?? v.negative?.logoPHash ?? "" }]),
  );
  const clusters = mergeClustersByNativeAsset(provisionalClusters, nativePhashMap);
  const mergedNativeByCluster = new Map<string, { positive?: NativeLogoAsset; negative?: NativeLogoAsset }>();
  for (const cluster of clusters) {
    for (const prov of provisionalClusters) {
      if (prov.members.some((m) => cluster.members.includes(m))) {
        const native = nativeByCluster.get(prov.phash);
        if (native) {
          mergedNativeByCluster.set(cluster.phash, native);
          break;
        }
      }
    }
  }

  return buildLogoCandidateEntries({
    harvested,
    clusters,
    nativeByCluster: mergedNativeByCluster,
    sourceId,
    provisional: false,
  }).map((entry) => ({
    ...entry,
    candidate: {
      ...entry.candidate,
      derived: {
        ...entry.candidate.derived,
        nativeUpgrade: {
          status: "complete" as const,
          fromOrigin: "render_crop" as const,
          toOrigin: entry.candidate.value.assetOrigin ?? "render_crop",
        },
      },
    },
  }));
}

export async function buildVisualExtractionFromPageVision(
  audit: PageVisionPassRunAudit,
  buffer: Buffer,
  source: SourceRef,
): Promise<VisualExtraction> {
  const out: VisualExtraction = {};
  const sourceId = source.id;
  const pageDimCache = new Map<number, { width: number; height: number; pngBuffer: Buffer }>();

  for (const page of audit.pages) {
    if (!page.ok || !page.result?.images.length) continue;
    for (let i = 0; i < page.result.images.length; i += 1) {
      const obs = page.result.images[i]!;
      try {
        const crop = await cropObservation(buffer, page.pageNumber, obs.bbox, LOGO_CROP_DPI, pageDimCache);
        const imageUrl = `data:image/png;base64,${crop.toString("base64")}`;
        const category = classifyImageCategory(obs.visualDna, obs.esFotoDeProducto);
        const candidate = createCandidate<ImageDnaValue>({
          value: imageDnaFromVisualObservation(obs.visualDna, imageUrl),
          signals: [
            signal("llm-vision", {
              detail: `Fase A p${page.pageNumber} · ${page.result.pageKind}`,
              sourceRef: sourceId,
              scale: obs.confidence,
            }),
          ],
          signature: `phaseA_img_p${page.pageNumber}_${i}_${visualDnaField(obs.visualDna.sujeto).slice(0, 24)}`,
          sourceRefs: [sourceId],
        });
        const list = out[category] ?? [];
        if (list.length >= 2) continue;
        list.push(candidate);
        out[category] = list;
      } catch {
        /* skip bad crop */
      }
    }
  }
  return out;
}
