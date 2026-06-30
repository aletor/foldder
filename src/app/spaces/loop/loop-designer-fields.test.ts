import { describe, expect, it } from "vitest";
import {
  designerHasDynamicFields,
  extractDesignerDynamicFields,
  pendingDesignerFields,
} from "./loop-designer-fields";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";

function boundText(id: string, name: string, fieldId: string): FreehandObject {
  return {
    id,
    name,
    type: "text",
    _designerDatasetBinding: {
      listId: "l1",
      listKey: "jugadores",
      fieldId,
      fieldKey: fieldId.replace("f_", ""),
    },
  } as unknown as FreehandObject;
}

function pendingText(id: string, name: string, slotLabel: string, slotId?: string): FreehandObject {
  return {
    id,
    name,
    type: "text",
    _designerDatasetBinding: {
      listId: "",
      listKey: "",
      fieldId: "",
      fieldKey: "",
      kind: "text",
      slotLabel,
      slotId,
    },
  } as unknown as FreehandObject;
}

function pendingImageFrame(
  id: string,
  name: string,
  slotLabel: string,
  slotId?: string,
): FreehandObject {
  return {
    id,
    name,
    type: "rect",
    isImageFrame: true,
    _designerDatasetBinding: {
      listId: "",
      listKey: "",
      fieldId: "",
      fieldKey: "",
      kind: "image",
      slotLabel,
      slotId,
    },
  } as unknown as FreehandObject;
}

function plainText(id: string): FreehandObject {
  return { id, name: "Estático", type: "text" } as unknown as FreehandObject;
}

/** Envuelve objetos "pegados dentro" de un clip (clippingContainer.content). */
function clip(id: string, content: FreehandObject[]): FreehandObject {
  return {
    id,
    name: "Clip",
    type: "clippingContainer",
    mask: { id: `${id}_mask`, type: "rect", x: 0, y: 0, width: 10, height: 10 },
    content,
  } as unknown as FreehandObject;
}

/** Agrupa objetos en un booleanGroup (children). */
function group(id: string, children: FreehandObject[]): FreehandObject {
  return { id, name: "Grupo", type: "booleanGroup", children } as unknown as FreehandObject;
}

function page(id: string, objects: FreehandObject[]): DesignerPageState {
  return { id, format: "a4v", objects } as unknown as DesignerPageState;
}

describe("extractDesignerDynamicFields", () => {
  it("campos bound deduplicados por columna", () => {
    const pages = [
      page("p1", [boundText("o1", "Nombre", "f_nombre"), plainText("o2")]),
      page("p2", [boundText("o3", "Nombre dorso", "f_nombre")]),
    ];
    const fields = extractDesignerDynamicFields(pages);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.status).toBe("bound");
    expect(fields[0]!.usageCount).toBe(2);
    expect(fields[0]!.fieldId).toBe("f_nombre");
    expect(fields[0]!.key).toBe("l1::f_nombre");
  });

  it("campos pending deduplicados por slotLabel (token-like)", () => {
    const pages = [
      page("p1", [pendingText("o1", "Nombre frente", "Nombre"), pendingImageFrame("o2", "Foto", "Foto")]),
      page("p2", [pendingText("o3", "Nombre dorso", "nombre")]), // misma etiqueta normalizada
    ];
    const fields = extractDesignerDynamicFields(pages);
    expect(fields).toHaveLength(2);

    const nombre = fields.find((f) => f.slotLabel === "Nombre")!;
    expect(nombre.status).toBe("pending");
    expect(nombre.kind).toBe("text");
    expect(nombre.usageCount).toBe(2);
    expect(nombre.key).toBe("slot::nombre::text");

    const foto = fields.find((f) => f.slotLabel === "Foto")!;
    expect(foto.status).toBe("pending");
    expect(foto.kind).toBe("image");
  });

  it("mezcla bound + pending", () => {
    const pages = [page("p1", [boundText("o1", "Nombre", "f_nombre"), pendingText("o2", "Equipo", "Equipo")])];
    const fields = extractDesignerDynamicFields(pages);
    expect(fields.map((f) => f.status).sort()).toEqual(["bound", "pending"]);
    expect(pendingDesignerFields(pages)).toHaveLength(1);
    expect(pendingDesignerFields(pages)[0]!.slotLabel).toBe("Equipo");
  });

  it("ignora objetos sin binding", () => {
    const pages = [page("p1", [plainText("o1")])];
    expect(extractDesignerDynamicFields(pages)).toHaveLength(0);
    expect(designerHasDynamicFields(pages)).toBe(false);
  });

  it("detecta presencia (bound o pending)", () => {
    expect(designerHasDynamicFields([page("p1", [pendingText("o1", "X", "X")])])).toBe(true);
    expect(designerHasDynamicFields([page("p1", [boundText("o1", "X", "f_x")])])).toBe(true);
  });

  it("mantiene orden de primera aparición", () => {
    const pages = [
      page("p1", [pendingImageFrame("o1", "Foto", "Foto"), pendingText("o2", "Nombre", "Nombre")]),
    ];
    expect(extractDesignerDynamicFields(pages).map((f) => f.slotLabel)).toEqual(["Foto", "Nombre"]);
  });

  it("mismo slotLabel en texto e imagen produce dos campos (jugador)", () => {
    const pages = [
      page("p1", [
        pendingText("o1", "Nombre", "jugador"),
        pendingImageFrame("o2", "Foto", "jugador"),
      ]),
    ];
    const fields = extractDesignerDynamicFields(pages);
    expect(fields).toHaveLength(2);
    expect(fields.map((f) => f.key).sort()).toEqual(["slot::jugador::image", "slot::jugador::text"]);
    expect(fields.every((f) => f.slotLabel === "jugador")).toBe(true);
  });

  it("detecta campos dinámicos anidados dentro de un clip (pegar dentro)", () => {
    const pages = [
      page("p1", [clip("clip1", [pendingText("o1", "Nombre", "Nombre")])]),
    ];
    const fields = extractDesignerDynamicFields(pages);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.status).toBe("pending");
    expect(fields[0]!.slotLabel).toBe("Nombre");
    expect(fields[0]!.key).toBe("slot::nombre::text");
    expect(designerHasDynamicFields(pages)).toBe(true);
    expect(pendingDesignerFields(pages)).toHaveLength(1);
  });

  it("detecta campos dinámicos anidados dentro de un grupo", () => {
    const pages = [
      page("p1", [group("g1", [boundText("o1", "Nombre", "f_nombre")])]),
    ];
    const fields = extractDesignerDynamicFields(pages);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.status).toBe("bound");
    expect(fields[0]!.fieldId).toBe("f_nombre");
  });

  it("expone slotId en campos pending y agrupa por slotLabel", () => {
    const pages = [
      page("p1", [
        pendingText("o1", "T", "jugador", "slot_shared"),
        pendingImageFrame("o2", "I", "jugador", "slot_shared"),
      ]),
    ];
    const fields = extractDesignerDynamicFields(pages);
    expect(fields.every((f) => f.slotId === "slot_shared")).toBe(true);
    expect(fields.map((f) => f.key).sort()).toEqual([
      "slot::jugador::image",
      "slot::jugador::text",
    ]);
  });
});
