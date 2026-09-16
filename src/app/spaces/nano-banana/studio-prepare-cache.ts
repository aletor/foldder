import { prepareStudioGenerateCall, type StudioPreparedGenerate } from "./studio-prepare-generate";
import type { StudioCard, StudioGlobal } from "./studio-types";

type CacheEntry = { key: string; value: StudioPreparedGenerate };

let cached: CacheEntry | null = null;

function cardFingerprint(card: StudioCard): string {
  return [
    card.id,
    card.description.trim(),
    card.paintData ? String(card.paintData.length) : "0",
    card.lassoPoints.length,
    card.references.join("|"),
  ].join(":");
}

export function studioPrepareCacheKey(args: {
  baseImage: string | null;
  cards: StudioCard[];
  frameWidth: number;
  frameHeight: number;
  global: StudioGlobal;
  contextCrop?: boolean;
}): string {
  return JSON.stringify({
    base: args.baseImage ? `${args.baseImage.length}:${args.baseImage.slice(0, 256)}:${args.baseImage.slice(-64)}` : "",
    w: args.frameWidth,
    h: args.frameHeight,
    cards: args.cards.map(cardFingerprint),
    text: args.global.text.trim(),
    schema: Boolean(args.global.schemaData),
    crop: Boolean(args.contextCrop),
  });
}

export function invalidateStudioPrepareCache(): void {
  cached = null;
}

export async function prepareStudioGenerateCallCached(args: {
  baseImage: string | null;
  cards: StudioCard[];
  frameWidth: number;
  frameHeight: number;
  global?: StudioGlobal;
  contextCrop?: boolean;
}): Promise<StudioPreparedGenerate> {
  const global = args.global ?? { promptDraft: "", schemaData: null, text: "" };
  const key = studioPrepareCacheKey({ ...args, global });
  if (cached && cached.key === key) return cached.value;
  const value = await prepareStudioGenerateCall(args);
  // Un análisis fallido no se cachea: el siguiente gesto explícito del usuario (Generar o volver a
  // abrir "Ver qué se enviará") vuelve a intentarlo en vez de arrastrar el prompt de respaldo.
  if (!value.analyzeError) cached = { key, value };
  return value;
}
