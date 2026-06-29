import { describe, expect, it } from "vitest";
import {
  getCameraProfile,
  listCameraProfiles,
  migrateLegacyProfile,
  resolveColorMatrix,
} from "./lightroom-profile-registry";

describe("lightroom-profile-registry", () => {
  it("lists built-in camera profiles", () => {
    const profiles = listCameraProfiles();
    expect(profiles.some((p) => p.id === "builtin:adobe-color")).toBe(true);
    expect(profiles.some((p) => p.id === "builtin:camera-standard")).toBe(true);
  });

  it("migrateLegacyProfile maps old fields", () => {
    expect(migrateLegacyProfile({ profile: "neutral" })).toBe("builtin:linear");
    expect(migrateLegacyProfile({ profile: "canon-like", profileBaseEnabled: true })).toBe("builtin:adobe-color");
    expect(migrateLegacyProfile({ profile: "canon-like", profileBaseEnabled: false })).toBe("builtin:camera-standard");
  });

  it("camera-standard matrix differs from neutral", () => {
    const std = getCameraProfile("builtin:camera-standard")!;
    const neu = getCameraProfile("builtin:camera-neutral")!;
    const mStd = resolveColorMatrix(std, 0);
    const mNeu = resolveColorMatrix(neu, 0);
    expect(mStd[0]).not.toBeCloseTo(mNeu[0], 3);
  });

  it("profiles have distinct tone curves", () => {
    const std = getCameraProfile("builtin:camera-standard")!;
    const lin = getCameraProfile("builtin:linear")!;
    expect(std.toneCurve[200]).not.toBeCloseTo(lin.toneCurve[200]!, 2);
  });
});
