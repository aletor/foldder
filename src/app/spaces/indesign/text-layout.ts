/**
 * Rich text layout engine: measures styled runs (SpanNode with overrides)
 * and distributes them across TextFrames with word-wrapping.
 */

import type { Story, TextFrame, Typography, StoryNode, SpanStyle, FlatRun } from "./text-model";
import { flattenStoryContent, serializeStoryContent, plainTextToStoryNodes } from "./text-model";

/** A single styled piece of text on one line, with position. */
export type RichLineRun = {
  text: string;
  x: number;
  y: number;
  style?: SpanStyle;
};

export type LineData = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  runs?: RichLineRun[];
};

export type FrameLayout = {
  frameId: string;
  storyId: string;
  lines: LineData[];
  hasOverflow: boolean;
  contentRange: { start: number; end: number };
};

let layoutCanvas: HTMLCanvasElement | null = null;

/**
 * Pequeño margen sobre el ancho útil: el canvas y el DOM no coinciden al 100 % tras medir por subcadenas.
 */
/**
 * Small tolerance over available width. Keep near 1 to avoid premature wraps.
 */
const LINE_WRAP_WIDTH_FUDGE = 1.008;

/**
 * Si `innerH / lineHeight` queda justo por debajo de un entero, conviene acercar el recuento al `line-height` CSS.
 */
const LINE_COUNT_VERTICAL_BIAS = 0.42;

export function getLayoutCanvasContext(): CanvasRenderingContext2D {
  if (typeof document === "undefined") {
    throw new Error("text-layout requires browser DOM");
  }
  if (!layoutCanvas) layoutCanvas = document.createElement("canvas");
  const ctx = layoutCanvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return ctx;
}

export function normalizeFontWeightCss(w: string | number | undefined): string {
  if (typeof w === "number" && Number.isFinite(w)) return String(Math.round(w));
  const s = String(w ?? "400").trim().toLowerCase();
  if (s === "bold") return "700";
  if (s === "normal") return "400";
  if (/^\d+$/.test(s)) return s;
  return "400";
}

export function fontStringFromTypography(t: Typography): string {
  const style = t.fontStyle === "italic" ? "italic " : "";
  const caps = t.fontVariantCaps === "small-caps" ? "small-caps " : "";
  const weight = normalizeFontWeightCss(t.fontWeight);
  return `${caps}${style}${weight} ${t.fontSize}px ${t.fontFamily}`;
}

function resolveRunTypo(base: Typography, style?: SpanStyle): Typography {
  if (!style) return base;
  return {
    ...base,
    ...(style.fontWeight != null ? { fontWeight: style.fontWeight } : {}),
    ...(style.fontStyle != null ? { fontStyle: style.fontStyle } : {}),
    ...(style.fontSize != null ? { fontSize: style.fontSize } : {}),
    ...(style.color != null ? { color: style.color } : {}),
    ...(style.fontFamily != null ? { fontFamily: style.fontFamily } : {}),
    ...(style.letterSpacing != null ? { letterSpacing: style.letterSpacing } : {}),
  };
}

function measureText(ctx: CanvasRenderingContext2D, text: string, typo: Typography): number {
  if (!text.length) return 0;
  ctx.font = fontStringFromTypography(typo);
  // `letterSpacing` in our model is already in px (same as CSS letter-spacing numeric in React style).
  const extra = typo.letterSpacing;
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += ctx.measureText(text[i]!).width + (i < text.length - 1 ? extra : 0);
  }
  return w;
}

/** Misma tipografía resuelta → mismo trazo para agrupar y usar `measureText` sobre la subcadena (kerning). */
function resolvedTypoEqualForMeasure(a: Typography, b: Typography): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.letterSpacing === b.letterSpacing &&
    a.fontVariantCaps === b.fontVariantCaps
  );
}

/**
 * Ancho de la línea [from, to) igual que el bucle antiguo (espaciado antes de cada carácter tras el primero),
 * pero en tramos de **misma** tipografía usa `measureText(segmento)` para acercarse al shaping del navegador.
 */
function measureLineCharRange(
  ctx: CanvasRenderingContext2D,
  chars: { ch: string; style?: SpanStyle }[],
  from: number,
  to: number,
  baseTypo: Typography,
): number {
  if (from >= to) return 0;
  let w = 0;
  let k = from;
  while (k < to) {
    if (k > from) {
      const tGap = resolveRunTypo(baseTypo, chars[k]!.style);
      w += tGap.letterSpacing;
    }
    const t0 = resolveRunTypo(baseTypo, chars[k]!.style);
    ctx.font = fontStringFromTypography(t0);
    const extra0 = t0.letterSpacing;
    let j = k + 1;
    while (j < to && resolvedTypoEqualForMeasure(resolveRunTypo(baseTypo, chars[j]!.style), t0)) {
      j++;
    }
    const seg = chars
      .slice(k, j)
      .map((c) => c.ch)
      .join("");
    w += ctx.measureText(seg).width;
    if (seg.length > 1) {
      w += extra0 * (seg.length - 1);
    }
    k = j;
  }
  return w;
}

/**
 * Width for line-break decisions only (style-invariant):
 * inline styles (bold/italic/strike/underline) must not reflow text across lines/frames.
 */
function measureLineBreakRange(
  ctx: CanvasRenderingContext2D,
  chars: { ch: string; style?: SpanStyle }[],
  from: number,
  to: number,
  baseTypo: Typography,
): number {
  if (from >= to) return 0;
  const text = chars
    .slice(from, to)
    .map((c) => c.ch)
    .join("");
  return measureText(ctx, text, baseTypo);
}

/**
 * Layout rich text runs into a single TextFrame.
 * Returns lines with positioned styled runs, consumed character count, and overflow flag.
 */
export function layoutRichTextInFrame(
  runs: FlatRun[],
  frame: TextFrame,
  baseTypo: Typography,
  ctx: CanvasRenderingContext2D,
): { lines: LineData[]; consumedChars: number; hasOverflow: boolean } {
  const pad = frame.padding;
  const innerW = Math.max(4, frame.width - pad * 2);
  const innerH = Math.max(4, frame.height - pad * 2);
  const lineHeightPx = baseTypo.fontSize * baseTypo.lineHeight;
  const lineSlots = innerH / lineHeightPx;
  const maxLines = Math.max(1, Math.floor(lineSlots + LINE_COUNT_VERTICAL_BIAS));

  const lines: LineData[] = [];
  let totalConsumed = 0;

  // Flatten all runs into a single character stream with styles
  type CharInfo = { ch: string; style?: SpanStyle };
  const chars: CharInfo[] = [];
  for (const run of runs) {
    for (const ch of run.text) {
      chars.push({ ch, style: run.style });
    }
  }

  let charIdx = 0;

  while (lines.length < maxLines && charIdx < chars.length) {
    // Check for newline
    if (chars[charIdx]!.ch === "\n") {
      lines.push({ text: "", x: pad, y: pad + lines.length * lineHeightPx, fontSize: baseTypo.fontSize, runs: [] });
      charIdx++;
      totalConsumed = charIdx;
      continue;
    }

    const atParagraphStart = charIdx === 0 || (charIdx > 0 && chars[charIdx - 1]!.ch === "\n");
    const ind = atParagraphStart ? baseTypo.paragraphIndent : 0;
    const wrapW = Math.max(4, (innerW - ind) * LINE_WRAP_WIDTH_FUDGE);

    // Una línea: ampliar hasta que el ancho medido (kerning por tramos) supere wrapW
    let lineEnd = charIdx;
    let lastWordBreak = -1;

    while (lineEnd < chars.length) {
      const c = chars[lineEnd]!;
      if (c.ch === "\n") break;

      const candidateEnd = lineEnd + 1;
      const w = measureLineBreakRange(ctx, chars, charIdx, candidateEnd, baseTypo);

      if (w > wrapW && lineEnd > charIdx) {
        if (lastWordBreak > charIdx) {
          lineEnd = lastWordBreak;
        }
        break;
      }

      if (c.ch === " ") lastWordBreak = lineEnd + 1;
      lineEnd = candidateEnd;
    }

    if (lineEnd === charIdx && charIdx < chars.length) {
      // Force at least one character per line
      lineEnd = charIdx + 1;
    }

    // Build styled runs for this line
    const lineRuns: RichLineRun[] = [];
    let runX = pad + ind;
    let currentStyle: SpanStyle | undefined = chars[charIdx]?.style;
    let runText = "";
    const lineText = chars.slice(charIdx, lineEnd).map(c => c.ch).join("");

    for (let ci = charIdx; ci < lineEnd; ci++) {
      const c = chars[ci]!;
      const sameStyle = spanStylesEqual(currentStyle, c.style);
      if (!sameStyle && runText.length > 0) {
        const rTypo = resolveRunTypo(baseTypo, currentStyle);
        const w = measureText(ctx, runText, rTypo);
        lineRuns.push({ text: runText, x: runX, y: pad + lines.length * lineHeightPx, style: currentStyle });
        runX += w;
        runText = "";
        currentStyle = c.style;
      }
      runText += c.ch;
      if (!sameStyle) currentStyle = c.style;
    }
    if (runText.length > 0) {
      lineRuns.push({ text: runText, x: runX, y: pad + lines.length * lineHeightPx, style: currentStyle });
    }

    // Apply alignment
    const totalLineW = (() => {
      let w = 0;
      for (const lr of lineRuns) {
        w += measureText(ctx, lr.text, resolveRunTypo(baseTypo, lr.style));
      }
      return w;
    })();

    let offsetX = 0;
    if (baseTypo.align === "center") offsetX = (innerW - ind - totalLineW) / 2;
    else if (baseTypo.align === "right") offsetX = innerW - ind - totalLineW;

    if (offsetX !== 0) {
      for (const lr of lineRuns) lr.x += offsetX;
    }

    lines.push({
      text: lineText,
      x: pad + ind + offsetX,
      y: pad + lines.length * lineHeightPx,
      fontSize: baseTypo.fontSize,
      runs: lineRuns,
    });

    charIdx = lineEnd;
    // Skip trailing space at line break
    if (charIdx < chars.length && chars[charIdx]!.ch === " " && lineEnd < chars.length) {
      charIdx++;
    }
    totalConsumed = charIdx;
  }

  const hasOverflow = totalConsumed < chars.length;
  return { lines, consumedChars: totalConsumed, hasOverflow };
}

/** Backward-compatible: layout with uniform typography (no runs). */
export function layoutTextInFrame(
  text: string,
  frame: TextFrame,
  typo: Typography,
  ctx: CanvasRenderingContext2D,
): { lines: LineData[]; consumedChars: number; hasOverflow: boolean } {
  const runs: FlatRun[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      runs.push({ text: "\n" });
    } else {
      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun.text !== "\n") {
        lastRun.text += text[i];
      } else {
        runs.push({ text: text[i]! });
      }
    }
  }
  return layoutRichTextInFrame(runs, frame, typo, ctx);
}

export function layoutStory(
  story: Story,
  frameById: Map<string, TextFrame>,
): FrameLayout[] {
  const flatRuns = flattenStoryContent(story.content);
  const stream = serializeStoryContent(story.content);
  const ctx = getLayoutCanvasContext();

  const out: FrameLayout[] = [];
  let cursor = 0;
  let runIdx = 0;
  let runCharIdx = 0;

  for (const frameId of story.frames) {
    const fr = frameById.get(frameId);
    if (!fr || fr.storyId !== story.id) continue;

    // Build remaining runs from current position
    const remainingRuns: FlatRun[] = [];
    let ri = runIdx;
    let rci = runCharIdx;
    while (ri < flatRuns.length) {
      const run = flatRuns[ri]!;
      if (rci > 0) {
        remainingRuns.push({ text: run.text.slice(rci), style: run.style });
        ri++;
        rci = 0;
      } else {
        remainingRuns.push({ text: run.text, style: run.style });
        ri++;
      }
    }

    const { lines, consumedChars, hasOverflow } = layoutRichTextInFrame(
      remainingRuns,
      fr,
      story.typography,
      ctx,
    );

    const start = cursor;
    const end = cursor + consumedChars;
    cursor = end;

    // Advance run position
    let charsToSkip = consumedChars;
    while (charsToSkip > 0 && runIdx < flatRuns.length) {
      const run = flatRuns[runIdx]!;
      const avail = run.text.length - runCharIdx;
      if (charsToSkip >= avail) {
        charsToSkip -= avail;
        runIdx++;
        runCharIdx = 0;
      } else {
        runCharIdx += charsToSkip;
        charsToSkip = 0;
      }
    }

    out.push({
      frameId: fr.id,
      storyId: story.id,
      lines,
      hasOverflow,
      contentRange: { start, end },
    });
  }

  const trailing = stream.length - cursor;
  if (out.length > 0 && trailing > 0) {
    const last = out[out.length - 1]!;
    out[out.length - 1] = { ...last, hasOverflow: true };
  }

  return out;
}

export function layoutPageStories(
  stories: Story[],
  textFrames: TextFrame[],
): FrameLayout[] {
  const byId = new Map(textFrames.map((f) => [f.id, f]));
  const all: FrameLayout[] = [];
  for (const s of stories) {
    all.push(...layoutStory(s, byId));
  }
  return all;
}

export function patchSerializedContent(
  nodes: StoryNode[],
  start: number,
  end: number,
  newText: string,
): StoryNode[] {
  const stream = serializeStoryContent(nodes);
  const next = stream.slice(0, start) + newText + stream.slice(end);
  return plainTextToStoryNodes(next);
}

function spanStylesEqual(a?: SpanStyle, b?: SpanStyle): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.textUnderline === b.textUnderline &&
    a.textStrikethrough === b.textStrikethrough &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.fontFamily === b.fontFamily &&
    a.letterSpacing === b.letterSpacing
  );
}
