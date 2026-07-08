import type { CSSProperties } from "react";
import type { Node, NodeChange, XYPosition } from "@xyflow/react";

export const FOLDDER_GRID_CELL = 92;
export const FOLDDER_GRID_GAP = 16;
export const FOLDDER_GRID_STEP = FOLDDER_GRID_CELL + FOLDDER_GRID_GAP;

export type GridPreset = {
  cols: number;
  rows: number;
};

/**
 * Tamaño por defecto de cada nodo sobre la base 5×5 (techo al que se puede
 * redimensionar). El tamaño refleja la relevancia/rol del nodo:
 *   · Tier 1 (5×4): creación principal (resultado visual/creativo).
 *   · Tier 2 (5×3): captura y procesado visual.
 *   · Tier 3 (4×3): texto / contenido.
 *   · Tier 4 (3×2): utilidades y export.
 *   · Tier 5 (3×1): conectores de space.
 * `canvasGroup` es un contenedor (5×4). `promptInput`/`notes` tienen tamaño dinámico propio.
 */
const STATIC_NODE_GRID_PRESETS: Record<string, GridPreset> = {
  // Tier 1 — 5×4 · creación principal
  designer: { cols: 5, rows: 4 },
  imageCreationAdvanced: { cols: 5, rows: 4 },
  nanoBanana: { cols: 5, rows: 4 },
  cine: { cols: 5, rows: 4 },
  geminiVideo: { cols: 5, rows: 4 },
  videoEditor: { cols: 5, rows: 4 },
  video_editor: { cols: 5, rows: 4 },
  inspiration: { cols: 5, rows: 4 },

  // Tier 2 — 5×3 · captura y procesado visual
  mediaInput: { cols: 5, rows: 3 },
  urlImage: { cols: 5, rows: 3 },
  crop: { cols: 5, rows: 3 },
  backgroundRemover: { cols: 5, rows: 3 },
  layerizer: { cols: 5, rows: 3 },
  vfxGenerator: { cols: 5, rows: 3 },
  painter: { cols: 5, rows: 3 },
  lightroom: { cols: 5, rows: 3 },
  presenter: { cols: 5, rows: 3 },

  // Tier 2b — 4×4 · datasets de proyecto
  dataset: { cols: 4, rows: 4 },

  // Tier 3 — 4×3 · texto / contenido
  guionista: { cols: 4, rows: 3 },
  grokProcessor: { cols: 4, rows: 3 },
  enhancer: { cols: 4, rows: 3 },
  concatenator: { cols: 4, rows: 3 },
  listado: { cols: 4, rows: 3 },
  mediaDescriber: { cols: 4, rows: 3 },

  // Tier 4 — 3×2 · utilidades y export
  loop: { cols: 4, rows: 4 },
  populate: { cols: 4, rows: 4 },
  imageExport: { cols: 3, rows: 2 },
  export_multimedia: { cols: 5, rows: 4 },
  exportMultiple: { cols: 5, rows: 4 },
  projectBrain: { cols: 3, rows: 2 },
  genoma: { cols: 3, rows: 2 },
  projectAssets: { cols: 3, rows: 2 },
  space: { cols: 3, rows: 2 },

  // Tier 5 — 3×1 · conectores de space
  spaceInput: { cols: 3, rows: 1 },
  spaceOutput: { cols: 3, rows: 1 },

  // Contenedor
  canvasGroup: { cols: 5, rows: 4 },
};

const ASPECT_RATIO_NODE_TYPES = new Set([
  "backgroundRemover",
  "layerizer",
  "cine",
  "crop",
  "designer",
  "geminiVideo",
  "grokProcessor",
  "imageExport",
  "imageCreationAdvanced",
  "inspiration",
  "mediaInput",
  "nanoBanana",
  "urlImage",
  "vfxGenerator",
  "videoEditor",
  "video_editor",
]);

export const FOLDDER_VISUAL_MAX_GRID_COLS = 5;
export const FOLDDER_VISUAL_MAX_GRID_ROWS = 5;

function gridLength(units: number): number {
  const safeUnits = Math.max(1, Math.round(units));
  return safeUnits * FOLDDER_GRID_CELL + Math.max(0, safeUnits - 1) * FOLDDER_GRID_GAP;
}

function parseStyleDimension(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px/gi, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function foldderGridFrame(cols: number, rows: number): { width: number; height: number } {
  return {
    width: gridLength(cols),
    height: gridLength(rows),
  };
}

export function getStaticNodeGridAspectRatio(type: string | undefined): number | null {
  if (!type) return null;
  const preset = STATIC_NODE_GRID_PRESETS[type];
  if (!preset) return null;
  const frame = foldderGridFrame(preset.cols, preset.rows);
  return frame.width / frame.height;
}

export function gridUnitsForDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.round((value + FOLDDER_GRID_GAP) / FOLDDER_GRID_STEP));
}

export function isAspectRatioGridNodeType(type: string | undefined): boolean {
  return Boolean(type && ASPECT_RATIO_NODE_TYPES.has(type));
}

function ratioForGridPreset(preset: GridPreset): number {
  const frame = foldderGridFrame(preset.cols, preset.rows);
  return frame.width / Math.max(1, frame.height);
}

export function resolveGridPresetFromAspectRatio(
  ratio: number,
  options: {
    minCols?: number;
    minRows?: number;
    maxCols?: number;
    maxRows?: number;
  } = {},
): GridPreset {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const minCols = Math.max(1, Math.floor(options.minCols ?? 1));
  const minRows = Math.max(1, Math.floor(options.minRows ?? 1));
  const maxCols = Math.max(minCols, Math.floor(options.maxCols ?? FOLDDER_VISUAL_MAX_GRID_COLS));
  const maxRows = Math.max(minRows, Math.floor(options.maxRows ?? FOLDDER_VISUAL_MAX_GRID_ROWS));
  let best: { preset: GridPreset; error: number; area: number } | null = null;

  for (let cols = minCols; cols <= maxCols; cols += 1) {
    for (let rows = minRows; rows <= maxRows; rows += 1) {
      const preset = { cols, rows };
      const frameRatio = ratioForGridPreset(preset);
      const error = Math.abs(Math.log(frameRatio / safeRatio));
      const area = cols * rows;
      if (
        !best ||
        error < best.error - 0.035 ||
        (Math.abs(error - best.error) <= 0.035 && area > best.area)
      ) {
        best = { preset, error, area };
      }
    }
  }

  return best?.preset ?? { cols: maxCols, rows: maxRows };
}

export function resolveGridFrameFromAspectRatio(
  ratio: number,
  options?: Parameters<typeof resolveGridPresetFromAspectRatio>[1],
): { width: number; height: number; cols: number; rows: number } {
  const preset = resolveGridPresetFromAspectRatio(ratio, options);
  return {
    ...preset,
    ...foldderGridFrame(preset.cols, preset.rows),
  };
}

export function snapAspectDimensionsToGrid(
  dimensions: { width: number; height: number },
  ratio: number,
  options: {
    minCols?: number;
    minRows?: number;
    maxCols?: number;
    maxRows?: number;
  } = {},
): { width: number; height: number } {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : dimensions.width / Math.max(1, dimensions.height);
  const preferredCols = gridUnitsForDimension(dimensions.width);
  const preferredRows = gridUnitsForDimension(dimensions.height);
  const minCols = Math.max(1, Math.floor(options.minCols ?? 1));
  const minRows = Math.max(1, Math.floor(options.minRows ?? 1));
  const maxCols = Math.max(minCols, Math.floor(options.maxCols ?? Math.max(12, preferredCols + 3)));
  const maxRows = Math.max(minRows, Math.floor(options.maxRows ?? Math.max(12, preferredRows + 3)));
  let best: { preset: GridPreset; score: number } | null = null;

  for (let cols = minCols; cols <= maxCols; cols += 1) {
    for (let rows = minRows; rows <= maxRows; rows += 1) {
      const preset = { cols, rows };
      const ratioError = Math.abs(Math.log(ratioForGridPreset(preset) / safeRatio));
      const sizeDistance = Math.abs(cols - preferredCols) + Math.abs(rows - preferredRows);
      const score = ratioError * 8 + sizeDistance;
      if (!best || score < best.score) best = { preset, score };
    }
  }

  const preset = best?.preset ?? resolveGridPresetFromAspectRatio(safeRatio, options);
  return foldderGridFrame(preset.cols, preset.rows);
}

function aspectLockedDimensions(
  dimensions: { width: number; height: number },
  ratio: number,
): { width: number; height: number } {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  if (!safeRatio) return dimensions;
  const width = Number.isFinite(dimensions.width) && dimensions.width > 0 ? dimensions.width : 1;
  const height = Number.isFinite(dimensions.height) && dimensions.height > 0 ? dimensions.height : 1;
  const widthFromHeight = height * safeRatio;
  const heightFromWidth = width / safeRatio;
  const widthDelta = Math.abs(widthFromHeight - width);
  const heightDelta = Math.abs(heightFromWidth - height);

  if (widthDelta <= heightDelta * safeRatio) {
    return { width, height: heightFromWidth };
  }
  return { width: widthFromHeight, height };
}

export function snapPositionToGrid(position: XYPosition): XYPosition {
  return {
    x: Math.round(position.x / FOLDDER_GRID_STEP) * FOLDDER_GRID_STEP,
    y: Math.round(position.y / FOLDDER_GRID_STEP) * FOLDDER_GRID_STEP,
  };
}

export function snapCanvasDimensionToGrid(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return FOLDDER_GRID_CELL;
  const units = Math.max(1, Math.round((value + FOLDDER_GRID_GAP) / FOLDDER_GRID_STEP));
  return gridLength(units);
}

export function growCanvasDimensionToGrid(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return FOLDDER_GRID_CELL;
  const units = Math.max(1, Math.ceil((value + FOLDDER_GRID_GAP) / FOLDDER_GRID_STEP));
  return gridLength(units);
}

export function shrinkCanvasDimensionToGrid(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return FOLDDER_GRID_CELL;
  const units = Math.max(1, Math.floor((value + FOLDDER_GRID_GAP) / FOLDDER_GRID_STEP));
  return gridLength(units);
}

export function promptGridRows(value: unknown): number {
  const text = typeof value === "string" ? value : "";
  if (!text.trim()) return 1;
  const hardLines = text.split(/\r?\n/);
  const estimatedLines = hardLines.reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(line.length / 42));
  }, 0);
  if (estimatedLines <= 2 && text.length <= 90) return 1;
  if (estimatedLines <= 5 && text.length <= 260) return 2;
  return 3;
}

export function getNodeGridPreset(type: string | undefined, data?: unknown): GridPreset | null {
  if (!type) return null;
  if (type === "promptInput") {
    const value = data && typeof data === "object" ? (data as { value?: unknown }).value : undefined;
    return { cols: 3, rows: promptGridRows(value) };
  }
  if (isAspectRatioGridNodeType(type)) {
    const aspectRatio = nodeAspectRatioFromData(type, data);
    if (aspectRatio) return resolveGridPresetFromAspectRatio(aspectRatio);
  }
  return STATIC_NODE_GRID_PRESETS[type] ?? null;
}

export function nodeAspectRatioFromData(type: string | undefined, data?: unknown): number | null {
  if (!type || !data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const parseNumberRatio = (value: unknown): number | null => {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  };
  const parseRatio = (value: unknown): number | null => {
    if (typeof value !== "string") return null;
    const parts = value.trim().split(/[:/]/).map((part) => Number(part.trim()));
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    if (parts[0] <= 0 || parts[1] <= 0) return null;
    return parts[0] / parts[1];
  };
  const explicit =
    parseNumberRatio(record._foldderAspectRatio) ??
    parseNumberRatio(record.foldderAspectRatio) ??
    parseRatio(record.aspectRatio) ??
    parseRatio(record.aspect_ratio) ??
    parseRatio(record.videoFormat);
  if (explicit) return explicit;
  if (type === "cine") {
    const visual = record.visualDirection;
    if (visual && typeof visual === "object") {
      const fromDirector = parseRatio((visual as Record<string, unknown>).aspectRatio);
      if (fromDirector) return fromDirector;
    }
  }
  if (type === "videoEditor" || type === "video_editor") {
    const render = record.render;
    if (render && typeof render === "object") {
      const settings = (render as Record<string, unknown>).settings;
      if (settings && typeof settings === "object") {
        const width = (settings as Record<string, unknown>).width;
        const height = (settings as Record<string, unknown>).height;
        if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
          return width / height;
        }
      }
    }
    return 16 / 9;
  }
  const width = typeof record.width === "number" ? record.width : undefined;
  const height = typeof record.height === "number" ? record.height : undefined;
  if (width && height && width > 0 && height > 0) return width / height;
  return getStaticNodeGridAspectRatio(type);
}

export function getNodeGridFrameForType(
  type: string | undefined,
  data?: unknown,
): { width: number; height: number } | null {
  const preset = getNodeGridPreset(type, data);
  return preset ? foldderGridFrame(preset.cols, preset.rows) : null;
}

export function applyNodeGridPreset<T extends Node | Record<string, unknown>>(node: T): T {
  const type = typeof node.type === "string" ? node.type : undefined;
  const frame = getNodeGridFrameForType(type, node.data);
  const position = node.position && typeof node.position === "object"
    ? snapPositionToGrid(node.position as XYPosition)
    : node.position;
  if (!frame) {
    return {
      ...node,
      ...(position ? { position } : {}),
    };
  }

  const style = ((node as { style?: CSSProperties }).style ?? {}) as CSSProperties;
  const existingWidth = parseStyleDimension(style.width);
  const existingHeight = parseStyleDimension(style.height);
  const aspectRatio =
    nodeAspectRatioFromData(type, node.data) ??
    (existingWidth && existingHeight ? existingWidth / existingHeight : null) ??
    getStaticNodeGridAspectRatio(type);
  const nextFrame =
    existingWidth || existingHeight
      ? isAspectRatioGridNodeType(type) && aspectRatio
        ? snapAspectDimensionsToGrid(
            { width: existingWidth ?? frame.width, height: existingHeight ?? frame.height },
            aspectRatio,
          )
        : {
            width: existingWidth ? snapCanvasDimensionToGrid(existingWidth) : frame.width,
            height: existingHeight ? snapCanvasDimensionToGrid(existingHeight) : frame.height,
          }
      : frame;
  const nextData =
    isAspectRatioGridNodeType(type) && aspectRatio
      ? {
          ...(typeof node.data === "object" && node.data !== null ? (node.data as Record<string, unknown>) : {}),
          _foldderAspectRatio: aspectRatio,
        }
      : node.data;
  return {
    ...node,
    ...(position ? { position } : {}),
    data: nextData,
    style: {
      ...style,
      width: nextFrame.width,
      height: nextFrame.height,
    },
  };
}

export function snapNodeChangesToGrid(changes: NodeChange[], nodes: Node[] = []): NodeChange[] {
  return changes.map((change) => {
    if (change.type === "position" && change.position && (change as { dragging?: boolean }).dragging === false) {
      return {
        ...change,
        position: snapPositionToGrid(change.position),
      };
    }

    if (change.type === "dimensions" && change.dimensions) {
      const node = nodes.find((candidate) => candidate.id === change.id);
      const style = (node?.style ?? {}) as CSSProperties;
      const styleWidth = parseStyleDimension(style.width);
      const styleHeight = parseStyleDimension(style.height);
      const currentRatio =
        nodeAspectRatioFromData(node?.type, node?.data) ??
        (styleWidth && styleHeight ? styleWidth / styleHeight : null) ??
        (node?.width && node?.height ? node.width / node.height : null) ??
        getStaticNodeGridAspectRatio(node?.type);
      const isResizeEnd = (change as { resizing?: boolean }).resizing === false;
      if (isAspectRatioGridNodeType(node?.type) && currentRatio) {
        return {
          ...change,
          dimensions: isResizeEnd
            ? snapAspectDimensionsToGrid(change.dimensions, currentRatio)
            : aspectLockedDimensions(change.dimensions, currentRatio),
        };
      }
      if (!isResizeEnd) return change;
      return {
        ...change,
        dimensions: {
          width: snapCanvasDimensionToGrid(change.dimensions.width),
          height: snapCanvasDimensionToGrid(change.dimensions.height),
        },
      };
    }

    return change;
  });
}
