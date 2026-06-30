import { describe, expect, it } from "vitest";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import {
  collectPopulateEntityPickTargets,
  populateEntityAtCanvasPoint,
} from "./populate-studio-entity-pick";

describe("collectPopulateEntityPickTargets", () => {
  it("detecta carpetas con nombre como entidades clicables", () => {
    const folder = {
      id: "fold_j1",
      type: "groupContainer",
      name: "Jugador1",
      x: 40,
      y: 60,
      width: 200,
      height: 280,
      children: [
        {
          id: "t1",
          type: "text",
          x: 50,
          y: 80,
          width: 120,
          height: 24,
          text: "Nombre",
          _designerDatasetBinding: {
            listId: "",
            listKey: "",
            fieldId: "",
            fieldKey: "",
            kind: "text",
            slotLabel: "nombre",
          },
        },
      ],
    } as unknown as FreehandObject;

    const labels = new Map([["jugador1", "Jugador1"], ["jugador2", "Jugador2"]]);
    const targets = collectPopulateEntityPickTargets([folder], labels);

    expect(targets).toHaveLength(1);
    expect(targets[0]!.entityId).toBe("jugador1");
    expect(targets[0]!.objectId).toBe("fold_j1");
    expect(targets[0]!.bounds.width).toBeGreaterThan(0);
  });

  it("devuelve la entidad más arriba bajo el cursor", () => {
    const targets = [
      {
        entityId: "a",
        label: "A",
        objectId: "o1",
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        zOrder: 1,
      },
      {
        entityId: "b",
        label: "B",
        objectId: "o2",
        bounds: { x: 20, y: 20, width: 100, height: 100 },
        zOrder: 2,
      },
    ];
    expect(populateEntityAtCanvasPoint(targets, 30, 30)?.entityId).toBe("b");
    expect(populateEntityAtCanvasPoint(targets, 5, 5)?.entityId).toBe("a");
    expect(populateEntityAtCanvasPoint(targets, 500, 500)).toBeNull();
  });
});
