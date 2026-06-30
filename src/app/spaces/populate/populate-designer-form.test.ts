import { describe, expect, it } from "vitest";
import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { syncPopulateTemplateBinding } from "./populate-designer-binding";
import {
  derivePopulateForm,
  resolvePopulateSlotValues,
  resolvePopulateSlotValuesFromSnapshot,
  resolvePublicPopulateEntities,
  type PopulateFormModel,
} from "./populate-designer-form";
import { freezeDesignerPagesForForm } from "@/app/spaces/loop/loop-designer-form";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { PopulateTemplateBinding } from "./populate-types";

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

const dataset: Dataset = {
  id: "ds",
  label: "DS",
  lists: [
    {
      id: "list1",
      key: "players",
      name: "Jugadores",
      schema: [
        { id: "f_name", key: "name", label: "Nombre", type: "text" },
        { id: "f_front", key: "photo_front", label: "Frontal", type: "image" },
        { id: "f_side", key: "photo_side", label: "Lateral", type: "image" },
      ],
      cards: [
        {
          id: "c_messi",
          values: {
            f_name: { type: "text", value: "Messi" },
            f_front: { type: "image", url: "https://cdn/front.png" },
            f_side: { type: "image", url: "https://cdn/side.png" },
          },
        },
        {
          id: "c_ronaldo",
          values: {
            f_name: { type: "text", value: "Ronaldo" },
            f_front: { type: "image", url: "https://cdn/r7-front.png" },
            f_side: { type: "image", url: "https://cdn/r7-side.png" },
          },
        },
      ],
    },
  ],
};

const dynamicFields = [
  field("slot::jugador::text", "text", "jugador"),
  field("slot::jugador::image", "image", "jugador"),
];

function makeBinding(poseFieldId?: string): PopulateTemplateBinding {
  const prev: PopulateTemplateBinding | undefined = poseFieldId
    ? {
        templateNodeId: "d1",
        templateLabel: "Card",
        labelColumnFieldId: "f_name",
        picks: [],
        sources: {},
        slotColumns: {},
        entityPoseColumnFieldId: { jugador: poseFieldId },
      }
    : undefined;

  return syncPopulateTemplateBinding({
    prev,
    template: {
      templateNodeId: "d1",
      templateType: "designer",
      templateLabel: "Card",
      pages: [],
      dynamicFields,
    },
    dataset,
    listId: "list1",
  });
}

describe("derivePopulateForm", () => {
  it("expone una entidad con texto e imagen y opciones de pose", () => {
    const binding = makeBinding("f_front");
    const form = derivePopulateForm({
      binding,
      dynamicFields,
      dataset,
      listId: "list1",
      slideCount: 1,
    });

    expect(form.entities).toHaveLength(1);
    expect(form.entities[0]!.entityId).toBe("jugador");
    expect(form.entities[0]!.facets).toHaveLength(2);
    expect(form.entities[0]!.poseOptions.length).toBeGreaterThan(1);
    expect(form.entities[0]!.poseFieldId).toBe("f_front");
    expect(form.entities[0]!.options).toHaveLength(2);
    expect(form.picks).toHaveLength(1);
    expect(form.picks[0]!.id).toBe(form.entities[0]!.pickId);
  });
});

describe("resolvePopulateSlotValues", () => {
  it("resuelve texto e imagen del mismo cardId", () => {
    const binding = makeBinding("f_front");
    const pickId = binding.picks[0]!.id;
    const resolved = resolvePopulateSlotValues({
      binding,
      dataset,
      listId: "list1",
      pickedRows: { [pickId]: "c_messi" },
      manualValues: {},
    });

    expect(resolved["slot::jugador::text"]).toEqual({ kind: "text", text: "Messi" });
    expect(resolved["slot::jugador::image"]).toEqual({
      kind: "image",
      url: "https://cdn/front.png",
    });
  });

  it("usa pickedPoses para cambiar la columna imagen", () => {
    const binding = makeBinding("f_front");
    const pickId = binding.picks[0]!.id;
    const resolved = resolvePopulateSlotValues({
      binding,
      dataset,
      listId: "list1",
      pickedRows: { [pickId]: "c_messi" },
      manualValues: {},
      pickedPoses: { jugador: "f_side" },
    });

    expect(resolved["slot::jugador::image"]).toEqual({
      kind: "image",
      url: "https://cdn/side.png",
    });
  });

  it("congela la plantilla con claves slot::entidad::kind", () => {
    const binding = makeBinding("f_front");
    const pickId = binding.picks[0]!.id;
    const resolved = resolvePopulateSlotValues({
      binding,
      dataset,
      listId: "list1",
      pickedRows: { [pickId]: "c_messi" },
      manualValues: {},
    });
    const page: DesignerPageState = {
      id: "p1",
      slideKey: "slk",
      slideName: "Slide",
      format: "a4v",
      objects: [
        {
          id: "t1",
          type: "text",
          text: "HOLA",
          _designerDatasetBinding: {
            listId: "",
            listKey: "",
            fieldId: "",
            fieldKey: "",
            kind: "text",
            slotLabel: "jugador",
          },
        } as unknown as FreehandObject,
        {
          id: "i1",
          type: "rect",
          isImageFrame: true,
          width: 200,
          height: 200,
          _designerDatasetBinding: {
            listId: "",
            listKey: "",
            fieldId: "",
            fieldKey: "",
            kind: "image",
            slotLabel: "jugador",
          },
        } as unknown as FreehandObject,
      ],
    } as unknown as DesignerPageState;

    const frozen = freezeDesignerPagesForForm([page], resolved);
    const textObj = frozen[0]!.objects[0] as FreehandObject & { text?: string };
    const frame = frozen[0]!.objects[1] as FreehandObject & {
      imageFrameContent?: { src?: string };
    };
    expect(textObj.text).toBe("Messi");
    expect(frame.imageFrameContent?.src).toBe("https://cdn/front.png");
  });

  it("aplica valores manuales", () => {
    const binding = makeBinding();
    binding.sources["slot::extra::text"] = { kind: "manual" };
    const resolved = resolvePopulateSlotValues({
      binding,
      dataset,
      listId: "list1",
      pickedRows: {},
      manualValues: { "slot::extra::text": "Manual" },
    });
    expect(resolved["slot::extra::text"]).toEqual({ kind: "text", text: "Manual" });
  });
});

describe("resolvePopulateSlotValuesFromSnapshot", () => {
  const rowsSnapshot = (dataset.lists[0]?.cards ?? []).map((card) => ({
    cardId: card.id,
    values: card.values,
  }));

  it("resuelve desde snapshot con pose elegida", () => {
    const binding = makeBinding("f_front");
    const pickId = binding.picks[0]!.id;
    const resolved = resolvePopulateSlotValuesFromSnapshot({
      binding,
      listId: "list1",
      rowsSnapshot,
      pickedRows: { [pickId]: "c_messi" },
      manualValues: {},
      pickedPoses: { jugador: "f_side" },
    });

    expect(resolved["slot::jugador::text"]).toEqual({ kind: "text", text: "Messi" });
    expect(resolved["slot::jugador::image"]).toEqual({
      kind: "image",
      url: "https://cdn/side.png",
    });
  });
});

describe("legacy formModel compat", () => {
  it("resolvePopulateSlotValuesFromSnapshot funciona con picks sin entityId", () => {
    const binding: PopulateTemplateBinding = {
      templateNodeId: "d1",
      templateLabel: "Legacy",
      labelColumnFieldId: "f_name",
      picks: [{ id: "pick_legacy", label: "Jugador" }],
      sources: {
        "slot::jugador::text": {
          kind: "dataset",
          pickId: "pick_legacy",
          columnFieldId: "f_name",
        },
        "slot::jugador::image": {
          kind: "dataset",
          pickId: "pick_legacy",
          columnFieldId: "f_front",
        },
      },
      slotColumns: {},
    };

    const resolved = resolvePopulateSlotValuesFromSnapshot({
      binding,
      listId: "list1",
      rowsSnapshot: [
        {
          cardId: "c_messi",
          values: dataset.lists[0]!.cards[0]!.values,
        },
      ],
      pickedRows: { pick_legacy: "c_messi" },
      manualValues: {},
    });

    expect(resolved["slot::jugador::text"]).toEqual({ kind: "text", text: "Messi" });
    expect(resolved["slot::jugador::image"]?.kind).toBe("image");
  });

  it("formModel legacy sin entities sigue teniendo picks utilizables", () => {
    const legacyForm: PopulateFormModel = {
      entities: [],
      picks: [
        {
          id: "pick_legacy",
          label: "Jugador",
          options: [{ cardId: "c_messi", label: "Messi" }],
        },
      ],
      fields: [
        {
          slotKey: "slot::jugador::text",
          kind: "text",
          label: "jugador",
          sourceKind: "dataset",
          pickId: "pick_legacy",
        },
        {
          slotKey: "slot::jugador::image",
          kind: "image",
          label: "jugador",
          sourceKind: "dataset",
          pickId: "pick_legacy",
        },
      ],
      slideCount: 1,
      empty: false,
    };

    const entities = resolvePublicPopulateEntities(legacyForm);

    expect(entities).toHaveLength(1);
    expect(entities[0]!.facets).toHaveLength(2);
  });
});
