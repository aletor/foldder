import type { DesignerPageState } from "../designer/DesignerNode";
import type { FreehandObject } from "../FreehandStudio";
import { buildSiteSelectionIndex } from "./build-site-selection-index";
import { resolveSiteCreatorResponsiveDisplay } from "./site-creator-responsive";
import type { SiteBlueprintV1 } from "./site-creator-types";
import {
  SITE_CREATOR_MOBILE_WIDTH,
  siteCreatorDeviceChrome,
  type SiteCreatorDeviceChromeKind,
} from "./site-creator-viewport";

export const SITE_CREATOR_NODE_MONITOR_FRAME = { width: 1920, height: 1080 } as const;
export const SITE_CREATOR_NODE_MOBILE_FRAME = {
  width: SITE_CREATOR_MOBILE_WIDTH,
  height: 844,
} as const;

export type SiteCreatorNodeDeviceSnapshot = {
  kind: SiteCreatorDeviceChromeKind;
  label: string;
  layoutWidth: number;
  layoutHeight: number;
  cropHeight: number;
  objects: FreehandObject[];
  deviceWidth: number;
  deviceHeight: number;
};

export type SiteCreatorNodeDeviceMosaicModel = {
  monitor: SiteCreatorNodeDeviceSnapshot;
  mobile: SiteCreatorNodeDeviceSnapshot;
};

function snapshotForBand(args: {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
  index: ReturnType<typeof buildSiteSelectionIndex>;
  kind: "monitor" | "mobile";
  deviceWidth: number;
  deviceHeight: number;
  label: string;
}): SiteCreatorNodeDeviceSnapshot {
  const resolved = resolveSiteCreatorResponsiveDisplay({
    page: args.page,
    blueprint: args.blueprint,
    referenceIndex: args.index,
    viewportWidth: args.deviceWidth,
    viewportHeight: args.deviceHeight,
    band: args.kind,
    expandViewportSections: false,
  });
  const layoutWidth = Math.max(1, resolved.layout.layoutWidth);
  const layoutHeight = Math.max(1, resolved.layout.layoutHeight);
  return {
    kind: args.kind,
    label: args.label,
    layoutWidth,
    layoutHeight,
    cropHeight: Math.min(layoutHeight, args.deviceHeight),
    objects: resolved.displayPage.objects ?? [],
    deviceWidth: args.deviceWidth,
    deviceHeight: args.deviceHeight,
  };
}

export function buildSiteCreatorNodeDeviceMosaic(args: {
  page: DesignerPageState;
  blueprint: SiteBlueprintV1;
}): SiteCreatorNodeDeviceMosaicModel {
  const index = buildSiteSelectionIndex(args.page);
  return {
    monitor: snapshotForBand({
      page: args.page,
      blueprint: args.blueprint,
      index,
      kind: "monitor",
      deviceWidth: SITE_CREATOR_NODE_MONITOR_FRAME.width,
      deviceHeight: SITE_CREATOR_NODE_MONITOR_FRAME.height,
      label: "Ordenador",
    }),
    mobile: snapshotForBand({
      page: args.page,
      blueprint: args.blueprint,
      index,
      kind: "mobile",
      deviceWidth: SITE_CREATOR_NODE_MOBILE_FRAME.width,
      deviceHeight: SITE_CREATOR_NODE_MOBILE_FRAME.height,
      label: "Móvil",
    }),
  };
}

export function siteCreatorNodeDeviceChrome(kind: SiteCreatorDeviceChromeKind) {
  return siteCreatorDeviceChrome(kind);
}
