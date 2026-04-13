/**
 * Fabric solo pinta líneas ya calculadas: FabricText por línea + Rect transparente para selección/mover.
 * editable: false — el texto no vive en Fabric.
 */

import type {
  Canvas as FabricCanvas,
  FabricObject,
  FabricText as FabricTextType,
  Rect as FabricRect,
} from "fabric";
import type { Group as FabricGroup } from "fabric";
import { isFabricActiveSelection } from "./fabric-active-selection";
import type { FrameLayout } from "./text-layout";
import type { Story, TextFrame } from "./text-model";

export type TextFrameFabricRegistry = Map<
  string,
  {
    hit: FabricRect;
    lineTexts: FabricTextType[];
  }
>;

/** Mientras Fabric escala/mueve el rect, no pisar geometría desde el modelo (evita controles desfasados). */
function transformTarget(canvas: FabricCanvas): FabricObject | undefined {
  const t = (canvas as unknown as { _currentTransform?: { target: unknown } })._currentTransform?.target;
  return t as FabricObject | undefined;
}

/** Incluye arrastre/escala de un solo marco o de una selección múltiple (ActiveSelection). */
function isTransformingTextHit(canvas: FabricCanvas, hit: FabricRect): boolean {
  const t = transformTarget(canvas);
  if (!t) return false;
  if (t === hit) return true;
  if (isFabricActiveSelection(t)) {
    return (t as FabricGroup).getObjects().includes(hit);
  }
  return false;
}

function typoToLineProps(story: Story) {
  const t = story.typography;
  return {
    fontSize: t.fontSize,
    fontFamily: t.fontFamily,
    fill: t.color,
    fontWeight: t.fontWeight,
    fontStyle: t.fontStyle,
    lineHeight: t.lineHeight,
    charSpacing: t.letterSpacing * t.fontSize,
    originX: "left" as const,
    originY: "top" as const,
    selectable: false,
    evented: false,
    editable: false,
  };
}

export function syncLayoutsToFabric(
  canvas: FabricCanvas,
  fabric: typeof import("fabric"),
  layouts: FrameLayout[],
  stories: Story[],
  textFrames: TextFrame[],
  registry: TextFrameFabricRegistry,
): void {
  const { FabricText, Rect } = fabric;
  const storyById = new Map(stories.map((s) => [s.id, s]));
  const frameById = new Map(textFrames.map((f) => [f.id, f]));

  const seen = new Set<string>();

  for (const lay of layouts) {
    const story = storyById.get(lay.storyId);
    const fr = frameById.get(lay.frameId);
    if (!story || !fr) continue;
    seen.add(lay.frameId);
    const base = typoToLineProps(story);

    let entry = registry.get(lay.frameId);
    if (!entry) {
      const hit = new Rect({
        left: fr.x,
        top: fr.y,
        width: Math.max(24, fr.width),
        height: Math.max(24, fr.height),
        scaleX: 1,
        scaleY: 1,
        fill: "rgba(0,0,0,0.001)",
        stroke: "rgba(100,116,139,0.35)",
        strokeWidth: 1,
        strokeDashArray: [4, 3],
        originX: "left",
        originY: "top",
        selectable: true,
        evented: true,
        hasControls: true,
        lockScalingFlip: true,
        lockScalingX: false,
        lockScalingY: false,
        centeredScaling: false,
        borderScaleFactor: 2,
        cornerSize: 10,
        transparentCorners: false,
        indesignType: "textFrameHit",
        frameId: fr.id,
        storyId: story.id,
      });
      canvas.add(hit);
      entry = { hit, lineTexts: [] };
      registry.set(lay.frameId, entry);
    } else if (!isTransformingTextHit(canvas, entry.hit)) {
      entry.hit.set({
        left: fr.x,
        top: fr.y,
        width: Math.max(24, fr.width),
        height: Math.max(24, fr.height),
        scaleX: 1,
        scaleY: 1,
      });
    }

    const { hit, lineTexts } = entry;
    const transforming = isTransformingTextHit(canvas, hit);
    const ox = transforming ? (hit.left ?? fr.x) : fr.x;
    const oy = transforming ? (hit.top ?? fr.y) : fr.y;
    const want = lay.lines.length;

    while (lineTexts.length < want) {
      const tx = new FabricText("", {
        ...base,
        indesignType: "textLine",
        frameId: fr.id,
        lineIndex: lineTexts.length,
      } as Record<string, unknown>);
      canvas.add(tx);
      lineTexts.push(tx);
    }
    while (lineTexts.length > want) {
      const tx = lineTexts.pop()!;
      canvas.remove(tx);
    }

    for (let i = 0; i < want; i++) {
      const ld = lay.lines[i]!;
      const tx = lineTexts[i]!;
      tx.set({
        ...base,
        text: ld.text,
        left: ox + ld.x,
        top: oy + ld.y,
        fontSize: ld.fontSize,
        lineIndex: i,
        frameId: fr.id,
      } as Record<string, unknown>);
    }

    hit.setCoords();
  }

  for (const id of [...registry.keys()]) {
    if (!seen.has(id)) {
      const ent = registry.get(id);
      if (ent) {
        canvas.remove(ent.hit);
        for (const t of ent.lineTexts) canvas.remove(t);
      }
      registry.delete(id);
    }
  }

  canvas.requestRenderAll();
}

export function removeAllTextFrameFabric(canvas: FabricCanvas, registry: TextFrameFabricRegistry) {
  for (const ent of registry.values()) {
    canvas.remove(ent.hit);
    for (const t of ent.lineTexts) canvas.remove(t);
  }
  registry.clear();
}
