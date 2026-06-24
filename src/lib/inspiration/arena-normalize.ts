import type { InspirationResult } from "./inspiration-shared";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function readImageVersionUrl(version: unknown): string | undefined {
  if (!version || typeof version !== "object") return undefined;
  return asString((version as { url?: unknown; src?: unknown; src_2x?: unknown }).url)
    || asString((version as { src_2x?: unknown }).src_2x)
    || asString((version as { src?: unknown }).src);
}

function normalizeArenaV2Block(raw: unknown): InspirationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  if (block.class !== "Image") return null;
  if (block.state && block.state !== "available") return null;

  const image = block.image && typeof block.image === "object" ? (block.image as Record<string, unknown>) : null;
  if (!image) return null;

  const imageUrl =
    readImageVersionUrl(image.large) ||
    readImageVersionUrl(image.display) ||
    readImageVersionUrl(image.original) ||
    asString(image.url);
  const thumbUrl =
    readImageVersionUrl(image.thumb) ||
    readImageVersionUrl(image.square) ||
    readImageVersionUrl(image.display) ||
    imageUrl;

  const id = String(block.id ?? "");
  if (!id || !imageUrl || !thumbUrl) return null;

  const user = block.user && typeof block.user === "object" ? (block.user as Record<string, unknown>) : {};

  return {
    id: `arena-${id}`,
    source: "Are.na",
    imageUrl,
    thumbUrl,
    title: asString(block.title) || asString(block.generated_title),
    author: asString(user.full_name) || asString(user.username),
    sourceUrl: `https://www.are.na/block/${id}`,
    width: asNumber(image.width),
    height: asNumber(image.height),
  };
}

function normalizeArenaV3Block(raw: unknown): InspirationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  if (block.type !== "Image") return null;
  if (block.state && block.state !== "available") return null;

  const image = block.image && typeof block.image === "object" ? (block.image as Record<string, unknown>) : null;
  if (!image) return null;

  const imageUrl =
    readImageVersionUrl(image.large) ||
    asString(image.src) ||
    readImageVersionUrl(image.medium);
  const thumbUrl =
    readImageVersionUrl(image.small) ||
    readImageVersionUrl(image.medium) ||
    imageUrl;

  const id = String(block.id ?? "");
  if (!id || !imageUrl || !thumbUrl) return null;

  const user = block.user && typeof block.user === "object" ? (block.user as Record<string, unknown>) : {};
  const links = block._links && typeof block._links === "object" ? (block._links as Record<string, unknown>) : {};
  const selfLink = links.self && typeof links.self === "object" ? (links.self as Record<string, unknown>) : null;

  return {
    id: `arena-${id}`,
    source: "Are.na",
    imageUrl,
    thumbUrl,
    title: asString(block.title) || asString(image.alt_text),
    author: asString(user.full_name) || asString(user.username),
    sourceUrl: asString(selfLink?.href) || `https://www.are.na/block/${id}`,
    width: asNumber(image.width) ?? asNumber((image.large as { width?: unknown } | undefined)?.width),
    height: asNumber(image.height) ?? asNumber((image.large as { height?: unknown } | undefined)?.height),
  };
}

export function normalizeArenaImageBlock(raw: unknown): InspirationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  if (block.class === "Image") return normalizeArenaV2Block(raw);
  if (block.type === "Image") return normalizeArenaV3Block(raw);
  return null;
}

export { normalizeArenaV2Block };
