import { describe, expect, it } from "vitest";
import { designerPagesSnapshotForDeExport, duplicateDesignerPageState } from "./designer-studio-pure";
import type { DesignerPageState } from "./DesignerNode";

describe("duplicateDesignerPageState", () => {
  it("remaps effect targets and groupContainer children when cloning a page", () => {
    const folderId = "folder-old";
    const textId = "text-old";
    const page: DesignerPageState = {
      id: "page-old",
      objects: [
        {
          id: folderId,
          type: "groupContainer",
          name: "jugador1",
          x: 0,
          y: 0,
          width: 200,
          height: 300,
          visible: true,
          children: [
            {
              id: textId,
              type: "text",
              x: 10,
              y: 20,
              width: 100,
              height: 40,
              visible: true,
              text: "Nombre",
              fontFamily: "Arial",
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: 0,
              textAlign: "left",
              textMode: "point",
              fill: { type: "solid", color: "#fff" },
              stroke: "none",
              strokeWidth: 0,
              opacity: 1,
            } as import("../FreehandStudio").FreehandObject,
          ],
        } as import("../FreehandStudio").FreehandObject,
        {
          id: "fx-folder-old",
          type: "adjustmentLayer",
          name: "Fx carpeta",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          visible: true,
          effectScope: "selectedFolder",
          effectTargetFolderId: folderId,
          adjustment: { brightness: 0, contrast: 0, saturation: 0, levels: { black: 0, white: 255, gamma: 1 } },
          layerEffects: {
            dropShadow: { enabled: true, color: "#000", opacity: 0.5, angle: 90, distance: 8, size: 12, spread: 0, blendMode: "normal" },
          },
        } as import("../FreehandStudio").FreehandObject,
        {
          id: "fx-layer-old",
          type: "adjustmentLayer",
          name: "Fx capa",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          visible: true,
          effectScope: "selectedLayer",
          effectTargetLayerId: textId,
          adjustment: { brightness: 0, contrast: 0, saturation: 0, levels: { black: 0, white: 255, gamma: 1 } },
        } as import("../FreehandStudio").FreehandObject,
      ],
    };

    const dup = duplicateDesignerPageState(page);
    const folder = dup.objects?.find((o) => o.type === "groupContainer");
    const folderFx = dup.objects?.find((o) => o.id.startsWith("fx-folder") || o.name === "Fx carpeta");
    const layerFx = dup.objects?.find((o) => o.name === "Fx capa");
    const nestedText = folder && folder.type === "groupContainer" ? folder.children[0] : undefined;

    expect(dup.id).not.toBe(page.id);
    expect(folder?.id).not.toBe(folderId);
    expect(nestedText?.id).not.toBe(textId);
    expect(folderFx && "effectTargetFolderId" in folderFx ? folderFx.effectTargetFolderId : undefined).toBe(folder?.id);
    expect(layerFx && "effectTargetLayerId" in layerFx ? layerFx.effectTargetLayerId : undefined).toBe(nestedText?.id);
  });
});

describe("designerPagesSnapshotForDeExport", () => {
  it("fusiona objetos vivos de la página activa antes de exportar", () => {
    const pages: DesignerPageState[] = [
      {
        id: "p1",
        format: "web169",
        objects: [{ id: "old", type: "text", text: "stale" } as never],
      },
    ];
    const live = [{ id: "brush-layer", type: "image", src: "data:image/png;base64,abc" } as never];
    const snap = designerPagesSnapshotForDeExport(pages, 0, live);
    expect(snap[0]?.objects[0]?.id).toBe("brush-layer");
  });
});
