import { getFromS3, uploadBufferToS3Key } from "@/lib/s3-utils";
import { buildUserAssetObjectKey } from "@/lib/spaces-access-control";
import type { BBoxPage } from "./logo-intake/bbox";
import { bboxIoU } from "./brand-kit-bbox-iou";

export type BrandKitLogoUserPattern = {
  contentSha256?: string;
  pageNumber: number;
  bboxPage: BBoxPage;
  aspectRatio: number;
  centerX: number;
  centerY: number;
  relativeArea: number;
  confirmedAt: string;
};

const MAX_PATTERNS = 48;

function patternsObjectKey(userEmail: string): string {
  return buildUserAssetObjectKey({
    userEmail,
    folder: "brandKit/logo-patterns",
    filename: "confirmed.json",
    unique: false,
  });
}

export async function loadBrandKitLogoUserPatterns(userEmail: string): Promise<BrandKitLogoUserPattern[]> {
  if (!userEmail.trim()) return [];
  try {
    const raw = await getFromS3(patternsObjectKey(userEmail));
    const parsed = JSON.parse(raw.toString("utf8")) as { patterns?: BrandKitLogoUserPattern[] };
    return Array.isArray(parsed.patterns) ? parsed.patterns.slice(0, MAX_PATTERNS) : [];
  } catch {
    return [];
  }
}

export async function recordBrandKitLogoUserPattern(
  userEmail: string,
  input: {
    contentSha256?: string;
    pageNumber: number;
    bboxPage: BBoxPage;
  },
): Promise<void> {
  if (!userEmail.trim()) return;
  const [x1, y1, x2, y2] = input.bboxPage;
  const width = Math.max(0.01, x2 - x1);
  const height = Math.max(0.01, y2 - y1);
  const next: BrandKitLogoUserPattern = {
    contentSha256: input.contentSha256,
    pageNumber: input.pageNumber,
    bboxPage: input.bboxPage,
    aspectRatio: width / height,
    centerX: (x1 + x2) / 2,
    centerY: (y1 + y2) / 2,
    relativeArea: width * height,
    confirmedAt: new Date().toISOString(),
  };

  const existing = await loadBrandKitLogoUserPatterns(userEmail);
  const duplicate = existing.find(
    (row) =>
      row.pageNumber === next.pageNumber &&
      bboxIoU(row.bboxPage, next.bboxPage) > 0.82 &&
      row.contentSha256 === next.contentSha256,
  );
  const patterns = duplicate
    ? existing.map((row) => (row === duplicate ? next : row))
    : [next, ...existing].slice(0, MAX_PATTERNS);

  await uploadBufferToS3Key(
    patternsObjectKey(userEmail),
    Buffer.from(JSON.stringify({ patterns }), "utf8"),
    "application/json",
  );
}

/** Bonus de score 0–0.12 si el bbox coincide con patrones confirmados por el usuario. */
export function boostScoreForUserPatterns(
  bboxPage: BBoxPage,
  pageNumber: number,
  patterns: BrandKitLogoUserPattern[],
  contentSha256?: string,
): number {
  if (!patterns.length) return 0;
  const [x1, y1, x2, y2] = bboxPage;
  const aspect = (x2 - x1) / Math.max(0.01, y2 - y1);
  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;

  let best = 0;
  for (const pattern of patterns) {
    if (contentSha256 && pattern.contentSha256 && pattern.contentSha256 !== contentSha256) {
      continue;
    }
    const iou = bboxIoU(bboxPage, pattern.bboxPage);
    const pageMatch = pattern.pageNumber === pageNumber ? 1 : 0.65;
    const aspectDelta = Math.abs(aspect - pattern.aspectRatio);
    const centerDist = Math.hypot(centerX - pattern.centerX, centerY - pattern.centerY);
    const spatial = Math.max(0, 1 - centerDist * 2.5);
    const aspectScore = Math.max(0, 1 - aspectDelta);
    const score = (iou * 0.55 + spatial * 0.25 + aspectScore * 0.2) * pageMatch;
    best = Math.max(best, score);
  }
  return Math.min(0.12, best * 0.12);
}
