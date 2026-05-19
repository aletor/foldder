import {
  computeZoneGeometryHash,
  stableHash,
  type AdvancedImageBox,
  type AdvancedImagePoint,
  type AdvancedImageStroke,
  type AdvancedImageZone,
  type AdvancedImageZoneTool,
} from "./domain";

export type AdvancedImageSourceSize = {
  height: number;
  width: number;
};

export type AdvancedImageZoneFromStrokesInput = {
  locationDescription?: string;
  maskHash?: string;
  maskS3Key?: string;
  sampleSize?: number;
  sourceSize: AdvancedImageSourceSize;
  strokes: AdvancedImageStroke[];
  tool?: AdvancedImageZoneTool;
};

export type AdvancedImageZoneOverlapMetrics = {
  containsOldZone: boolean;
  intersectionAreaRatio: number;
  intersectionOverNew: number;
  intersectionOverOld: number;
  newAreaRatio: number;
  oldAreaRatio: number;
};

export type AdvancedImageMaskSvgOptions = {
  background?: string;
  foreground?: string;
  height?: number;
  includeGeometryMetadata?: boolean;
  width?: number;
};

const DEFAULT_SAMPLE_SIZE = 128;
const DEFAULT_CONTAINMENT_THRESHOLD = 0.98;

export function createZoneFromStrokes(input: AdvancedImageZoneFromStrokesInput): AdvancedImageZone {
  assertValidSourceSize(input.sourceSize);
  const strokes = normalizeAdvancedImageStrokes(input.strokes, input.sourceSize);
  if (strokes.length === 0) {
    throw new Error("Advanced image zone requires at least one vector stroke.");
  }

  const bbox = computeStrokesBoundingBox(strokes, input.sourceSize);
  const normalizedBBox = normalizeBoxToSource(bbox, input.sourceSize);
  const areaRatio = estimateStrokeAreaRatio(strokes, input.sourceSize, input.sampleSize ?? DEFAULT_SAMPLE_SIZE);
  const zone: AdvancedImageZone = {
    areaRatio,
    bbox,
    geometryHash: undefined,
    locationDescription: input.locationDescription ?? describeZoneLocation(normalizedBBox),
    maskHash: input.maskHash,
    maskS3Key: input.maskS3Key,
    normalizedBBox,
    sourceSize: { ...input.sourceSize },
    strokes,
    tool: input.tool ?? "freehand",
  };
  return {
    ...zone,
    geometryHash: computeZoneGeometryHash(zone),
  };
}

export function normalizeAdvancedImageStrokes(
  strokes: AdvancedImageStroke[],
  sourceSize: AdvancedImageSourceSize,
): AdvancedImageStroke[] {
  assertValidSourceSize(sourceSize);
  return strokes
    .map((stroke) => {
      const points = stroke.points
        .map((point) => ({
          x: clamp(round(point.x), 0, sourceSize.width),
          y: clamp(round(point.y), 0, sourceSize.height),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      return {
        closed: stroke.closed,
        id: stroke.id,
        opacity: stroke.opacity === undefined ? undefined : clamp(round(stroke.opacity), 0, 1),
        points,
        radius: clamp(round(stroke.radius), 0.5, Math.max(sourceSize.width, sourceSize.height)),
      };
    })
    .filter((stroke) => stroke.id && stroke.points.length > 0);
}

export function computeStrokesBoundingBox(
  strokes: AdvancedImageStroke[],
  sourceSize: AdvancedImageSourceSize,
): AdvancedImageBox {
  const normalized = normalizeAdvancedImageStrokes(strokes, sourceSize);
  if (normalized.length === 0) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of normalized) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - stroke.radius);
      minY = Math.min(minY, point.y - stroke.radius);
      maxX = Math.max(maxX, point.x + stroke.radius);
      maxY = Math.max(maxY, point.y + stroke.radius);
    }
  }

  const x = clamp(Math.floor(minX), 0, sourceSize.width);
  const y = clamp(Math.floor(minY), 0, sourceSize.height);
  const right = clamp(Math.ceil(maxX), 0, sourceSize.width);
  const bottom = clamp(Math.ceil(maxY), 0, sourceSize.height);
  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  };
}

export function normalizeBoxToSource(box: AdvancedImageBox, sourceSize: AdvancedImageSourceSize): AdvancedImageBox {
  assertValidSourceSize(sourceSize);
  return {
    height: round(box.height / sourceSize.height),
    width: round(box.width / sourceSize.width),
    x: round(box.x / sourceSize.width),
    y: round(box.y / sourceSize.height),
  };
}

export function estimateStrokeAreaRatio(
  strokes: AdvancedImageStroke[],
  sourceSize: AdvancedImageSourceSize,
  sampleSize = DEFAULT_SAMPLE_SIZE,
): number {
  const normalized = normalizeAdvancedImageStrokes(strokes, sourceSize);
  if (normalized.length === 0) return 0;

  const samplesX = clamp(Math.round(sampleSize), 8, 512);
  const samplesY = Math.max(8, Math.round(samplesX * (sourceSize.height / sourceSize.width)));
  let covered = 0;
  const total = samplesX * samplesY;

  for (let row = 0; row < samplesY; row += 1) {
    const y = ((row + 0.5) / samplesY) * sourceSize.height;
    for (let col = 0; col < samplesX; col += 1) {
      const x = ((col + 0.5) / samplesX) * sourceSize.width;
      if (pointInsideAnyStroke({ x, y }, normalized)) covered += 1;
    }
  }

  return round(covered / total);
}

export function computeZoneOverlapMetrics(
  newZone: AdvancedImageZone,
  oldZone: AdvancedImageZone,
  sampleSize = DEFAULT_SAMPLE_SIZE,
): AdvancedImageZoneOverlapMetrics {
  const sourceSize = assertSameSourceSize(newZone.sourceSize, oldZone.sourceSize);
  const samplesX = clamp(Math.round(sampleSize), 8, 512);
  const samplesY = Math.max(8, Math.round(samplesX * (sourceSize.height / sourceSize.width)));
  let newCovered = 0;
  let oldCovered = 0;
  let intersection = 0;
  const total = samplesX * samplesY;

  for (let row = 0; row < samplesY; row += 1) {
    const y = ((row + 0.5) / samplesY) * sourceSize.height;
    for (let col = 0; col < samplesX; col += 1) {
      const x = ((col + 0.5) / samplesX) * sourceSize.width;
      const inNew = pointInsideAnyStroke({ x, y }, newZone.strokes);
      const inOld = pointInsideAnyStroke({ x, y }, oldZone.strokes);
      if (inNew) newCovered += 1;
      if (inOld) oldCovered += 1;
      if (inNew && inOld) intersection += 1;
    }
  }

  const newAreaRatio = total > 0 ? newCovered / total : 0;
  const oldAreaRatio = total > 0 ? oldCovered / total : 0;
  const intersectionAreaRatio = total > 0 ? intersection / total : 0;
  const intersectionOverOld = oldCovered > 0 ? intersection / oldCovered : 0;
  const intersectionOverNew = newCovered > 0 ? intersection / newCovered : 0;

  return {
    containsOldZone: intersectionOverOld >= DEFAULT_CONTAINMENT_THRESHOLD,
    intersectionAreaRatio: round(intersectionAreaRatio),
    intersectionOverNew: round(intersectionOverNew),
    intersectionOverOld: round(intersectionOverOld),
    newAreaRatio: round(newAreaRatio),
    oldAreaRatio: round(oldAreaRatio),
  };
}

export function buildAdvancedImageMaskSvg(
  zone: AdvancedImageZone,
  options: AdvancedImageMaskSvgOptions = {},
): string {
  const width = options.width ?? zone.sourceSize.width;
  const height = options.height ?? zone.sourceSize.height;
  const scaleX = width / zone.sourceSize.width;
  const scaleY = height / zone.sourceSize.height;
  const background = options.background ?? "#000";
  const foreground = options.foreground ?? "#fff";
  const metadata = options.includeGeometryMetadata
    ? `<metadata>${escapeXml(JSON.stringify({ geometryHash: zone.geometryHash, maskHash: stableHash(zone) }))}</metadata>`
    : "";
  const paths = zone.strokes
    .map((stroke) => {
      const points = stroke.points.map((point) => `${round(point.x * scaleX)},${round(point.y * scaleY)}`);
      if (points.length === 1) {
        const point = stroke.points[0];
        return `<circle cx="${round(point.x * scaleX)}" cy="${round(point.y * scaleY)}" r="${round(stroke.radius * Math.max(scaleX, scaleY))}" fill="${foreground}" opacity="${stroke.opacity ?? 1}"/>`;
      }
      if (stroke.closed && points.length >= 3) {
        return `<polygon points="${points.join(" ")}" fill="${foreground}" stroke="${foreground}" stroke-width="${round(stroke.radius * 2 * Math.max(scaleX, scaleY))}" stroke-linejoin="round" opacity="${stroke.opacity ?? 1}"/>`;
      }
      return `<polyline points="${points.join(" ")}" fill="none" stroke="${foreground}" stroke-width="${round(stroke.radius * 2 * Math.max(scaleX, scaleY))}" stroke-linecap="round" stroke-linejoin="round" opacity="${stroke.opacity ?? 1}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${metadata}<rect width="100%" height="100%" fill="${background}"/>${paths}</svg>`;
}

export function buildAdvancedImageMaskSvgDataUrl(
  zone: AdvancedImageZone,
  options: AdvancedImageMaskSvgOptions = {},
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildAdvancedImageMaskSvg(zone, options))}`;
}

export function deriveMaskHashFromSvg(svg: string): string {
  return stableHash(svg);
}

export function describeZoneLocation(normalizedBBox: AdvancedImageBox): string {
  const cx = normalizedBBox.x + normalizedBBox.width / 2;
  const cy = normalizedBBox.y + normalizedBBox.height / 2;
  const horizontal = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "center";
  const vertical = cy < 1 / 3 ? "upper" : cy > 2 / 3 ? "lower" : "middle";
  const size =
    normalizedBBox.width * normalizedBBox.height < 0.015
      ? "small"
      : normalizedBBox.width * normalizedBBox.height < 0.08
        ? "medium"
        : "large";
  return `${size} ${vertical}-${horizontal} region`;
}

function pointInsideAnyStroke(point: AdvancedImagePoint, strokes: AdvancedImageStroke[]): boolean {
  for (const stroke of strokes) {
    if (stroke.points.length === 1) {
      if (distance(point, stroke.points[0]) <= stroke.radius) return true;
      continue;
    }
    if (stroke.closed && stroke.points.length >= 3 && pointInsidePolygon(point, stroke.points)) {
      return true;
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      if (distanceToSegment(point, stroke.points[index - 1], stroke.points[index]) <= stroke.radius) return true;
    }
  }
  return false;
}

function pointInsidePolygon(point: AdvancedImagePoint, polygon: AdvancedImagePoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / Math.max(1e-9, b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: AdvancedImagePoint, start: AdvancedImagePoint, end: AdvancedImagePoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function distance(a: AdvancedImagePoint, b: AdvancedImagePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function assertValidSourceSize(sourceSize: AdvancedImageSourceSize): void {
  if (
    !Number.isFinite(sourceSize.width) ||
    !Number.isFinite(sourceSize.height) ||
    sourceSize.width <= 0 ||
    sourceSize.height <= 0
  ) {
    throw new Error("Advanced image source size must have positive width and height.");
  }
}

function assertSameSourceSize(
  a: AdvancedImageSourceSize,
  b: AdvancedImageSourceSize,
): AdvancedImageSourceSize {
  assertValidSourceSize(a);
  assertValidSourceSize(b);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("Advanced image zones must share the same source size.");
  }
  return a;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
