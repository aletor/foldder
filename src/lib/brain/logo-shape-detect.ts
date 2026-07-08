import sharp from "sharp";
import type { BrainDiscoveredBrandAsset } from "@/app/spaces/project-assets-metadata";
import { getFromS3 } from "@/lib/s3-utils";

export type LogoShapeAnalysis = {
  isLogoCandidate: boolean;
  isReferenceDiagram: boolean;
  score: number;
  inkRatio: number;
  bgVariance: number;
  dominantBlobRatio: number;
  componentCount: number;
  compactness: number;
  filenameBonus: number;
};

const LOGO_FILENAME_RE = /\blogo|logotipo|brand\s*mark|marca\b/i;
export const LOGO_SHAPE_MIN_INK = 0.006;
export const LOGO_SHAPE_MAX_INK = 0.24;
export const LOGO_SHAPE_MAX_BG_VARIANCE = 32;
export const LOGO_SHAPE_MIN_DOMINANT_BLOB = 0.52;

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

function filenameScoreBonus(filename?: string): number {
  if (!filename?.trim()) return 0;
  return LOGO_FILENAME_RE.test(filename) ? 0.1 : 0;
}

function countConnectedComponents(mask: Uint8Array, width: number, height: number): { count: number; largest: number } {
  const visited = new Uint8Array(mask.length);
  let count = 0;
  let largest = 0;
  const stack: number[] = [];

  for (let idx = 0; idx < mask.length; idx += 1) {
    if (!mask[idx] || visited[idx]) continue;
    count += 1;
    let size = 0;
    stack.push(idx);
    visited[idx] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      size += 1;
      const x = cur % width;
      const y = Math.floor(cur / width);
      const neighbors = [
        x > 0 ? cur - 1 : -1,
        x < width - 1 ? cur + 1 : -1,
        y > 0 ? cur - width : -1,
        y < height - 1 ? cur + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || visited[next] || !mask[next]) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    if (size > largest) largest = size;
  }
  return { count, largest };
}

export async function analyzeLogoShapeFromImageBuffer(
  buffer: Buffer,
  options?: { filename?: string },
): Promise<LogoShapeAnalysis> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = width * height;
  if (pixels <= 0) {
    return {
      isLogoCandidate: false,
      isReferenceDiagram: false,
      score: 0,
      inkRatio: 0,
      bgVariance: 999,
      dominantBlobRatio: 0,
      componentCount: 0,
      compactness: 0,
      filenameBonus: 0,
    };
  }

  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const offset of corners) {
    bgR += data[offset] ?? 255;
    bgG += data[offset + 1] ?? 255;
    bgB += data[offset + 2] ?? 255;
  }
  bgR = Math.round(bgR / corners.length);
  bgG = Math.round(bgG / corners.length);
  bgB = Math.round(bgB / corners.length);

  const borderDiffs: number[] = [];
  const inkMask = new Uint8Array(pixels);
  let ink = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const diff = colorDistance(r, g, b, bgR, bgG, bgB);
      const isBorder = y < Math.ceil(height * 0.06) || y >= Math.floor(height * 0.94) || x < Math.ceil(width * 0.06) || x >= Math.floor(width * 0.94);
      if (isBorder) borderDiffs.push(diff);
      if (diff > 36) {
        inkMask[y * width + x] = 1;
        ink += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const inkRatio = ink / pixels;
  const bgVariance =
    borderDiffs.length > 0
      ? borderDiffs.reduce((sum, d) => sum + Math.abs(d - (borderDiffs.reduce((a, b) => a + b, 0) / borderDiffs.length)), 0) /
        borderDiffs.length
      : 999;

  const bboxArea = ink > 0 ? (maxX - minX + 1) * (maxY - minY + 1) : 0;
  const compactness = bboxArea / pixels;

  const { count: componentCount, largest } = countConnectedComponents(inkMask, width, height);
  const dominantBlobRatio = ink > 0 ? largest / ink : 0;

  const filenameBonus = filenameScoreBonus(options?.filename);

  const isReferenceDiagram =
    inkRatio > 0.28 ||
    (componentCount >= 25 && inkRatio > 0.08) ||
    (componentCount >= 7 && dominantBlobRatio < 0.45) ||
    (componentCount >= 5 && inkRatio > 0.12 && dominantBlobRatio < 0.38);

  const inkOk = inkRatio >= LOGO_SHAPE_MIN_INK && inkRatio <= LOGO_SHAPE_MAX_INK;
  const bgOk = bgVariance <= LOGO_SHAPE_MAX_BG_VARIANCE;
  const blobOk = dominantBlobRatio >= LOGO_SHAPE_MIN_DOMINANT_BLOB && componentCount <= 8;
  const wireframeOk =
    dominantBlobRatio >= 0.48 &&
    inkRatio <= 0.12 &&
    compactness <= 0.58 &&
    bgVariance <= 12 &&
    componentCount <= 120;
  const compactOk = compactness >= 0.02 && compactness <= 0.92;

  const isLogoCandidate = !isReferenceDiagram && inkOk && bgOk && compactOk && (blobOk || wireframeOk);

  const inkSweet = inkRatio > 0 ? Math.max(0, 1 - Math.abs(inkRatio - 0.05) / 0.18) : 0;
  const score = Math.min(
    0.98,
    (isLogoCandidate ? 0.35 : 0) +
      dominantBlobRatio * 0.28 +
      inkSweet * 0.22 +
      Math.max(0, 1 - bgVariance / 60) * 0.12 +
      filenameBonus,
  );

  return {
    isLogoCandidate,
    isReferenceDiagram,
    score,
    inkRatio,
    bgVariance,
    dominantBlobRatio,
    componentCount,
    compactness,
    filenameBonus,
  };
}

export function buildDiscoveredLogoAssetFromShape(input: {
  analysis: LogoShapeAnalysis;
  imageRef: string;
  documentId: string;
  documentName: string;
}): BrainDiscoveredBrandAsset {
  return {
    id: `shape-logo:${input.documentId}`,
    kind: "logo",
    label: `Logo detectado · ${input.documentName}`,
    value: input.imageRef,
    imageUrl: input.imageRef,
    sourceDocumentId: input.documentId,
    sourceName: input.documentName,
    sourceDocumentIds: [input.documentId],
    documentCount: 1,
    pageCount: 0,
    confidence: input.analysis.score,
    clusterScore: input.analysis.score,
    discoveredAt: new Date().toISOString(),
  };
}

function isBrandScopeImageDoc(doc: {
  mime?: string;
  format?: string;
  type?: string;
  brainSourceScope?: string;
  scope?: string;
  s3Path?: string;
}): boolean {
  const mime = (doc.mime || "").toLowerCase();
  const isImage = mime.startsWith("image/") || doc.format === "image" || doc.type === "image";
  if (!isImage || !doc.s3Path?.trim()) return false;
  const scope = doc.brainSourceScope ?? (doc.scope === "core" ? "brand" : "project");
  return scope === "brand";
}

export async function detectShapeLogoCandidatesFromBrandImages(input: {
  docs: Array<{ id: string; name: string; mime?: string; format?: string; type?: string; s3Path?: string; brainSourceScope?: string; scope?: string }>;
  userEmail: string;
  canAccess?: (s3Path: string) => Promise<boolean>;
  loadBuffer?: (s3Path: string) => Promise<Buffer>;
}): Promise<BrainDiscoveredBrandAsset[]> {
  const canAccess = input.canAccess ?? (async () => true);
  const loadBuffer = input.loadBuffer ?? (async (s3Path: string) => getFromS3(s3Path));
  const out: BrainDiscoveredBrandAsset[] = [];

  for (const doc of input.docs) {
    if (!isBrandScopeImageDoc(doc)) continue;
    const key = doc.s3Path!.trim();
    try {
      if (!(await canAccess(key))) continue;
      const buffer = await loadBuffer(key);
      const analysis = await analyzeLogoShapeFromImageBuffer(buffer, { filename: doc.name });
      if (!analysis.isLogoCandidate || analysis.isReferenceDiagram) continue;
      out.push(
        buildDiscoveredLogoAssetFromShape({
          analysis,
          imageRef: key,
          documentId: doc.id,
          documentName: doc.name,
        }),
      );
    } catch (error) {
      console.warn(`[logo-shape-detect] skipped ${doc.id}:`, error);
    }
  }

  return out.sort((a, b) => (b.clusterScore ?? 0) - (a.clusterScore ?? 0));
}
