import { describe, expect, it } from "vitest";
import {
  buildLibRawDecodeSettings,
  isNativeImageFileName,
  isRawFileName,
  normalizeFileExtension,
} from "./lightroom-decode-settings";

describe("lightroom-decode-settings", () => {
  it("buildLibRawDecodeSettings preview uses linear 16-bit AHD", () => {
    expect(buildLibRawDecodeSettings({ mode: "preview" })).toMatchObject({
      useCameraWb: true,
      useCameraMatrix: 0,
      userQual: 3,
      outputColor: 0,
      outputBps: 16,
      noAutoBright: true,
      highlight: 5,
      halfSize: true,
    });
  });

  it("buildLibRawDecodeSettings export uses AMaZE full size", () => {
    expect(buildLibRawDecodeSettings({ mode: "export" })).toMatchObject({
      userQual: 11,
      halfSize: false,
      outputColor: 0,
      outputBps: 16,
    });
  });

  it("normalizes extensions", () => {
    expect(normalizeFileExtension("IMG_0001.CR3")).toBe("cr3");
    expect(normalizeFileExtension("noext")).toBe("");
  });

  it("detects RAW and native formats", () => {
    expect(isRawFileName("photo.cr3")).toBe(true);
    expect(isRawFileName("photo.dng")).toBe(true);
    expect(isRawFileName("photo.jpg")).toBe(false);
    expect(isNativeImageFileName("photo.jpeg")).toBe(true);
    expect(isNativeImageFileName("photo.cr2")).toBe(false);
  });
});
