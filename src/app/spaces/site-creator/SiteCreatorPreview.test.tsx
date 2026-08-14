import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DesignerPageState } from "@/app/spaces/designer/DesignerNode";
import type { FreehandObject } from "@/app/spaces/FreehandStudio";
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
        selection={{ selectedIds: ["x"], hoverId: null, isolationIds: [], cycleState: null }}
        selectionIndex={{ entries: [], byId: {} }}
        onSelectionAction={onSelectionAction}
      />,
    );

    const scroll = document.querySelector(".site-creator-preview-scroll");
    expect(scroll).toBeTruthy();
    fireEvent.click(scroll!);
    expect(onSelectionAction).toHaveBeenCalledWith({ type: "clear" });
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
    fireEvent.doubleClick(scroll!);
    expect(onCanvasBackgroundDoubleClick).toHaveBeenCalledTimes(1);
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
});
