import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { SiteCreatorPreview } from "./SiteCreatorPreview";

vi.mock("@/app/spaces/presenter/DesignerPageCanvasView", () => ({
  DesignerPageCanvasView: ({
    objects,
    pageWidth,
    pageHeight,
  }: {
    objects: FreehandObject[];
    pageWidth: number;
    pageHeight: number;
  }) => (
    <div
      data-testid="designer-page-canvas-view"
      data-object-count={objects.length}
      data-page-width={pageWidth}
      data-page-height={pageHeight}
    />
  ),
}));

vi.mock("@/app/spaces/designer/designer-page-text-frame-sync", () => ({
  collectDesignerPageFontFamilies: () => [],
}));

vi.mock("@/app/spaces/freehand/google-fonts-preview-loader", () => ({
  ensureGoogleFontPreviewBatchLoaded: async () => undefined,
}));

function fireNativePointer(
  type: "pointerdown" | "pointermove" | "pointerup",
  target: Element,
  init: { clientX?: number; clientY?: number; button?: number; pointerId?: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, {
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
    pointerId: init.pointerId ?? 1,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: () => {},
  });
  target.dispatchEvent(event);
}

describe("SiteCreatorPreview", () => {
  it("uses snapshot page data instead of live designer data", () => {
    const snapshotPage: DesignerPageState = {
      id: "snap_pg",
      format: "story916",
      customWidth: 540,
      customHeight: 960,
      objects: [
        { id: "snap_layer", type: "rect", x: 0, y: 0, width: 100, height: 50 } as FreehandObject,
      ],
    };

    const livePage: DesignerPageState = {
      id: "live_pg",
      format: "web169",
      objects: [
        { id: "live_layer", type: "rect", x: 0, y: 0, width: 10, height: 10 } as FreehandObject,
      ],
    };

    render(
      <SiteCreatorPreview
        page={snapshotPage}
        viewportWidth={540}
        referenceWidth={540}
        previewZoom={1}
      />,
    );

    const canvas = screen.getByTestId("designer-page-canvas-view");
    expect(canvas.getAttribute("data-object-count")).toBe("1");
    expect(canvas.getAttribute("data-page-width")).toBe("540");
    expect(canvas.getAttribute("data-page-height")).toBe("960");

    expect(livePage.objects[0]!.id).toBe("live_layer");
    expect(snapshotPage.objects[0]!.id).toBe("snap_layer");
  });

  it("click on dark preview chrome clears selection", () => {
    const snapshotPage: DesignerPageState = {
      id: "snap_pg",
      format: "web169",
      customWidth: 400,
      customHeight: 300,
      objects: [],
    };
    const onSelectionAction = vi.fn();

    render(
      <SiteCreatorPreview
        page={snapshotPage}
        viewportWidth={400}
        referenceWidth={400}
        previewZoom={0.5}
        selection={{ selectedIds: ["x"], hoverId: null, isolationIds: [], overlapCycle: null }}
        selectionIndex={{ entries: [], byId: {} }}
        onSelectionAction={onSelectionAction}
      />,
    );

    const scroll = document.querySelector(".site-creator-preview-scroll");
    expect(scroll).toBeTruthy();
    fireNativePointer("pointerdown", scroll!, { clientX: 12, clientY: 12, button: 0, pointerId: 1 });
    fireNativePointer("pointerup", scroll!, { clientX: 12, clientY: 12, button: 0, pointerId: 1 });
    expect(onSelectionAction).toHaveBeenCalledWith({
      type: "click",
      layerId: null,
      additive: false,
    });
  });

  it("click on canvas selection surface selects a layer", () => {
    const snapshotPage: DesignerPageState = {
      id: "snap_pg",
      format: "web169",
      customWidth: 400,
      customHeight: 300,
      objects: [
        { id: "layer_a", type: "rect", x: 20, y: 20, width: 40, height: 40 } as FreehandObject,
      ],
    };
    const onSelectionAction = vi.fn();
    const selectionIndex = buildSiteSelectionIndex(snapshotPage);
    const pageLeft = 120;
    const pageTop = 96;
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("site-creator-preview-page")) {
        return {
          left: pageLeft,
          top: pageTop,
          width: 400,
          height: 300,
          right: pageLeft + 400,
          bottom: pageTop + 300,
          x: pageLeft,
          y: pageTop,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    render(
      <SiteCreatorPreview
        page={snapshotPage}
        viewportWidth={400}
        referenceWidth={400}
        previewZoom={1}
        selection={{ selectedIds: [], hoverId: null, isolationIds: [], overlapCycle: null }}
        selectionIndex={selectionIndex}
        onSelectionAction={onSelectionAction}
      />,
    );

    const svg = document.querySelector(".site-creator-selection-surface svg");
    expect(svg).toBeTruthy();
    const clientX = pageLeft + 30;
    const clientY = pageTop + 30;
    fireNativePointer("pointerdown", svg!, { clientX, clientY, button: 0, pointerId: 3 });
    fireNativePointer("pointerup", svg!, { clientX, clientY, button: 0, pointerId: 3 });

    rectSpy.mockRestore();

    expect(onSelectionAction).toHaveBeenCalledWith({
      type: "click",
      layerId: "layer_a",
      additive: false,
    });
  });

  it("double click on dark preview chrome triggers fit callback", () => {
    const snapshotPage: DesignerPageState = {
      id: "snap_pg",
      format: "web169",
      customWidth: 400,
      customHeight: 300,
      objects: [],
    };
    const onCanvasBackgroundDoubleClick = vi.fn();

    render(
      <SiteCreatorPreview
        page={snapshotPage}
        viewportWidth={400}
        referenceWidth={400}
        previewZoom={0.5}
        onCanvasBackgroundDoubleClick={onCanvasBackgroundDoubleClick}
      />,
    );

    const scroll = document.querySelector(".site-creator-preview-scroll");
    expect(scroll).toBeTruthy();
    fireEvent.dblClick(scroll!);
    expect(onCanvasBackgroundDoubleClick).toHaveBeenCalledTimes(1);
  });

  it("marquee from dark preview chrome selects intersecting layers", () => {
    const snapshotPage: DesignerPageState = {
      id: "snap_pg",
      format: "web169",
      customWidth: 400,
      customHeight: 300,
      objects: [
        { id: "layer_a", type: "rect", x: 10, y: 10, width: 40, height: 40 } as FreehandObject,
      ],
    };
    const onSelectionAction = vi.fn();
    const selectionIndex = buildSiteSelectionIndex(snapshotPage);
    const pageLeft = 120;
    const pageTop = 96;
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("site-creator-preview-page")) {
        return {
          left: pageLeft,
          top: pageTop,
          width: 400,
          height: 300,
          right: pageLeft + 400,
          bottom: pageTop + 300,
          x: pageLeft,
          y: pageTop,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    render(
      <SiteCreatorPreview
        page={snapshotPage}
        viewportWidth={400}
        referenceWidth={400}
        previewZoom={1}
        selection={{ selectedIds: [], hoverId: null, isolationIds: [], overlapCycle: null }}
        selectionIndex={selectionIndex}
        onSelectionAction={onSelectionAction}
      />,
    );

    const scroll = document.querySelector(".site-creator-preview-scroll")!;
    const startX = pageLeft - 40;
    const startY = pageTop - 40;
    const endX = pageLeft + 30;
    const endY = pageTop + 30;

    fireNativePointer("pointerdown", scroll, {
      clientX: startX,
      clientY: startY,
      button: 0,
      pointerId: 2,
    });
    fireNativePointer("pointermove", scroll, {
      clientX: endX,
      clientY: endY,
      button: 0,
      pointerId: 2,
    });
    fireNativePointer("pointerup", scroll, {
      clientX: endX,
      clientY: endY,
      button: 0,
      pointerId: 2,
    });

    rectSpy.mockRestore();

    expect(onSelectionAction).toHaveBeenCalledWith({
      type: "marquee",
      layerIds: ["layer_a"],
      additive: false,
    });
  });

  it("device frame uses internal scroll", () => {
    const snapshotPage: DesignerPageState = {
      id: "snap_pg",
      format: "web169",
      customWidth: 390,
      customHeight: 2000,
      objects: [],
    };

    render(
      <SiteCreatorPreview
        page={snapshotPage}
        viewportWidth={390}
        referenceWidth={1920}
        previewZoom={1}
        deviceFrame={{ width: 390, height: 844 }}
      />,
    );

    expect(screen.getByTestId("site-creator-device-scroll")).toBeTruthy();
    const stage = screen.getByTestId("site-creator-preview-stage");
    expect(stage.getAttribute("style")).toContain("width: 390px");
    expect(stage.getAttribute("style")).toContain("height: 844px");
  });

  it("readOnly hides selection, resize handles and does not dispatch clicks", () => {
    const snapshotPage: DesignerPageState = {
      id: "snap_pg",
      format: "web169",
      customWidth: 400,
      customHeight: 300,
      objects: [
        { id: "layer_a", type: "rect", x: 20, y: 20, width: 40, height: 40 } as FreehandObject,
      ],
    };
    const onSelectionAction = vi.fn();
    const selectionIndex = buildSiteSelectionIndex(snapshotPage);

    render(
      <SiteCreatorPreview
        page={snapshotPage}
        viewportWidth={400}
        referenceWidth={400}
        previewZoom={1}
        readOnly
        selection={{ selectedIds: ["layer_a"], hoverId: null, isolationIds: [], overlapCycle: null }}
        selectionIndex={selectionIndex}
        onSelectionAction={onSelectionAction}
      />,
    );

    expect(screen.queryByTestId("site-creator-resize-left")).toBeNull();
    expect(screen.queryByTestId("site-creator-resize-right")).toBeNull();
    expect(document.querySelector("[data-site-creator-page-preview='1']")).toBeTruthy();
    const scroll = document.querySelector(".site-creator-preview-scroll");
    expect(scroll).toBeTruthy();
    fireNativePointer("pointerdown", scroll!, { clientX: 12, clientY: 12, button: 0, pointerId: 1 });
    fireNativePointer("pointerup", scroll!, { clientX: 12, clientY: 12, button: 0, pointerId: 1 });
    expect(onSelectionAction).not.toHaveBeenCalled();
    const stage = screen.getByTestId("site-creator-preview-stage");
    expect(stage.getAttribute("style")).toContain("width: 100%");
  });
});
