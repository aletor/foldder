/**
 * Feature flags Brand Board v1 (correctivo UI).
 * `brandBoardAsLanding`: Board como superficie al abrir el nodo (rollback con OFF).
 * `legacyAtmosphereEntry`: entrada opcional «Atmósfera» en menú ··· (nunca landing).
 */

function readPublicFlag(name: string): boolean | null {
  if (typeof process === "undefined") return null;
  const raw = process.env[name];
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

export function isBrandBoardAsLandingEnabled(): boolean {
  const override = readPublicFlag("NEXT_PUBLIC_BRAND_BOARD_AS_LANDING");
  if (override !== null) return override;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") return true;
  return false;
}

export function isLegacyAtmosphereEntryEnabled(): boolean {
  const override = readPublicFlag("NEXT_PUBLIC_LEGACY_ATMOSPHERE_ENTRY");
  if (override !== null) return override;
  return false;
}
