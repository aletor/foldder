/**
 * Resolución de valores operativos BrandKit → Dataset (colores detectados, mosaicos, etc.).
 */

import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import { normalizeVisualDnaSlots } from "@/lib/brain/visual-dna-slot/normalize";
import type {
  BrainDiscoveredBrandAsset,
  BrainVisualStyleSlotKey,
  BrandPublicGalleryImage,
  KnowledgeDocumentEntry,
  ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";

const CONTEXT_MAX = 480;

function normalizeHex(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  const match = v.match(/#(?:[0-9a-fA-F]{6})\b/);
  return match ? match[0].toUpperCase() : null;
}

function resolveBrainSourceScope(
  doc: KnowledgeDocumentEntry,
): NonNullable<KnowledgeDocumentEntry["brainSourceScope"]> {
  if (doc.brainSourceScope === "brand" || doc.brainSourceScope === "project" || doc.brainSourceScope === "capsule") {
    return doc.brainSourceScope;
  }
  return doc.scope === "context" ? "project" : "brand";
}

function readDocumentVisualSignalColors(doc: KnowledgeDocumentEntry): string[] {
  if (doc.status !== "Analizado" || !doc.extractedContext) return [];
  try {
    const parsed = JSON.parse(doc.extractedContext) as Record<string, unknown>;
    const visual =
      parsed.visual_signals && typeof parsed.visual_signals === "object"
        ? (parsed.visual_signals as Record<string, unknown>)
        : null;
    if (!visual) return [];
    const readList = (key: string) =>
      Array.isArray(visual[key])
        ? (visual[key] as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
    const colors = [
      ...readList("colors"),
      ...readList("textures").flatMap((x) => x.match(/#(?:[0-9a-fA-F]{6})\b/g) ?? []),
      ...(doc.extractedContext.match(/#(?:[0-9a-fA-F]{6})\b/g) ?? []),
    ];
    return Array.from(new Set(colors.map(normalizeHex).filter((x): x is string => Boolean(x))));
  } catch {
    return [];
  }
}

function collectDiscoveredColorHexes(assets: ProjectAssetsMetadata): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const hex = normalizeHex(raw);
    if (!hex || seen.has(hex)) return;
    seen.add(hex);
    out.push(hex);
  };

  for (const asset of assets.strategy.visualGeneralLook?.discoveredBrandAssets ?? []) {
    if (asset.kind === "color") push(asset.hex ?? asset.value);
  }

  for (const doc of assets.knowledge.documents) {
    if (resolveBrainSourceScope(doc) !== "brand") continue;
    for (const hex of readDocumentVisualSignalColors(doc)) push(hex);
  }

  const refs = collectVisualImageAssetRefs(assets);
  const byId = new Map(
    (assets.strategy.visualReferenceAnalysis?.analyses ?? []).map((a) => [a.sourceAssetId, a]),
  );
  const excludedRefs = new Set(
    assets.strategy.visualGeneralLook?.excludedReferenceSourceAssetIds ?? [],
  );

  for (const ref of refs) {
    if (excludedRefs.has(ref.id)) continue;
    const doc = assets.knowledge.documents.find((d) => d.id === ref.id);
    const scope = doc ? resolveBrainSourceScope(doc) : "brand";
    if (scope !== "brand" && ref.sourceKind !== "brand_logo") continue;
    const analysis = byId.get(ref.id);
    for (const raw of [
      ...(analysis?.colorPalette?.dominant ?? []),
      ...(analysis?.colorPalette?.secondary ?? []),
    ]) {
      push(raw);
    }
  }

  for (const slot of normalizeVisualDnaSlots(assets.strategy.visualDnaSlots ?? [])) {
    for (const raw of slot.palette?.dominantColors ?? []) push(raw);
  }

  return out;
}

export function resolveBrandKitDatasetColors(assets: ProjectAssetsMetadata): {
  primary: string;
  secondary: string;
  accent: string;
} {
  const manual = {
    primary: normalizeHex(assets.brand.colorPrimary) ?? "",
    secondary: normalizeHex(assets.brand.colorSecondary) ?? "",
    accent: normalizeHex(assets.brand.colorAccent) ?? "",
  };
  const discovered = collectDiscoveredColorHexes(assets).filter(
    (hex) => hex !== manual.primary && hex !== manual.secondary && hex !== manual.accent,
  );
  let i = 0;
  const nextDiscovered = () => discovered[i++] ?? "";
  return {
    primary: manual.primary || nextDiscovered(),
    secondary: manual.secondary || nextDiscovered(),
    accent: manual.accent || nextDiscovered(),
  };
}

function slotImageFromVisualDna(
  assets: ProjectAssetsMetadata,
  key: BrainVisualStyleSlotKey,
): string {
  const pickers: Record<
    BrainVisualStyleSlotKey,
    (slot: ReturnType<typeof normalizeVisualDnaSlots>[number]) => (string | undefined)[]
  > = {
    protagonist: (s) => [s.hero?.imageUrl, s.mosaic?.imageUrl, s.sourceImageUrl],
    environment: (s) => [
      s.environments?.same?.imageUrl,
      s.environments?.similar?.imageUrl,
      s.mosaic?.imageUrl,
      s.sourceImageUrl,
    ],
    textures: (s) => [s.textures?.same?.imageUrl, s.textures?.similar?.imageUrl, s.mosaic?.imageUrl],
    people: (s) => [s.people?.same?.imageUrl, s.people?.similar?.imageUrl, s.sourceImageUrl],
    objects: (s) => [s.objects?.same?.imageUrl, s.objects?.similar?.imageUrl, s.sourceImageUrl],
  };
  const seen = new Set<string>();
  for (const slot of normalizeVisualDnaSlots(assets.strategy.visualDnaSlots ?? [])) {
    if (slot.status !== "ready" && !slot.mosaic?.imageUrl?.trim()) continue;
    for (const candidate of pickers[key](slot)) {
      const url = candidate?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      return url;
    }
  }
  return "";
}

export function resolveBrandKitDatasetVisualSlotUrl(
  assets: ProjectAssetsMetadata,
  key: BrainVisualStyleSlotKey,
): string {
  const manual = assets.strategy.visualStyle[key]?.imageUrl?.trim();
  if (manual) return manual;
  return slotImageFromVisualDna(assets, key);
}

export function collectDiscoveredLogos(assets: ProjectAssetsMetadata): BrainDiscoveredBrandAsset[] {
  const excluded = new Set(assets.strategy.visualGeneralLook?.excludedDiscoveredBrandAssetIds ?? []);
  const out: BrainDiscoveredBrandAsset[] = [];
  for (const asset of assets.strategy.visualGeneralLook?.discoveredBrandAssets ?? []) {
    if (asset.kind !== "logo" || excluded.has(asset.id)) continue;
    out.push(asset);
  }
  if (out.length) return out;

  for (const ref of collectVisualImageAssetRefs(assets)) {
    if (ref.sourceKind !== "brand_logo") continue;
    const url = ref.imageUrlForVision?.trim();
    if (!url) continue;
    out.push({
      id: `brand-logo:${ref.id}`,
      kind: "logo",
      label: ref.name || "Logo detectado",
      value: url,
      imageUrl: url,
      sourceAssetId: ref.id,
      sourceName: ref.name,
      confidence: 0.9,
      discoveredAt: new Date().toISOString(),
    });
  }
  return out;
}

export function resolveBrandKitDatasetLogos(assets: ProjectAssetsMetadata): {
  positive: string;
  negative: string;
} {
  let positive = assets.brand.logoPositive?.trim() ?? "";
  let negative = assets.brand.logoNegative?.trim() ?? "";
  if (positive && negative) return { positive, negative };

  for (const asset of collectDiscoveredLogos(assets)) {
    const url = asset.imageUrl?.trim() || asset.value?.trim();
    if (!url) continue;
    if (!positive) positive = url;
    else if (!negative && url !== positive) negative = url;
    if (positive && negative) break;
  }
  return { positive, negative };
}

export function resolveBrandKitDatasetGallery(
  assets: ProjectAssetsMetadata,
  max = 5,
): BrandPublicGalleryImage[] {
  const existing = (assets.strategy.brandPublicGallery ?? []).filter((e) => e.imageUrl?.trim());
  if (existing.length) return existing.slice(0, max);

  const entries: BrandPublicGalleryImage[] = [];
  const seen = new Set<string>();
  const push = (imageUrl: string, category: BrainVisualStyleSlotKey) => {
    const url = imageUrl.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    entries.push({
      id: `bkgal_${entries.length}_${Date.now().toString(36)}`,
      category,
      imageUrl: url,
    });
  };

  for (const slot of normalizeVisualDnaSlots(assets.strategy.visualDnaSlots ?? [])) {
    if (slot.sourceImageUrl?.trim()) push(slot.sourceImageUrl, "environment");
    if (slot.mosaic?.imageUrl?.trim()) push(slot.mosaic.imageUrl, "textures");
    if (slot.hero?.imageUrl?.trim()) push(slot.hero.imageUrl, "protagonist");
    if (entries.length >= max) return entries.slice(0, max);
  }

  const collage = assets.strategy.visualReferenceAnalysis?.dnaCollageImageDataUrl?.trim();
  if (collage && entries.length < max) push(collage, "environment");

  const refs = collectVisualImageAssetRefs(assets);
  const excluded = new Set(assets.strategy.visualGeneralLook?.excludedReferenceSourceAssetIds ?? []);
  for (const ref of refs) {
    if (excluded.has(ref.id)) continue;
    const url = ref.imageUrlForVision?.trim();
    if (!url) continue;
    const doc = assets.knowledge.documents.find((d) => d.id === ref.id);
    const scope = doc ? resolveBrainSourceScope(doc) : "brand";
    if (scope !== "brand" && ref.sourceKind !== "brand_logo") continue;
    push(url, ref.sourceKind === "brand_logo" ? "protagonist" : "environment");
    if (entries.length >= max) break;
  }

  return entries.slice(0, max);
}

export function toPlainBrandText(raw: string, maxLen = CONTEXT_MAX): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const parts: string[] = [];
      const walk = (val: unknown, depth: number) => {
        if (depth > 4) return;
        if (typeof val === "string" && val.trim()) parts.push(val.trim());
        else if (Array.isArray(val)) val.forEach((v) => walk(v, depth + 1));
        else if (val && typeof val === "object") Object.values(val).forEach((v) => walk(v, depth + 1));
      };
      walk(parsed, 0);
      const flat = parts.filter(Boolean).slice(0, 16).join(". ");
      if (flat) return flat.slice(0, maxLen);
    } catch {
      /* fall through */
    }
  }

  const docBlocks = trimmed.split(/^###\s+/m).filter(Boolean);
  if (docBlocks.length > 1 || trimmed.startsWith("###")) {
    const chunks: string[] = [];
    for (const block of docBlocks) {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const title = lines[0]?.replace(/^Document:\s*/i, "").trim();
      if (title) chunks.push(title);
      for (const line of lines.slice(1)) {
        const labeled = line.match(/^\*\*([^*]+):\*\*\s*(.+)$/);
        if (labeled) {
          const val = labeled[2].trim();
          if (val) chunks.push(`${labeled[1].trim()}: ${val}`);
        } else {
          const plain = line.replace(/\*\*/g, "").replace(/^[-*]\s+/, "").trim();
          if (plain) chunks.push(plain);
        }
      }
    }
    if (chunks.length) return chunks.join("\n").slice(0, maxLen);
  }

  return trimmed
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLen);
}

export function resolveBrandKitDatasetContext(assets: ProjectAssetsMetadata): string {
  return toPlainBrandText(assets.knowledge.corporateContext || "", CONTEXT_MAX);
}

export function resolveBrandKitDatasetTone(assets: ProjectAssetsMetadata): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const text = toPlainBrandText(raw, 240);
    if (!text || seen.has(text.toLowerCase())) return;
    seen.add(text.toLowerCase());
    lines.push(text);
  };
  for (const trait of assets.strategy.languageTraits) push(trait);
  for (const term of assets.strategy.preferredTerms) push(term);
  for (const voice of assets.strategy.voiceExamples) {
    if (voice.kind === "approved_voice") push(voice.text);
  }
  return lines.slice(0, 12).join("\n");
}

export function resolveBrandKitDatasetMessage(raw: string): string {
  return toPlainBrandText(raw, 500);
}

export function brandKitVisualProjectionSignature(rawAssets: unknown, brainNodeId: string): string {
  const assets = rawAssets as ProjectAssetsMetadata;
  if (!assets || typeof assets !== "object") return brainNodeId;
  const colors = resolveBrandKitDatasetColors(assets);
  const logos = resolveBrandKitDatasetLogos(assets);
  const slots = (["environment", "textures", "people", "objects", "protagonist"] as const).map((k) =>
    resolveBrandKitDatasetVisualSlotUrl(assets, k),
  );
  const gallery = resolveBrandKitDatasetGallery(assets).map((g) => `${g.category}:${g.imageUrl}`);
  return [brainNodeId, colors.primary, colors.secondary, colors.accent, logos.positive, logos.negative, ...slots, ...gallery].join("|");
}
