import { describe, expect, it } from "vitest";
import { cloneBlueprint } from "./site-blueprint-validate";
import {
  resolveMonitorMaxWidth,
  setMonitorMaxWidth,
} from "./site-creator-monitor-max-width";
import { createEmptySiteBlueprintV1, sanitizeSiteBlueprintV1 } from "./site-creator-types";
import { SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH } from "./site-creator-viewport";

describe("site-creator-monitor-max-width", () => {
  it("defaults to 1500 when the blueprint has no value", () => {
    expect(resolveMonitorMaxWidth(createEmptySiteBlueprintV1(), 1920)).toBe(
      SITE_CREATOR_DEFAULT_MONITOR_MAX_WIDTH,
    );
  });

  it("clamps and persists the Ordenador max width", () => {
    const next = setMonitorMaxWidth(createEmptySiteBlueprintV1(), 1400, 1920);
    expect(next.monitorMaxWidth).toBe(1400);
    expect(resolveMonitorMaxWidth(next, 1920)).toBe(1400);
    const cloned = cloneBlueprint(next);
    expect(cloned.monitorMaxWidth).toBe(1400);
    expect(sanitizeSiteBlueprintV1(cloned).monitorMaxWidth).toBe(1400);
  });
});
