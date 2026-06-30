import { describe, expect, it } from "vitest";
import { walkDesignerObjectTree } from "@/app/spaces/designer/designer-object-tree";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";

describe("walkDesignerObjectTree", () => {
  it("propaga carpeta contenedora a hijos y clips", () => {
    const folder = {
      id: "f1",
      type: "groupContainer",
      name: "Jugador1",
      children: [
        {
          id: "clip1",
          type: "clippingContainer",
          mask: { id: "m1", type: "rect", x: 0, y: 0, width: 10, height: 10 },
          content: [{ id: "t1", type: "text", name: "Nombre" }],
        },
      ],
    } as unknown as FreehandObject;

    const contexts: Array<{ id: string; folder?: string }> = [];
    walkDesignerObjectTree([folder], (obj, ctx) => {
      contexts.push({ id: obj.id, folder: ctx.folderLabel });
    });

    expect(contexts.find((c) => c.id === "t1")?.folder).toBe("Jugador1");
    expect(contexts.find((c) => c.id === "f1")?.folder).toBeUndefined();
  });
});
