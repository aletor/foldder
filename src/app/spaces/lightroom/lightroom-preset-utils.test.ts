import { describe, expect, it } from "vitest";
import { EMPTY_DEVELOP_SETTINGS, patchDevelopSettings } from "./lightroom-develop-settings";
import {
  ALL_PRESET_INCLUDES,
  applyPresetToSettings,
  createStoredPreset,
  exportPresetFile,
  parsePresetImportFile,
  presetThumbFromSettings,
} from "./lightroom-preset-utils";

describe("lightroom-preset-utils", () => {
  it("applyPresetToSettings merges only included sections", () => {
    const current = patchDevelopSettings(EMPTY_DEVELOP_SETTINGS, {
      basic: { exposure: 10, temp: 5, contrast: 0 },
      detail: { sharpenAmount: 25 },
    });
    const preset = createStoredPreset({
      name: "Solo tono",
      groupId: "user-default",
      settings: patchDevelopSettings(EMPTY_DEVELOP_SETTINGS, {
        basic: { exposure: -20, contrast: 30, temp: -40, tint: 10 },
        detail: { sharpenAmount: 0 },
      }),
      includes: { ...ALL_PRESET_INCLUDES, whiteBalance: false, detail: false },
    });

    const next = applyPresetToSettings(current, preset);
    expect(next.basic.exposure).toBe(-20);
    expect(next.basic.contrast).toBe(30);
    expect(next.basic.temp).toBe(5);
    expect(next.detail.sharpenAmount).toBe(25);
  });

  it("export and import round-trip", () => {
    const preset = createStoredPreset({
      name: "Export me",
      groupId: "user-default",
      settings: patchDevelopSettings(EMPTY_DEVELOP_SETTINGS, { basic: { vibrance: 42 } }),
      includes: ALL_PRESET_INCLUDES,
    });
    const file = exportPresetFile(preset);
    const imported = parsePresetImportFile(file);
    expect(imported?.name).toBe("Export me");
    expect(imported?.settings.basic.vibrance).toBe(42);
  });

  it("presetThumbFromSettings returns gradient string", () => {
    const thumb = presetThumbFromSettings(
      patchDevelopSettings(EMPTY_DEVELOP_SETTINGS, { basic: { saturation: -100 } }),
    );
    expect(thumb).toContain("linear-gradient");
  });
});
