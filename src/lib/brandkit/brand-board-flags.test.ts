import { describe, expect, it, afterEach } from "vitest";
import { isBrandBoardAsLandingEnabled, isLegacyAtmosphereEntryEnabled } from "./brand-board-flags";

describe("brand-board-flags", () => {
  const prevLanding = process.env.NEXT_PUBLIC_BRAND_BOARD_AS_LANDING;
  const prevAtmosphere = process.env.NEXT_PUBLIC_LEGACY_ATMOSPHERE_ENTRY;

  afterEach(() => {
    if (prevLanding === undefined) delete process.env.NEXT_PUBLIC_BRAND_BOARD_AS_LANDING;
    else process.env.NEXT_PUBLIC_BRAND_BOARD_AS_LANDING = prevLanding;
    if (prevAtmosphere === undefined) delete process.env.NEXT_PUBLIC_LEGACY_ATMOSPHERE_ENTRY;
    else process.env.NEXT_PUBLIC_LEGACY_ATMOSPHERE_ENTRY = prevAtmosphere;
  });

  it("brandBoardAsLanding respeta override explícito", () => {
    process.env.NEXT_PUBLIC_BRAND_BOARD_AS_LANDING = "0";
    expect(isBrandBoardAsLandingEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_BRAND_BOARD_AS_LANDING = "1";
    expect(isBrandBoardAsLandingEnabled()).toBe(true);
  });

  it("legacyAtmosphereEntry default OFF", () => {
    delete process.env.NEXT_PUBLIC_LEGACY_ATMOSPHERE_ENTRY;
    expect(isLegacyAtmosphereEntryEnabled()).toBe(false);
  });
});
