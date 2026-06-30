import { describe, expect, it } from "vitest";
import { buildPopulateSharePayload } from "./populate-share-payload";
import { syncPopulateTemplateBinding } from "./populate-designer-binding";
import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import type { PopulateTemplateBinding } from "./populate-types";

const dataset: Dataset = {
  id: "ds1",
  label: "DS",
  lists: [
    {
      id: "list1",
      key: "main",
      name: "Main",
      schema: [{ id: "f1", key: "name", label: "Name", type: "text" }],
      cards: [{ id: "c1", values: { f1: { type: "text", value: "Ana" } } }],
    },
  ],
};

const binding: PopulateTemplateBinding = {
  templateNodeId: "d1",
  templateLabel: "Hero",
  labelColumnFieldId: "f1",
  picks: [{ id: "pick1", label: "Personaje" }],
  sources: {},
  slotColumns: {},
};

describe("buildPopulateSharePayload", () => {
  it("builds multi-template share payload with rows snapshot", () => {
    const payload = buildPopulateSharePayload({
      title: "Form",
      dataset,
      listId: "list1",
      templates: [
        {
          templateNodeId: "d1",
          templateType: "designer",
          templateLabel: "Hero",
          pages: [{ id: "pg1", name: "1", layers: [] }],
          dynamicFields: [],
        },
      ],
      bindings: [binding],
    });
    expect(payload.templates).toHaveLength(1);
    expect(payload.rowsSnapshot).toHaveLength(1);
    expect(payload.rowsSnapshot[0]?.label).toBeTruthy();
    expect(payload.binding?.templateNodeId).toBe("d1");
  });

  it("incluye formModel con entidades agrupadas texto+imagen", () => {
    const dynamicFields: DesignerDynamicField[] = [
      {
        key: "slot::jugador::text",
        status: "pending",
        kind: "text",
        label: "jugador",
        slotLabel: "jugador",
        usageCount: 1,
      },
      {
        key: "slot::jugador::image",
        status: "pending",
        kind: "image",
        label: "jugador",
        slotLabel: "jugador",
        usageCount: 1,
      },
    ];

    const richDataset: Dataset = {
      id: "ds1",
      label: "DS",
      lists: [
        {
          id: "list1",
          key: "main",
          name: "Main",
          schema: [
            { id: "f_name", key: "name", label: "Name", type: "text" },
            { id: "f_photo", key: "photo", label: "Photo", type: "image" },
            { id: "f_pose", key: "pose", label: "Pose", type: "image" },
          ],
          cards: [
            {
              id: "c1",
              values: {
                f_name: { type: "text", value: "Ana" },
                f_photo: { type: "image", url: "https://x/a.png" },
                f_pose: { type: "image", url: "https://x/b.png" },
              },
            },
          ],
        },
      ],
    };

    const binding = syncPopulateTemplateBinding({
      prev: undefined,
      template: {
        templateNodeId: "d1",
        templateType: "designer",
        templateLabel: "Hero",
        pages: [{ id: "pg1", name: "1", layers: [] }],
        dynamicFields,
      },
      dataset: richDataset,
      listId: "list1",
    });

    const payload = buildPopulateSharePayload({
      title: "Form",
      dataset: richDataset,
      listId: "list1",
      templates: [
        {
          templateNodeId: "d1",
          templateType: "designer",
          templateLabel: "Hero",
          pages: [{ id: "pg1", name: "1", layers: [] }],
          dynamicFields,
        },
      ],
      bindings: [binding],
    });

    const formModel = payload.templates[0]?.formModel;
    expect(formModel?.entities).toHaveLength(1);
    expect(formModel?.entities[0]?.facets).toHaveLength(2);
    expect(payload.templates[0]?.formModel.entities[0]?.poseOptions.length).toBeGreaterThan(1);
  });

  it("incluye defaults congelados cuando se pasan sharePreviewsByTemplateId", () => {
    const payload = buildPopulateSharePayload({
      title: "Form",
      dataset,
      listId: "list1",
      templates: [
        {
          templateNodeId: "d1",
          templateType: "designer",
          templateLabel: "Hero",
          pages: [{ id: "pg1", name: "1", layers: [] }],
          dynamicFields: [],
        },
      ],
      bindings: [binding],
      sharePreviewsByTemplateId: {
        d1: {
          defaults: {
            pickedRows: { pick1: "c1" },
            pickedPoses: { jugador: "f_pose" },
            manualValues: { "slot::x": "txt" },
          },
          previewThumbUrl: "data:image/png;base64,abc",
          previewHeroUrl: "data:image/png;base64,abc",
        },
      },
    });
    expect(payload.templates[0]?.defaults?.pickedRows).toEqual({ pick1: "c1" });
    expect(payload.templates[0]?.previewThumbUrl).toContain("data:image");
  });
});
