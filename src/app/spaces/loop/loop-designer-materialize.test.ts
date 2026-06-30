import { describe, expect, it } from "vitest";
import {
  buildDesignerGeneratedSubgraph,
  freezeDesignerPagesForRow,
  stripDatasetBindingsFromObject,
} from "./loop-designer-materialize";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";

function dataset(): Dataset {
  const ts = "2026-01-01T00:00:00.000Z";
  return {
    id: "ds1",
    name: "Equipo",
    scope: "local",
    lists: [
      {
        id: "l1",
        name: "Jugadores",
        key: "jugadores",
        schema: [
          { id: "f_nombre", key: "nombre", label: "Nombre", type: "text", required: false },
        ],
        cards: [
          { id: "c1", values: { f_nombre: { type: "text", value: "Messi" } } },
          { id: "c2", values: { f_nombre: { type: "text", value: "Cristiano" } } },
        ],
      },
    ],
    constants: { fields: [], values: {} },
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };
}

function boundTextObj(): FreehandObject {
  return {
    id: "o1",
    name: "Nombre",
    type: "text",
    text: "PLACEHOLDER",
    _designerDatasetBinding: {
      listId: "l1",
      listKey: "jugadores",
      fieldId: "f_nombre",
      fieldKey: "nombre",
    },
  } as unknown as FreehandObject;
}

function templatePage(): DesignerPageState {
  return {
    id: "tpl_page_1",
    slideKey: "slk_front",
    slideName: "Frente",
    format: "a4v",
    objects: [boundTextObj()],
  } as unknown as DesignerPageState;
}

describe("freezeDesignerPagesForRow", () => {
  it("resuelve el texto de la fila, elimina el binding y preserva slideKey/slideName", () => {
    const frozen = freezeDesignerPagesForRow([templatePage()], dataset(), 1);
    expect(frozen).toHaveLength(1);
    const page = frozen[0]!;

    // Identidad estable preservada desde la plantilla.
    expect(page.slideKey).toBe("slk_front");
    expect(page.slideName).toBe("Frente");
    // Fila fijada.
    expect(page.datasetRowIndex).toBe(1);
    // id de página regenerado (clon).
    expect(page.id).not.toBe("tpl_page_1");

    const obj = page.objects[0] as FreehandObject & { text?: string; _designerDatasetBinding?: unknown };
    // Texto congelado al valor de la fila 1 (Cristiano).
    expect(obj.text).toBe("Cristiano");
    // Binding eliminado (autónomo).
    expect(obj._designerDatasetBinding).toBeUndefined();
    // id de objeto regenerado.
    expect(obj.id).not.toBe("o1");
  });

  it("resuelve distinta fila por instancia", () => {
    const row0 = freezeDesignerPagesForRow([templatePage()], dataset(), 0);
    const obj = row0[0]!.objects[0] as FreehandObject & { text?: string };
    expect(obj.text).toBe("Messi");
  });

  it("no muta la plantilla original", () => {
    const tpl = templatePage();
    freezeDesignerPagesForRow([tpl], dataset(), 1);
    const obj = tpl.objects[0] as FreehandObject & { text?: string; _designerDatasetBinding?: unknown };
    expect(obj.text).toBe("PLACEHOLDER");
    expect(obj._designerDatasetBinding).toBeDefined();
  });
});

describe("stripDatasetBindingsFromObject", () => {
  it("elimina binding de contenido y de propiedad", () => {
    const obj = {
      id: "o1",
      name: "X",
      type: "text",
      _designerDatasetBinding: { listId: "l", listKey: "l", fieldId: "f", fieldKey: "f" },
      _designerDatasetPropertyBindings: { x: { propertyKey: "x", source: "list", fieldId: "f", fieldKey: "f" } },
    } as unknown as FreehandObject;
    const stripped = stripDatasetBindingsFromObject(obj) as FreehandObject & {
      _designerDatasetBinding?: unknown;
      _designerDatasetPropertyBindings?: unknown;
    };
    expect(stripped._designerDatasetBinding).toBeUndefined();
    expect(stripped._designerDatasetPropertyBindings).toBeUndefined();
  });
});

function pendingTextPage(slotLabel: string): DesignerPageState {
  const obj = {
    id: "po1",
    name: "Nombre",
    type: "text",
    text: "PLACEHOLDER",
    _designerDatasetBinding: { listId: "", listKey: "", fieldId: "", fieldKey: "", kind: "text", slotLabel },
  } as unknown as FreehandObject;
  return { id: "tpl_pending", slideKey: "slk_p", format: "a4v", objects: [obj] } as unknown as DesignerPageState;
}

describe("freezeDesignerPagesForRow (Modo 2 · huecos pendientes)", () => {
  it("resuelve el hueco pendiente con la columna mapeada por Loop", () => {
    const map = {
      "slot::nombre": { listId: "l1", listKey: "jugadores", fieldId: "f_nombre", fieldKey: "nombre" },
    };
    const frozen = freezeDesignerPagesForRow([pendingTextPage("Nombre")], dataset(), 1, map);
    const obj = frozen[0]!.objects[0] as FreehandObject & { text?: string; _designerDatasetBinding?: unknown };
    expect(obj.text).toBe("Cristiano");
    expect(obj._designerDatasetBinding).toBeUndefined();
  });

  it("sin mapeo, el hueco pendiente queda estático (texto de diseño) y sin binding", () => {
    const frozen = freezeDesignerPagesForRow([pendingTextPage("Nombre")], dataset(), 1);
    const obj = frozen[0]!.objects[0] as FreehandObject & { text?: string; _designerDatasetBinding?: unknown };
    expect(obj.text).toBe("PLACEHOLDER");
    expect(obj._designerDatasetBinding).toBeUndefined();
  });

  it("mapeo con clave que no coincide → estático", () => {
    const map = {
      "slot::otra": { listId: "l1", listKey: "jugadores", fieldId: "f_nombre", fieldKey: "nombre" },
    };
    const frozen = freezeDesignerPagesForRow([pendingTextPage("Nombre")], dataset(), 0, map);
    const obj = frozen[0]!.objects[0] as FreehandObject & { text?: string };
    expect(obj.text).toBe("PLACEHOLDER");
  });
});

function clipMaskRect(): FreehandObject {
  return {
    id: "mask1",
    name: "Máscara",
    type: "rect",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  } as unknown as FreehandObject;
}

/** Página con un objeto dinámico "pegado dentro" de un clip (clippingContainer.content). */
function clippedBoundTextPage(): DesignerPageState {
  const container = {
    id: "clip1",
    name: "Clip",
    type: "clippingContainer",
    mask: clipMaskRect(),
    content: [boundTextObj()],
  } as unknown as FreehandObject;
  return {
    id: "tpl_clip",
    slideKey: "slk_clip",
    slideName: "Clip",
    format: "a4v",
    objects: [container],
  } as unknown as DesignerPageState;
}

function clippedPendingTextPage(slotLabel: string): DesignerPageState {
  const inner = {
    id: "pclip1",
    name: "Nombre",
    type: "text",
    text: "PLACEHOLDER",
    _designerDatasetBinding: { listId: "", listKey: "", fieldId: "", fieldKey: "", kind: "text", slotLabel },
  } as unknown as FreehandObject;
  const container = {
    id: "clip2",
    name: "Clip",
    type: "clippingContainer",
    mask: clipMaskRect(),
    content: [inner],
  } as unknown as FreehandObject;
  return {
    id: "tpl_clip_pending",
    slideKey: "slk_clip_p",
    format: "a4v",
    objects: [container],
  } as unknown as DesignerPageState;
}

describe("freezeDesignerPagesForRow (objetos dentro de un clip / pegar dentro)", () => {
  it("Modo 1: resuelve el texto dinámico anidado en un clippingContainer", () => {
    const frozen = freezeDesignerPagesForRow([clippedBoundTextPage()], dataset(), 1);
    const container = frozen[0]!.objects[0] as FreehandObject & {
      content?: (FreehandObject & { text?: string; _designerDatasetBinding?: unknown })[];
    };
    const inner = container.content![0]!;
    expect(inner.text).toBe("Cristiano");
    expect(inner._designerDatasetBinding).toBeUndefined();
  });

  it("Modo 2: resuelve el hueco pendiente anidado con la columna mapeada", () => {
    const map = {
      "slot::nombre": { listId: "l1", listKey: "jugadores", fieldId: "f_nombre", fieldKey: "nombre" },
    };
    const frozen = freezeDesignerPagesForRow([clippedPendingTextPage("Nombre")], dataset(), 0, map);
    const container = frozen[0]!.objects[0] as FreehandObject & {
      content?: (FreehandObject & { text?: string; _designerDatasetBinding?: unknown })[];
    };
    const inner = container.content![0]!;
    expect(inner.text).toBe("Messi");
    expect(inner._designerDatasetBinding).toBeUndefined();
  });
});

describe("buildDesignerGeneratedSubgraph", () => {
  it("crea un nodo designer por fila, sin edges", () => {
    const rows = [
      { rowIndex: 0, cardId: "c1", pages: freezeDesignerPagesForRow([templatePage()], dataset(), 0) },
      { rowIndex: 1, cardId: "c2", pages: freezeDesignerPagesForRow([templatePage()], dataset(), 1) },
    ];
    const sub = buildDesignerGeneratedSubgraph("pop1", rows);
    expect(sub.edges).toHaveLength(0);
    expect(sub.nodes).toHaveLength(2);
    expect(sub.nodes[0]!.id).toBe("loop_pop1_r0_designer");
    expect(sub.nodes[0]!.type).toBe("designer");
    expect((sub.nodes[1]!.data as { _loopRowCardId?: string })._loopRowCardId).toBe("c2");
  });
});
