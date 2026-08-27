import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createEmptySiteBlueprintV1 } from "./site-creator-types";
import { makeLayer, makePage } from "./site-creator-responsive-fixtures";
import {
  SITE_CREATOR_NODE_MOBILE_FRAME,
  SITE_CREATOR_NODE_MONITOR_FRAME,
  buildSiteCreatorNodeDeviceMosaic,
} from "./site-creator-node-device-mosaic";
import { SiteCreatorNodeDeviceMosaic } from "./SiteCreatorNodeDeviceMosaic";
import { DesignerPagePreview } from "../designer/DesignerPagePreview";
import { siteCreatorDeviceChrome } from "./site-creator-viewport";

describe("site-creator node device mosaic", () => {
  it("builds monitor and mobile snapshots cropped to the first screen", () => {
    const page = makePage(
      [
        makeLayer({ id: "hero", type: "rect", x: 0, y: 0, width: 1920, height: 1080, fill: "#111" }),
        makeLayer({ id: "below", type: "rect", x: 0, y: 1200, width: 1920, height: 800, fill: "#222" }),
      ],
      { w: 1920, h: 2200 },
    );
    const mosaic = buildSiteCreatorNodeDeviceMosaic({
      page,
      blueprint: createEmptySiteBlueprintV1(),
    });

    expect(mosaic.monitor.kind).toBe("monitor");
    expect(mosaic.monitor.label).toBe("Ordenador");
    expect(mosaic.monitor.deviceWidth).toBe(SITE_CREATOR_NODE_MONITOR_FRAME.width);
    expect(mosaic.monitor.deviceHeight).toBe(SITE_CREATOR_NODE_MONITOR_FRAME.height);
    expect(mosaic.monitor.cropHeight).toBe(SITE_CREATOR_NODE_MONITOR_FRAME.height);
    expect(mosaic.monitor.cropHeight).toBeLessThan(mosaic.monitor.layoutHeight);

    expect(mosaic.mobile.kind).toBe("mobile");
    expect(mosaic.mobile.label).toBe("Móvil");
    expect(mosaic.mobile.deviceWidth).toBe(SITE_CREATOR_NODE_MOBILE_FRAME.width);
    expect(mosaic.mobile.deviceHeight).toBe(SITE_CREATOR_NODE_MOBILE_FRAME.height);
    expect(mosaic.mobile.layoutWidth).toBeLessThan(mosaic.monitor.layoutWidth);
  });

  it("renders device frames so each version is recognizable", () => {
    const page = makePage([
      makeLayer({ id: "hero", type: "rect", x: 0, y: 0, width: 1920, height: 1080, fill: "#333" }),
    ]);
    const mosaic = buildSiteCreatorNodeDeviceMosaic({
      page,
      blueprint: createEmptySiteBlueprintV1(),
    });

    render(<SiteCreatorNodeDeviceMosaic mosaic={mosaic} renderImages={false} />);

    expect(screen.getByTestId("site-creator-node-device-mosaic")).toBeTruthy();
    const monitorChrome = screen.getByTestId("site-creator-node-device-chrome-monitor");
    const mobileChrome = screen.getByTestId("site-creator-node-device-chrome-mobile");
    expect(monitorChrome.getAttribute("style")).toContain(
      `padding: ${siteCreatorDeviceChrome("monitor").bezelPx}px`,
    );
    expect(monitorChrome.getAttribute("style")).toContain(
      `border-radius: ${siteCreatorDeviceChrome("monitor").radiusPx}px`,
    );
    expect(mobileChrome.getAttribute("style")).toContain(
      `padding: ${siteCreatorDeviceChrome("mobile").bezelPx}px`,
    );
    expect(mobileChrome.getAttribute("style")).toContain(
      `border-radius: ${siteCreatorDeviceChrome("mobile").radiusPx}px`,
    );
    expect(screen.getByText("Ordenador")).toBeTruthy();
    expect(screen.getByText("Móvil")).toBeTruthy();
  });

  it("paints nested clip images instead of a solid placeholder", () => {
    const page = makePage([
      {
        id: "clip",
        type: "clippingContainer",
        name: "Hero",
        visible: true,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        mask: makeLayer({ id: "mask", type: "rect", x: 0, y: 0, width: 1920, height: 1080 }),
        content: [
          makeLayer({
            id: "photo",
            type: "image",
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            src: "https://cdn.example/hero.jpg",
          }),
        ],
      } as ReturnType<typeof makeLayer>,
    ]);
    const mosaic = buildSiteCreatorNodeDeviceMosaic({
      page,
      blueprint: createEmptySiteBlueprintV1(),
    });
    render(<SiteCreatorNodeDeviceMosaic mosaic={mosaic} renderImages />);
    const images = document.querySelectorAll("image");
    expect(images.length).toBeGreaterThan(0);
    expect([...images].some((node) => node.getAttribute("href") === "https://cdn.example/hero.jpg")).toBe(
      true,
    );
  });

  it("paints rect fills and text instead of purple placeholders", () => {
    render(
      <DesignerPagePreview
        objects={[
          makeLayer({ id: "box", type: "rect", x: 10, y: 10, width: 120, height: 40, fill: "#111111" }),
          makeLayer({
            id: "title",
            type: "text",
            x: 10,
            y: 60,
            width: 280,
            height: 48,
            text: "Hola mundo",
            fill: "#0a0a0a",
          }),
        ]}
        pageWidth={400}
        pageHeight={300}
      />,
    );

    expect(screen.getByText("Hola mundo")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain("rgba(99,102,241,0.18)");
    expect([...document.querySelectorAll("path")].some((node) => node.getAttribute("fill") === "#111111")).toBe(
      true,
    );
  });
});
