/**
 * Motor de layout: una sola superficie Canvas 2D para medir.
 * Las mismas propiedades de fuente deben usarse al pintar en Fabric (mismo font string).
 */

import type { Story, TextFrame, Typography, StoryNode } from "./text-model";
import { plainTextToStoryNodes, serializeStoryContent } from "./text-model";

export type LineData = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
};

export type FrameLayout = {
  frameId: string;
  storyId: string;
  lines: LineData[];
  hasOverflow: boolean;
  /** Rango en serializeStoryContent(story.content) asignado a este frame. */
  contentRange: { start: number; end: number };
};

/** Canvas dedicado al layout (mismo motor que se documenta para preview 2D). */
let layoutCanvas: HTMLCanvasElement | null = null;

export function getLayoutCanvasContext(): CanvasRenderingContext2D {
  if (typeof document === "undefined") {
    throw new Error("text-layout requires browser DOM");
  }
  if (!layoutCanvas) layoutCanvas = document.createElement("canvas");
  const ctx = layoutCanvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return ctx;
}

export function fontStringFromTypography(t: Typography): string {
  const style = t.fontStyle === "italic" ? "italic " : "";
  return `${style}${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
}

function measureLineWidth(ctx: CanvasRenderingContext2D, line: string, typo: Typography): number {
  if (!line.length) return 0;
  const extra = typo.letterSpacing * typo.fontSize;
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    w += ctx.measureText(line[i]!).width + (i < line.length - 1 ? extra : 0);
  }
  return w;
}

function nextLineFrom(
  text: string,
  start: number,
  maxW: number,
  ctx: CanvasRenderingContext2D,
  typo: Typography,
): { line: string; next: number } {
  if (start >= text.length) return { line: "", next: start };
  if (text[start] === "\n") return { line: "", next: start + 1 };

  let end = start;
  let line = "";
  while (end < text.length) {
    const ch = text[end]!;
    if (ch === "\n") break;
    const trial = line + ch;
    if (measureLineWidth(ctx, trial, typo) <= maxW) {
      line = trial;
      end++;
    } else {
      if (line.length > 0) {
        const trimmed = line.replace(/\s+$/u, "");
        const back = line.length - (trimmed || line).length;
        return { line: trimmed || line, next: end - back };
      }
      return { line: ch, next: end + 1 };
    }
  }
  return { line, next: end + (text[end] === "\n" ? 1 : 0) };
}

/**
 * Ajusta texto al rectángulo interior; devuelve líneas con posiciones locales (origen arriba-izquierda del frame).
 */
export function layoutTextInFrame(
  text: string,
  frame: TextFrame,
  typo: Typography,
  ctx: CanvasRenderingContext2D,
): { lines: LineData[]; consumedChars: number; hasOverflow: boolean } {
  ctx.font = fontStringFromTypography(typo);
  const pad = frame.padding;
  const innerW = Math.max(4, frame.width - pad * 2);
  const innerH = Math.max(4, frame.height - pad * 2);
  const lineHeightPx = typo.fontSize * typo.lineHeight;
  const maxLines = Math.max(1, Math.floor(innerH / lineHeightPx));

  const lines: LineData[] = [];
  let pos = 0;
  while (lines.length < maxLines && pos <= text.length) {
    if (pos === text.length) break;
    const { line, next } = nextLineFrom(text, pos, innerW, ctx, typo);
    if (next === pos && pos < text.length) break;
    let x = pad;
    const w = measureLineWidth(ctx, line, typo);
    if (typo.align === "center") x = pad + (innerW - w) / 2;
    else if (typo.align === "right") x = pad + innerW - w;
    else if (typo.align === "justify" && lines.length < maxLines - 1 && line.includes(" ")) {
      x = pad;
    }
    lines.push({
      text: line,
      x,
      y: pad + lines.length * lineHeightPx,
      fontSize: typo.fontSize,
    });
    pos = next;
  }

  const consumed = pos;
  const hasOverflow = consumed < text.length;
  return {
    lines,
    consumedChars: consumed,
    hasOverflow,
  };
}

export function layoutStory(
  story: Story,
  frameById: Map<string, TextFrame>,
): FrameLayout[] {
  const stream = serializeStoryContent(story.content);
  const ctx = getLayoutCanvasContext();
  ctx.font = fontStringFromTypography(story.typography);

  const out: FrameLayout[] = [];
  let cursor = 0;

  for (const frameId of story.frames) {
    const fr = frameById.get(frameId);
    if (!fr || fr.storyId !== story.id) continue;
    const remaining = stream.slice(cursor);
    const { lines, consumedChars, hasOverflow } = layoutTextInFrame(
      remaining,
      fr,
      story.typography,
      ctx,
    );
    const start = cursor;
    const end = cursor + consumedChars;
    cursor = end;
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

/** Parchea el contenido serializado sustituyendo [start,end) por newText. */
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
