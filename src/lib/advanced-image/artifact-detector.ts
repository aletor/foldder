import type { AdvancedImageBox } from "./domain";

export type AdvancedImageArtifactDetectorResult = {
  contaminated: boolean;
  confidence: number;
  suspectColors: string[];
  suspectRegions: AdvancedImageBox[];
};

export type AdvancedImageArtifactDetector = (imageUrl: string) => Promise<AdvancedImageArtifactDetectorResult>;

const UI_COLOR_TARGETS = [
  { b: 255, g: 0, hex: "#0000ff", r: 0 },
  { b: 0, g: 0, hex: "#ff0000", r: 255 },
  { b: 0, g: 255, hex: "#00ff00", r: 0 },
  { b: 255, g: 0, hex: "#ff00ff", r: 255 },
  { b: 0, g: 255, hex: "#ffff00", r: 255 },
];

export function detectAdvancedImageArtifactsInImageData(
  imageData: ImageData,
): AdvancedImageArtifactDetectorResult {
  const { data, height, width } = imageData;
  const hitsByColor = new Map<string, { count: number; maxX: number; maxY: number; minX: number; minY: number }>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      if (a < 180) continue;
      const target = nearestUiColor(r, g, b);
      if (!target) continue;
      const item = hitsByColor.get(target.hex) ?? {
        count: 0,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
      };
      item.count += 1;
      item.minX = Math.min(item.minX, x);
      item.minY = Math.min(item.minY, y);
      item.maxX = Math.max(item.maxX, x);
      item.maxY = Math.max(item.maxY, y);
      hitsByColor.set(target.hex, item);
    }
  }

  const suspectRegions: AdvancedImageBox[] = [];
  const suspectColors: string[] = [];
  let strongest = 0;
  for (const [hex, item] of hitsByColor) {
    const box = {
      height: Math.max(0, item.maxY - item.minY + 1),
      width: Math.max(0, item.maxX - item.minX + 1),
      x: item.minX,
      y: item.minY,
    };
    const span = Math.max(box.width, box.height);
    const coverage = item.count / Math.max(1, width * height);
    const thinness = item.count / Math.max(1, box.width * box.height);
    const narrowStroke = Math.min(box.width, box.height) <= 10 && span > 50;
    const looksLikeLine = span > 50 && coverage > 0.0004 && (thinness < 0.45 || narrowStroke);
    if (!looksLikeLine) continue;
    suspectRegions.push(box);
    suspectColors.push(hex);
    strongest = Math.max(strongest, Math.min(0.98, 0.45 + coverage * 50 + (span / Math.max(width, height)) * 0.35));
  }

  return {
    contaminated: strongest > 0.7,
    confidence: Number(strongest.toFixed(3)),
    suspectColors,
    suspectRegions,
  };
}

function nearestUiColor(r: number, g: number, b: number): { hex: string } | null {
  for (const target of UI_COLOR_TARGETS) {
    const dist = Math.sqrt((r - target.r) ** 2 + (g - target.g) ** 2 + (b - target.b) ** 2);
    const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
    if (dist < 70 && saturation > 0.75) return { hex: target.hex };
  }
  return null;
}
