"use client";

import React from "react";
import { DesignerPagePreview } from "../designer/DesignerPagePreview";
import {
  type SiteCreatorNodeDeviceSnapshot,
  siteCreatorNodeDeviceChrome,
} from "./site-creator-node-device-mosaic";

function DeviceTile({
  snapshot,
  renderImages,
}: {
  snapshot: SiteCreatorNodeDeviceSnapshot;
  renderImages: boolean;
}) {
  const chrome = siteCreatorNodeDeviceChrome(snapshot.kind);
  const outerW = snapshot.deviceWidth + chrome.bezelPx * 2;
  const outerH = snapshot.deviceHeight + chrome.bezelPx * 2;
  return (
    <div
      className="site-creator-node-device-tile"
      data-testid={`site-creator-node-device-${snapshot.kind}`}
      data-device-kind={snapshot.kind}
    >
      <div className="site-creator-node-device-slot">
        <div
          className="site-creator-node-device-chrome"
          data-testid={`site-creator-node-device-chrome-${snapshot.kind}`}
          style={{
            width: `min(100cqw, calc(100cqh * ${outerW} / ${outerH}))`,
            height: `min(100cqh, calc(100cqw * ${outerH} / ${outerW}))`,
            padding: chrome.bezelPx,
            borderRadius: chrome.radiusPx,
            background: chrome.color,
            boxShadow: chrome.rim,
          }}
        >
          <div
            className="site-creator-node-device-screen"
            style={{ borderRadius: chrome.innerRadiusPx }}
          >
            <DesignerPagePreview
              objects={snapshot.objects}
              pageWidth={snapshot.layoutWidth}
              pageHeight={snapshot.layoutHeight}
              visibleHeight={snapshot.cropHeight}
              renderImages={renderImages}
            />
          </div>
        </div>
      </div>
      <span className="site-creator-node-device-label">{snapshot.label}</span>
    </div>
  );
}

export function SiteCreatorNodeDeviceMosaic({
  mosaic,
  renderImages,
}: {
  mosaic: { monitor: SiteCreatorNodeDeviceSnapshot; mobile: SiteCreatorNodeDeviceSnapshot };
  renderImages: boolean;
}) {
  return (
    <div
      className="site-creator-node-device-mosaic"
      data-testid="site-creator-node-device-mosaic"
      aria-hidden
    >
      <DeviceTile snapshot={mosaic.monitor} renderImages={renderImages} />
      <DeviceTile snapshot={mosaic.mobile} renderImages={renderImages} />
    </div>
  );
}
