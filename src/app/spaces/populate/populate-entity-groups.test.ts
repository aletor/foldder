import { describe, expect, it } from "vitest";
import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import {
  groupPendingFieldsIntoEntities,
  normalizePopulateEntityId,
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
});

describe("normalizePopulateEntityId", () => {
  it("normaliza a minúsculas", () => {
    expect(normalizePopulateEntityId("Jugador")).toBe("jugador");
  });
});
