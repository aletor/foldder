import { describe, expect, it } from "vitest";
import {
  deriveDesignerForm,
  freezeDesignerPagesForForm,
  resolveDesignerSlotValues,
  type DesignerFormModel,
} from "./populate-designer-form";
import type { DesignerDynamicField } from "./populate-designer-fields";
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
        schema: [{ id: "f_nombre", key: "nombre", label: "Nombre", type: "text", required: false }],
        cards: [
          { id: "c1", values: { f_nombre: { type: "text", value: "Messi" } } },
          { id: "c2", values: { f_nombre: { type: "text", value: "Cristiano" } } },
          { id: "c3", values: { f_nombre: { type: "text", value: "Messi" } } },
        ],
      },
    ],
    constants: { fields: [], values: {} },
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  };
}

function pendingField(slotLabel: string, kind: "text" | "image"): DesignerDynamicField {
  return {
    key: `slot::${slotLabel.toLowerCase()}`,
    status: "pending",
    kind,
    label: slotLabel,
    slotLabel,
    usageCount: 1,
  };
}

describe("deriveDesignerForm", () => {
  it("crea un campo por hueco pendiente y descarta los bound", () => {
    const fields: DesignerDynamicField[] = [
      pendingField("Nombre", "text"),
      pendingField("Foto", "image"),
      { key: "l1::f_nombre", status: "bound", kind: "text", label: "Nombre", usageCount: 1 },
    ];
    const model = deriveDesignerForm({ dynamicFields: fields, slideCount: 3 });
    expect(model.fields).toHaveLength(2);
    expect(model.slideCount).toBe(3);
    expect(model.empty).toBe(false);
    expect(model.fields[0]!.kind).toBe("text");
    expect(model.fields[1]!.kind).toBe("image");
  });

  it("rellena sugerencias de texto desde la columna mapeada (valores distintos)", () => {
    const model = deriveDesignerForm({
      dynamicFields: [pendingField("Nombre", "text")],
      slotBindings: {
        "slot::nombre": { listId: "l1", listKey: "jugadores", fieldId: "f_nombre", fieldKey: "nombre" },
      },
      dataset: dataset(),
      listId: "l1",
      slideCount: 1,
    });
    expect(model.fields[0]!.suggestions).toEqual(["Messi", "Cristiano"]);
  });

  it("marca empty cuando no hay huecos pendientes", () => {
    const model = deriveDesignerForm({ dynamicFields: [], slideCount: 2 });
    expect(model.empty).toBe(true);
  });
});

describe("resolveDesignerSlotValues", () => {
  it("resuelve texto e imagen seleccionada", () => {
    const model: DesignerFormModel = {
      slideCount: 1,
      empty: false,
      fields: [
        { slotKey: "slot::nombre", kind: "text", label: "Nombre", suggestions: [], imageOptions: [] },
        {
          slotKey: "slot::foto",
          kind: "image",
          label: "Foto",
          suggestions: [],
          imageOptions: [
            { value: "row:0", label: "Fila 1", url: "https://x/a.png", w: 200, h: 100 },
            { value: "row:1", label: "Fila 2", url: "https://x/b.png" },
          ],
        },
      ],
    };
    const out = resolveDesignerSlotValues({
      model,
      textValues: { "slot::nombre": "Iniesta" },
      imageSelections: { "slot::foto": "row:1" },
    });
    expect(out["slot::nombre"]).toEqual({ kind: "text", text: "Iniesta" });
    expect(out["slot::foto"]).toEqual({ kind: "image", url: "https://x/b.png", w: undefined, h: undefined });
  });

  it("omite campos de texto vacíos y selecciones inexistentes", () => {
    const model: DesignerFormModel = {
      slideCount: 1,
      empty: false,
      fields: [
        { slotKey: "slot::nombre", kind: "text", label: "Nombre", suggestions: [], imageOptions: [] },
      ],
    };
    const out = resolveDesignerSlotValues({ model, textValues: { "slot::nombre": "" }, imageSelections: {} });
    expect(Object.keys(out)).toHaveLength(0);
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
  return { id: "tpl_pending", slideKey: "slk_p", slideName: "Slide", format: "a4v", objects: [obj] } as unknown as DesignerPageState;
}

describe("freezeDesignerPagesForForm", () => {
  it("aplica el valor del formulario al hueco, elimina el binding y preserva slideKey", () => {
    const frozen = freezeDesignerPagesForForm([pendingTextPage("Nombre")], {
      "slot::nombre": { kind: "text", text: "Xavi" },
    });
    const page = frozen[0]!;
    expect(page.slideKey).toBe("slk_p");
    expect(page.id).not.toBe("tpl_pending");
    const obj = page.objects[0] as FreehandObject & { text?: string; _designerDatasetBinding?: unknown };
    expect(obj.text).toBe("Xavi");
    expect(obj._designerDatasetBinding).toBeUndefined();
  });

  it("sin valor, el hueco queda con el contenido de diseño y sin binding", () => {
    const frozen = freezeDesignerPagesForForm([pendingTextPage("Nombre")], {});
    const obj = frozen[0]!.objects[0] as FreehandObject & { text?: string; _designerDatasetBinding?: unknown };
    expect(obj.text).toBe("PLACEHOLDER");
    expect(obj._designerDatasetBinding).toBeUndefined();
  });

  it("no muta la plantilla original", () => {
    const tpl = pendingTextPage("Nombre");
    freezeDesignerPagesForForm([tpl], { "slot::nombre": { kind: "text", text: "Xavi" } });
    const obj = tpl.objects[0] as FreehandObject & { text?: string };
    expect(obj.text).toBe("PLACEHOLDER");
  });
});
