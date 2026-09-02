import type { FreehandObject } from "../FreehandStudio";
import type { SiteCreatorSelectionIndex } from "./site-creator-selection-types";
import { textForeignObjectPadPx } from "../freehand/text-foreign-object-baseline";
import { coverageLayerIdsForItem } from "./site-creator-responsive-tunes";
import { getObjectFontSize } from "./site-creator-responsive-visual";
import {
  isSiteButtonNode,
  type ResponsiveItemRef,
  type SiteBlueprintV1,
} from "./site-creator-types";

export type ItemTransformKind = "uniform" | "textBox" | "textFontOnly";

export function isTextObject(obj: FreehandObject | null | undefined): obj is FreehandObject & {
  type: "text" | "textOnPath";
} {
  return Boolean(obj && (obj.type === "text" || obj.type === "textOnPath"));
}

export function isAreaTextObject(obj: FreehandObject | null | undefined): boolean {
  if (!obj || obj.type !== "text") return false;
  return (obj as { textMode?: string }).textMode === "area";
}

export function isPointTextObject(obj: FreehandObject | null | undefined): boolean {
  if (!obj || obj.type !== "text") return false;
  return (obj as { textMode?: string }).textMode !== "area";
}

export function layerOwnedByButton(blueprint: SiteBlueprintV1, layerId: string): boolean {
  for (const node of Object.values(blueprint.nodes)) {
    if (!isSiteButtonNode(node)) continue;
    if ((node.layerIds ?? []).includes(layerId)) return true;
  }
  return false;
}

export function resolveItemTransformKind(args: {
  blueprint: SiteBlueprintV1;
  target: ResponsiveItemRef | null | undefined;
  index: SiteCreatorSelectionIndex;
}): ItemTransformKind {
  if (!args.target) return "uniform";
  if (args.target.kind === "blueprintNode") {
    const node = args.blueprint.nodes[args.target.nodeId];
    if (node && isSiteButtonNode(node)) return "uniform";
  }
  const layerIds = coverageLayerIdsForItem(args.blueprint, args.target, args.index);
  if (layerIds.length !== 1) return "uniform";
  const layerId = layerIds[0]!;
  if (layerOwnedByButton(args.blueprint, layerId)) return "uniform";
  const obj = args.index.byId[layerId]?.object ?? null;
  if (!obj) return "uniform";
  if (obj.type === "textOnPath" || isPointTextObject(obj)) return "textFontOnly";
  if (isAreaTextObject(obj)) return "textBox";
  return "uniform";
}

function wrapPlainTextToWidth(text: string, innerWidth: number, fontSize: number): number {
  const avgChar = Math.max(4, fontSize * 0.52);
  const charsPerLine = Math.max(1, Math.floor(innerWidth / avgChar));
  let lines = 0;
  const raw = text.length === 0 ? " " : text;
  for (const para of raw.split("\n")) {
    const len = Math.max(1, para.length);
    lines += Math.ceil(len / charsPerLine);
  }
  return Math.max(1, lines);
}

function textContentForReflow(obj: FreehandObject): string {
  const spans = (obj as { _designerRichSpans?: Array<{ text: string }> })._designerRichSpans;
  if (spans?.length) return spans.map((s) => s.text).join("");
  return typeof (obj as { text?: string }).text === "string" ? (obj as { text: string }).text : "";
}

function trackingPxForReflow(obj: FreehandObject): number {
  return (
    ((obj as { letterSpacing?: number }).letterSpacing ?? 0) +
    ((obj as { charSpacing?: number }).charSpacing ?? 0)
  );
}

function wrapWithCanvas(text: string, innerWidth: number, obj: FreehandObject): number | null {
  if (typeof document === "undefined") return null;
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return null;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const fontSize = getObjectFontSize(obj);
    const family = (obj as { fontFamily?: string }).fontFamily ?? "sans-serif";
    const weight = (obj as { fontWeight?: string }).fontWeight ?? "400";
    const style = (obj as { fontStyle?: string }).fontStyle;
    const fst = style && style !== "normal" ? `${style} ` : "";
    ctx.font = `${fst}${weight} ${fontSize}px ${family}`;
    const letterSpacing = trackingPxForReflow(obj);
    const measure = (s: string) =>
      ctx.measureText(s).width + Math.max(0, s.length - 1) * letterSpacing;
    const raw = text.length === 0 ? " " : text;
    let count = 0;
    for (const para of raw.split("\n")) {
      const words = (para.length === 0 ? " " : para).split(/(\s+)/).filter((w) => w.length > 0);
      let line = "";
      for (const word of words) {
        const trial = line ? `${line}${word}` : word;
        if (measure(trial) <= innerWidth || !line) {
          line = trial;
          continue;
        }
        count += 1;
        line = word;
      }
      if (line) count += 1;
    }
    return Math.max(1, count);
  } catch {
    return null;
  }
}

/** Alto de caja de texto de área para que el contenido quepa tras un ancho y font dados. */
export function hugAreaTextHeight(obj: FreehandObject, width: number): number {
  const fontSize = getObjectFontSize(obj);
  const lineHeight = (obj as { lineHeight?: number }).lineHeight ?? 1.2;
  const pad = textForeignObjectPadPx("area", fontSize);
  const indent = (obj as { paragraphIndent?: number }).paragraphIndent ?? 0;
  const inner = Math.max(1, width - pad * 2 - indent);
  const text = textContentForReflow(obj);
  const lines = wrapWithCanvas(text, inner, obj) ?? wrapPlainTextToWidth(text, inner, fontSize);
  const lh = fontSize * lineHeight;
  return Math.max(lh + pad * 2, Math.ceil(lines * lh + pad * 2));
}
