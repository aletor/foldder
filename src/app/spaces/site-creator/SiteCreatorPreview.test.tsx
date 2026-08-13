import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

    render(<SiteCreatorPreview page={snapshotPage} />);

    const canvas = screen.getByTestId("designer-page-canvas-view");
    expect(canvas.getAttribute("data-object-count")).toBe("1");
    expect(canvas.getAttribute("data-page-width")).toBe("540");
    expect(canvas.getAttribute("data-page-height")).toBe("960");

    expect(livePage.objects[0]!.id).toBe("live_layer");
    expect(snapshotPage.objects[0]!.id).toBe("snap_layer");
  });
});
