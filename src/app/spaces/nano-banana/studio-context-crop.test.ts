import { describe, expect, it } from "vitest";
import { cropCardsToRect, planStudioContextCrop } from "./studio-context-crop";
import { createStudioCard, emptyStudioGlobal, type StudioCard } from "./studio-types";

const FRAME = { width: 2048, height: 1536 };

/** Lazo rectangular con 24 puntos (isValidClosedLasso exige ≥20 puntos y caja ≥30 px). */
function rectLasso(x1: number, y1: number, x2: number, y2: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) pts.push([x1 + ((x2 - x1) * i) / 6, y1]);
  for (let i = 0; i < 6; i++) pts.push([x2, y1 + ((y2 - y1) * i) / 6]);
  for (let i = 0; i < 6; i++) pts.push([x2 - ((x2 - x1) * i) / 6, y2]);
  for (let i = 0; i < 6; i++) pts.push([x1, y2 - ((y2 - y1) * i) / 6]);
  return pts;
}

function cardWithLasso(points: Array<[number, number]>, description = "cambiar"): StudioCard {
  return {
    ...createStudioCard(0),
    description,
    lassoPoints: points.map(([x, y]) => ({ x, y })),
  };
}

describe("planStudioContextCrop", () => {
  it("zona pequeña ⇒ recorte con la relación de aspecto del fotograma, centrado y dentro de la imagen", () => {
    const card = cardWithLasso(rectLasso(1500, 400, 1560, 480));
    const crop = planStudioContextCrop({ cards: [card], global: emptyStudioGlobal(), frame: FRAME });
    expect(crop).not.toBeNull();
    if (!crop) return;
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(FRAME.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(FRAME.height);
    expect(Math.abs(crop.width / crop.height - FRAME.width / FRAME.height)).toBeLessThan(0.02);
    // El lazo queda dentro del recorte.
    expect(crop.x).toBeLessThan(1500);
    expect(crop.y).toBeLessThan(400);
    expect(crop.x + crop.width).toBeGreaterThan(1560);
    expect(crop.y + crop.height).toBeGreaterThan(480);
    // Recorte sensiblemente menor que el fotograma.
    expect(crop.width * crop.height).toBeLessThan(FRAME.width * FRAME.height * 0.5);
  });

  it("zona grande, texto global, esquema o card sin lazo ⇒ sin recorte", () => {
    const big = cardWithLasso(rectLasso(100, 100, 1900, 1400));
    expect(planStudioContextCrop({ cards: [big], global: emptyStudioGlobal(), frame: FRAME })).toBeNull();

    const small = cardWithLasso(rectLasso(1500, 400, 1560, 480));
    expect(planStudioContextCrop({ cards: [small], global: { ...emptyStudioGlobal(), text: "más luz" }, frame: FRAME })).toBeNull();
    expect(planStudioContextCrop({ cards: [small], global: { ...emptyStudioGlobal(), schemaData: "data:image/png;base64,AA" }, frame: FRAME })).toBeNull();

    const noLasso: StudioCard = { ...createStudioCard(1), description: "algo", paintData: "data:image/png;base64,AA" };
    expect(planStudioContextCrop({ cards: [small, noLasso], global: emptyStudioGlobal(), frame: FRAME })).toBeNull();
  });

  it("varias zonas pequeñas cercanas ⇒ un recorte que las cubre todas; lejanas ⇒ ninguno", () => {
    const a = cardWithLasso(rectLasso(300, 300, 360, 360));
    const b = cardWithLasso(rectLasso(500, 500, 560, 560));
    const crop = planStudioContextCrop({ cards: [a, b], global: emptyStudioGlobal(), frame: FRAME });
    expect(crop).not.toBeNull();
    if (crop) {
      expect(crop.x).toBeLessThanOrEqual(300);
      expect(crop.x + crop.width).toBeGreaterThanOrEqual(560);
    }
    const far = cardWithLasso(rectLasso(1900, 1400, 1960, 1460));
    expect(planStudioContextCrop({ cards: [a, far], global: emptyStudioGlobal(), frame: FRAME })).toBeNull();
  });
});

describe("cropCardsToRect", () => {
  it("traslada los lazos al origen del recorte y los acota a sus límites", () => {
    const card = cardWithLasso(rectLasso(1500, 400, 1560, 480));
    const [out] = cropCardsToRect([card], { x: 1400, y: 350, width: 400, height: 300 });
    expect(out!.lassoPoints[0]).toEqual({ x: 100, y: 50 });
    expect(out!.lassoPoints[6]).toEqual({ x: 160, y: 50 });
    expect(out!.lassoPoints.every((p) => p.x >= 0 && p.x <= 400 && p.y >= 0 && p.y <= 300)).toBe(true);
    expect(out!.references).toEqual(card.references);
  });
});
