import { describe, expect, it } from "vitest";
import {
  buildPopulateShareDefaults,
  defaultPickedRowsForPopulateForm,
  resolvePopulateShareDefaults,
} from "./populate-share-defaults";
import { syncPopulateTemplateBinding } from "./populate-designer-binding";
import type { DesignerDynamicField } from "@/app/spaces/loop/loop-designer-fields";
import { derivePopulateForm } from "./populate-designer-form";

const dynamicFields: DesignerDynamicField[] = [
  {
    key: "slot::jugador::text",
    status: "pending",
    kind: "text",
    label: "jugador",
    slotLabel: "jugador",
    usageCount: 1,
  },
];

const dataset: Dataset = {
  id: "ds1",
  label: "DS",
  lists: [
    {
      id: "list1",
      key: "main",
      name: "Main",
      schema: [{ id: "f_name", key: "name", label: "Name", type: "text" }],
      cards: [
        { id: "c1", values: { f_name: { type: "text", value: "Ana" } } },
        { id: "c2", values: { f_name: { type: "text", value: "Bob" } } },
      ],
    },
  ],
};

const template = {
  templateNodeId: "d1",
  templateType: "designer" as const,
  templateLabel: "Hero",
  pages: [{ id: "pg1", name: "1", layers: [] }],
  dynamicFields,
};

describe("populate-share-defaults", () => {
  it("defaultPickedRowsForPopulateForm picks first card per entity", () => {
    const binding = syncPopulateTemplateBinding({
      prev: undefined,
      template,
      dataset,
      listId: "list1",
    });
    const rows = defaultPickedRowsForPopulateForm(binding, template, dataset, "list1");
    expect(Object.values(rows)).toContain("c1");
  });

  it("buildPopulateShareDefaults uses studio preview when flagged", () => {
    const binding = syncPopulateTemplateBinding({
      prev: undefined,
      template,
      dataset,
      listId: "list1",
    });
    const defaults = buildPopulateShareDefaults({
      binding,
      template,
      dataset,
      listId: "list1",
      useStudioPreview: true,
      studioPreview: {
        pickedRows: { pick_x: "c2" },
        pickedPoses: {},
        manualValues: { "slot::x": "Hola" },
      },
    });
    expect(defaults.pickedRows).toEqual({ pick_x: "c2" });
    expect(defaults.manualValues).toEqual({ "slot::x": "Hola" });
  });

  it("resolvePopulateShareDefaults falls back from formModel for legacy shares", () => {
    const binding = syncPopulateTemplateBinding({
      prev: undefined,
      template,
      dataset,
      listId: "list1",
    });
    const formModel = derivePopulateForm({
      binding,
      dynamicFields,
      dataset,
      listId: "list1",
      slideCount: 1,
    });
    const resolved = resolvePopulateShareDefaults({
      templateNodeId: "d1",
      templateLabel: "Hero",
      binding,
      formModel,
      pages: template.pages,
      slideCount: 1,
    });
    expect(Object.values(resolved.pickedRows).length).toBeGreaterThan(0);
  });
});
