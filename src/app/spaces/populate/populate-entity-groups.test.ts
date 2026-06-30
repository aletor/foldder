import { describe, expect, it } from "vitest";
import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import {
  facetQualifiedLabel,
  findSchemaColumnForSlotLabel,
  groupPendingFieldsIntoEntities,
  normalizePopulateEntityId,
  textLikeColumnsInSchema,
} from "./populate-entity-groups";
import { syncPopulateTemplateBinding } from "./populate-designer-binding";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";

function field(
  key: string,
  kind: "text" | "image",
  slotLabel: string,
): DesignerDynamicField {
  return {
    key,
    status: "pending",
    kind,
    label: slotLabel,
    slotLabel,
    usageCount: 1,
  };
}

describe("groupPendingFieldsIntoEntities", () => {
  it("agrupa texto e imagen con mismo slotLabel en una entidad", () => {
    const groups = groupPendingFieldsIntoEntities([
      field("slot::jugador::text", "text", "jugador"),
      field("slot::jugador::image", "image", "jugador"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entityId).toBe("jugador");
    expect(groups[0]!.facets).toHaveLength(2);
  });

  it("agrupa varios textos dentro de la misma carpeta", () => {
    const folderField = (
      key: string,
      kind: "text" | "image",
      slotLabel: string,
      folderLabel: string,
      folderEntityId: string,
    ): DesignerDynamicField => ({
      key,
      status: "pending",
      kind,
      label: slotLabel,
      slotLabel,
      folderLabel,
      folderEntityId,
      usageCount: 1,
    });

    const groups = groupPendingFieldsIntoEntities([
      folderField("folder::jugador1::slot::nombre::text", "text", "nombre", "Jugador1", "jugador1"),
      folderField("folder::jugador1::slot::dorsal::text", "text", "dorsal", "Jugador1", "jugador1"),
      folderField("folder::jugador1::slot::foto::image", "image", "foto", "Jugador1", "jugador1"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entityId).toBe("jugador1");
    expect(groups[0]!.label).toBe("Jugador1");
    expect(groups[0]!.facets).toHaveLength(3);
  });

  it("separa entidades por carpeta aunque el slotLabel se repita", () => {
    const folderField = (
      key: string,
      slotLabel: string,
      folderLabel: string,
      folderEntityId: string,
    ): DesignerDynamicField => ({
      key,
      status: "pending",
      kind: "text",
      label: slotLabel,
      slotLabel,
      folderLabel,
      folderEntityId,
      usageCount: 1,
    });

    const groups = groupPendingFieldsIntoEntities([
      folderField("folder::jugador1::slot::nombre::text", "nombre", "Jugador1", "jugador1"),
      folderField("folder::jugador2::slot::nombre::text", "nombre", "Jugador2", "jugador2"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.entityId).sort()).toEqual(["jugador1", "jugador2"]);
  });

  it("separa entidades distintas", () => {
    const groups = groupPendingFieldsIntoEntities([
      field("slot::jugador::text", "text", "jugador"),
      field("slot::equipo::text", "text", "equipo"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("agrupa facets con el mismo slotLabel aunque el slotId interno difiera", () => {
    const textField: DesignerDynamicField = {
      ...field("slot::jugador::text", "text", "jugador"),
      slotId: "slot_a",
    };
    const imageField: DesignerDynamicField = {
      ...field("slot::jugador::image", "image", "jugador"),
      slotId: "slot_b",
    };
    const groups = groupPendingFieldsIntoEntities([textField, imageField]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entityId).toBe("jugador");
  });
});

describe("syncPopulateTemplateBinding", () => {
  const dataset: Dataset = {
    id: "ds",
    label: "DS",
    lists: [
      {
        id: "list1",
        key: "main",
        name: "Jugadores",
        schema: [
          { id: "f_name", key: "name", label: "Nombre", type: "text" },
          { id: "f_photo", key: "photo", label: "Foto", type: "image" },
          { id: "f_pose", key: "pose_side", label: "Pose lateral", type: "image" },
        ],
        cards: [
          {
            id: "c1",
            values: {
              f_name: { type: "text", value: "Messi" },
              f_photo: { type: "image", url: "https://x/front.png" },
              f_pose: { type: "image", url: "https://x/side.png" },
            },
          },
        ],
      },
    ],
  };

  it("crea un pick compartido y columnas auto para texto e imagen", () => {
    const binding = syncPopulateTemplateBinding({
      prev: undefined,
      template: {
        templateNodeId: "d1",
        templateType: "designer",
        templateLabel: "Card",
        pages: [],
        dynamicFields: [
          field("slot::jugador::text", "text", "jugador"),
          field("slot::jugador::image", "image", "jugador"),
        ],
      },
      dataset,
      listId: "list1",
    });

    expect(binding.picks).toHaveLength(1);
    expect(binding.picks[0]!.entityId).toBe("jugador");
    expect(binding.sources["slot::jugador::text"]?.pickId).toBe(binding.picks[0]!.id);
    expect(binding.sources["slot::jugador::image"]?.pickId).toBe(binding.picks[0]!.id);
    expect(binding.slotColumns["slot::jugador::text"]?.fieldId).toBe("f_name");
    expect(binding.entityPoseColumnFieldId?.jugador).toBeTruthy();
  });

  it("en carpeta: varios textos con nombres del schema y un pick por carpeta", () => {
    const datasetWithDorsal: Dataset = {
      ...dataset,
      lists: [
        {
          ...dataset.lists[0]!,
          schema: [
            { id: "f_name", key: "nombre", label: "Nombre", type: "text" },
            { id: "f_number", key: "dorsal", label: "Dorsal", type: "text" },
            { id: "f_photo", key: "foto", label: "Foto", type: "image" },
            { id: "f_pose", key: "pose_side", label: "Pose lateral", type: "image" },
          ],
        },
      ],
    };

    const folderFields: DesignerDynamicField[] = [
      {
        key: "folder::jugador1::slot::nombre::text",
        status: "pending",
        kind: "text",
        label: "nombre",
        slotLabel: "nombre",
        folderLabel: "Jugador1",
        folderEntityId: "jugador1",
        usageCount: 1,
      },
      {
        key: "folder::jugador1::slot::dorsal::text",
        status: "pending",
        kind: "text",
        label: "dorsal",
        slotLabel: "dorsal",
        folderLabel: "Jugador1",
        folderEntityId: "jugador1",
        usageCount: 1,
      },
      {
        key: "folder::jugador1::slot::foto::image",
        status: "pending",
        kind: "image",
        label: "foto",
        slotLabel: "foto",
        folderLabel: "Jugador1",
        folderEntityId: "jugador1",
        usageCount: 1,
      },
    ];

    const binding = syncPopulateTemplateBinding({
      prev: undefined,
      template: {
        templateNodeId: "d1",
        templateType: "designer",
        templateLabel: "Card",
        pages: [],
        dynamicFields: folderFields,
      },
      dataset: datasetWithDorsal,
      listId: "list1",
    });

    expect(binding.picks).toHaveLength(1);
    expect(binding.picks[0]!.entityId).toBe("jugador1");
    expect(binding.picks[0]!.label).toBe("Jugador1");
    expect(binding.slotColumns["folder::jugador1::slot::nombre::text"]?.fieldId).toBe("f_name");
    expect(binding.slotColumns["folder::jugador1::slot::dorsal::text"]?.fieldId).toBe("f_number");
    expect(binding.slotColumns["folder::jugador1::slot::foto::image"]?.fieldId).toBe("f_photo");
    expect(binding.entityPoseColumnFieldId?.jugador1).toBeUndefined();
  });
});

describe("facetQualifiedLabel", () => {
  it("usa carpeta.slot cuando hay carpeta", () => {
    const groups = groupPendingFieldsIntoEntities([
      {
        key: "folder::jugador1::slot::nombre::text",
        status: "pending",
        kind: "text",
        label: "nombre",
        slotLabel: "nombre",
        folderLabel: "Jugador1",
        folderEntityId: "jugador1",
        usageCount: 1,
      },
    ]);
    const g = groups[0]!;
    expect(facetQualifiedLabel(g, g.facets[0]!)).toBe("Jugador1.nombre");
  });
});

describe("normalizePopulateEntityId", () => {
  it("normaliza a minúsculas", () => {
    expect(normalizePopulateEntityId("Jugador")).toBe("jugador");
  });
});

describe("findSchemaColumnForSlotLabel", () => {
  const schema = [
    { id: "f_nombre", key: "nombre", label: "Nombre", type: "text" as const },
    { id: "f_dorsal", key: "dorsal", label: "Dorsal", type: "number" as const },
    { id: "f_foto", key: "foto", label: "Foto", type: "image" as const },
  ];

  it("empareja por key o label normalizado", () => {
    expect(findSchemaColumnForSlotLabel(schema, "Nombre", "text")?.id).toBe("f_nombre");
    expect(findSchemaColumnForSlotLabel(schema, "dorsal", "text")?.id).toBe("f_dorsal");
    expect(findSchemaColumnForSlotLabel(schema, "Foto", "image")?.id).toBe("f_foto");
  });
});

describe("textLikeColumnsInSchema", () => {
  it("incluye text y number para huecos de texto", () => {
    const cols = textLikeColumnsInSchema([
      { id: "a", key: "a", label: "A", type: "text", required: false },
      { id: "b", key: "b", label: "B", type: "number", required: false },
      { id: "c", key: "c", label: "C", type: "image", required: false },
    ]);
    expect(cols.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
