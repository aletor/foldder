import { compactImageForAnalyzeAreas, compactMaskForAnalyzeAreas } from "./studio-compact";
import {
  appendStudioOutputGuards,
  buildStudioGenerateImageSlots,
  describeStudioGenerateImageOrder,
  shouldRunAnalyzeAreas,
  type StudioGenerateSlotsInput,
} from "./studio-generate-payload";
import {
  buildStudioReferenceGrid,
  describeStudioGridForPrompt,
  flattenStudioReferenceCells,
  gridCellsForCard,
} from "./studio-reference-grid";
import {
  emptyStudioGlobal,
  type StudioCard,
  type StudioGlobal,
} from "./studio-types";
import { buildStudioZoneMap, zoneMapImageForGenerate, type StudioPaintSpatial } from "./studio-zone-map";

export type StudioPreparedGenerate = {
  images: StudioGenerateSlotsInput;
  imageList: string[];
  prompt: string;
  ranAnalyzeAreas: boolean;
  /** Present when analyze-areas was attempted and failed. Local fallback prompt is used; no second paid call. */
  analyzeError: string | null;
};

function spatialFallbackLine(card: StudioCard, spatial: StudioPaintSpatial | null): string {
  if (!spatial) return card.description.trim();
  return `En la zona del trazo ${card.assignedColor.name} en REF 2 (${spatial.quadrant}; centroide ${spatial.cx}% izq. ${spatial.cy}% arriba; bbox ${spatial.bboxX1}%-${spatial.bboxX2}% horiz., ${spatial.bboxY1}%-${spatial.bboxY2}% vert.; ~${spatial.areaPct}% de la imagen): ${card.description.trim()}`;
}

function buildFallbackPrompt(args: {
  cards: StudioCard[];
  cells: ReturnType<typeof flattenStudioReferenceCells>;
  global: StudioGlobal;
  hasBase: boolean;
  hasZoneMap: boolean;
  spatialByCardId: Map<string, StudioPaintSpatial | null>;
}): string {
  const lines: string[] = [];
  if (args.hasBase) {
    lines.push("REFERENCIA 1: imagen base. Mantén todo lo que no se indica cambiar, conservando composición donde aplique.");
  }
  if (args.hasZoneMap) {
    lines.push(
      "REFERENCIA 2: zonas marcadas en color (trazos reales) — respetar la posición, forma y extensión de cada trazo.",
    );
  }
  if (args.cells.length > 0) {
    lines.push(describeStudioGridForPrompt(args.cells));
  }
  for (const card of args.cards) {
    const cells = gridCellsForCard(args.cells, card.id);
    const spatial = args.spatialByCardId.get(card.id) ?? null;
    const body = card.paintData
      ? spatialFallbackLine(card, spatial)
      : card.description.trim();
    const refNote = cells.length ? ` Usar celdas ${cells.join(", ")} del grid juntas.` : "";
    if (body) lines.push(`${body}${refNote}`);
  }
  if (args.global.text.trim()) {
    lines.push(`CAMBIO GLOBAL: ${args.global.text.trim()}`);
  }
  if (args.global.schemaData) {
    lines.push("El esquema de líneas indica colocación, pose y tamaño de la escena entera.");
  }
  return lines.join("\n");
}

export function shouldUsePaidAreaAnalysis(args: {
  allowPaidAnalyze?: boolean;
  baseImage: string | null;
  cards: StudioCard[];
}): boolean {
  return args.allowPaidAnalyze !== false && Boolean(args.baseImage) && shouldRunAnalyzeAreas(args.cards);
}

export async function prepareStudioGenerateCall(args: {
  baseImage: string | null;
  cards: StudioCard[];
  frameHeight: number;
  frameWidth: number;
  global?: StudioGlobal;
  /** False for read-only previews: building a preview must never trigger paid area analysis. */
  allowPaidAnalyze?: boolean;
}): Promise<StudioPreparedGenerate> {
  const global = args.global ?? emptyStudioGlobal();
  const cards = args.cards.filter(
    (card) => card.description.trim() || card.references.length > 0 || card.paintData,
  );
  const cells = flattenStudioReferenceCells(cards);
  const referenceGridImage = await buildStudioReferenceGrid(cells);

  const zoneMap = await buildStudioZoneMap({
    baseImageSrc: args.baseImage,
    cards,
    height: args.frameHeight,
    width: args.frameWidth,
  });
  let zoneMapImage = zoneMap ? zoneMapImageForGenerate(zoneMap) : null;
  const spatialByCardId = new Map(
    (zoneMap?.layers ?? []).map((layer) => [layer.cardId, layer.spatial] as const),
  );

  const slotsInput: StudioGenerateSlotsInput = {
    baseImage: args.baseImage,
    zoneMapImage,
    referenceGridImage,
    schemaImage: global.schemaData,
  };

  let prompt = "";
  let ranAnalyzeAreas = false;
  let analyzeError: string | null = null;

  if (shouldUsePaidAreaAnalysis({ allowPaidAnalyze: args.allowPaidAnalyze, baseImage: args.baseImage, cards })) {
    const colorMapImageKind = zoneMap?.markedBaseUrl ? "marked-base" : "abstract-map";
    const [baseImageForAnalyze, colorMapImageForAnalyze] = await Promise.all([
      compactImageForAnalyzeAreas(args.baseImage, { maxSide: 1280, quality: 0.72, maxBytes: 900_000 }),
      compactImageForAnalyzeAreas(zoneMapImage, {
        maxSide: 960,
        quality: 0.68,
        maxBytes: 520_000,
      }),
    ]);
    type AnalyzeChange = {
      areaPct: number | null;
      assignedColorHex: string;
      bboxX1: number | null;
      bboxX2: number | null;
      bboxY1: number | null;
      bboxY2: number | null;
      color: string;
      description: string;
      gridCells: string[];
      isGlobal: boolean;
      paintData: string | null;
      posX: number | null;
      posY: number | null;
      quadrant: string | null;
      referenceImageData: string | null;
      referenceImages: string[];
    };
    const changesForAnalyze: AnalyzeChange[] = await Promise.all(
      cards.map(async (card) => {
        const spatial = spatialByCardId.get(card.id) ?? null;
        const [paintData, ...refCompact] = await Promise.all([
          compactMaskForAnalyzeAreas(card.paintData, { maxSide: 960, maxBytes: 420_000 }),
          ...card.references
            .slice(0, 4)
            .map((src) => compactImageForAnalyzeAreas(src, { maxSide: 960, quality: 0.7, maxBytes: 520_000 })),
        ]);
        const referenceImages = refCompact.filter((value): value is string => Boolean(value));
        return {
          color: card.assignedColor.name,
          description: card.description.trim(),
          posX: spatial?.cx ?? null,
          posY: spatial?.cy ?? null,
          bboxX1: spatial?.bboxX1 ?? null,
          bboxY1: spatial?.bboxY1 ?? null,
          bboxX2: spatial?.bboxX2 ?? null,
          bboxY2: spatial?.bboxY2 ?? null,
          areaPct: spatial?.areaPct ?? null,
          quadrant: spatial?.quadrant ?? null,
          paintData,
          assignedColorHex: card.assignedColor.hex,
          referenceImageData: referenceImages[0] ?? null,
          referenceImages,
          gridCells: gridCellsForCard(cells, card.id),
          isGlobal: false,
        };
      }),
    );
    if (global.text.trim() || global.schemaData) {
      changesForAnalyze.push({
        color: "global",
        description: [global.text.trim(), global.schemaData ? "Reorganizar según el esquema de líneas." : ""]
          .filter(Boolean)
          .join(" "),
        posX: null,
        posY: null,
        bboxX1: null,
        bboxY1: null,
        bboxX2: null,
        bboxY2: null,
        areaPct: null,
        quadrant: null,
        paintData: null,
        assignedColorHex: "#111827",
        referenceImageData: null,
        referenceImages: [],
        gridCells: [],
        isGlobal: true,
      });
    }
    try {
      const aiRes = await fetch("/api/gemini/analyze-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseImage: baseImageForAnalyze,
          colorMapImage: colorMapImageForAnalyze,
          colorMapImageKind,
          changes: changesForAnalyze,
        }),
      });
      const aiJson = (await aiRes.json().catch(async () => {
        const text = await aiRes.text().catch(() => "");
        return { error: text || `Analyze areas failed (${aiRes.status})` };
      })) as {
        error?: string;
        markedImageData?: string | null;
        markedImageMime?: string | null;
        prompt?: string;
      };
      if (aiRes.ok && aiJson.prompt) {
        prompt = aiJson.prompt;
        ranAnalyzeAreas = true;
        if (aiJson.markedImageData) {
          const mime =
            typeof aiJson.markedImageMime === "string" && aiJson.markedImageMime
              ? aiJson.markedImageMime
              : "image/png";
          zoneMapImage = `data:${mime};base64,${aiJson.markedImageData}`;
          slotsInput.zoneMapImage = zoneMapImage;
        }
      } else {
        throw new Error(aiJson.error || "No prompt returned");
      }
    } catch (error) {
      analyzeError = error instanceof Error ? error.message : "Analyze areas failed";
      prompt = buildFallbackPrompt({
        cards,
        cells,
        global,
        hasBase: Boolean(args.baseImage),
        hasZoneMap: Boolean(zoneMapImage),
        spatialByCardId,
      });
    }
  } else {
    prompt = buildFallbackPrompt({
      cards,
      cells,
      global,
      hasBase: Boolean(args.baseImage),
      hasZoneMap: Boolean(zoneMapImage),
      spatialByCardId,
    });
  }

  const order = describeStudioGenerateImageOrder(slotsInput);
  const gridBlock = describeStudioGridForPrompt(cells);
  prompt = [order.promptBlock, gridBlock, prompt].filter(Boolean).join("\n\n");
  prompt = appendStudioOutputGuards(prompt, slotsInput);

  return {
    images: slotsInput,
    imageList: buildStudioGenerateImageSlots(slotsInput),
    prompt,
    ranAnalyzeAreas,
    analyzeError,
  };
}
