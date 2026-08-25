import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SiteCreatorDeviceSelector } from "./SiteCreatorDeviceSelector";
import { defaultDeviceConfig } from "./site-creator-viewport";

function renderSelector(args?: { onActivate?: () => void }) {
  const onActivate = args?.onActivate ?? vi.fn();
  const onConfigChange = vi.fn();
  render(
    <SiteCreatorDeviceSelector
      band="tablet"
      bandLabel="Tablet"
      active={false}
      config={defaultDeviceConfig("tablet")}
      referenceWidth={1920}
      resolvedWidth={820}
      resolvedHeight={1180}
      sizeLabel="Estándar"
      onActivate={onActivate}
      onConfigChange={onConfigChange}
    />,
  );
  return { onActivate, onConfigChange };
}

describe("SiteCreatorDeviceSelector", () => {
  it("switches to the current device config without opening the size menu", () => {
    const { onActivate } = renderSelector();
    fireEvent.click(screen.getByTestId("site-creator-device-trigger-tablet"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("site-creator-device-popover-tablet")).toBeNull();
  });

  it("opens the size menu only from the caret", () => {
    const { onActivate } = renderSelector();
    fireEvent.click(screen.getByTestId("site-creator-device-menu-tablet"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("site-creator-device-popover-tablet")).toBeTruthy();
  });
});
