const PREFIX = "knowledge-files/spaces/";

/** Carpeta por proyecto (space); `root` u vacío → segmento `orphan`. */
export function sanitizeSpaceSegment(spaceId: string | null | undefined): string {
  if (!spaceId || spaceId === "root") return "orphan";
  return spaceId.replace(/[^a-zA-Z0-9_-]/g, "") || "orphan";
}

export function sanitizeAssetId(assetId: string): string {
  const s = assetId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!s) throw new Error("Invalid designer asset id");
  return s;
}

/**
 * Claves S3: `knowledge-files/spaces/{space}/designer/{assetId}_HR|_OPT.{ext}`
 * Misma `assetId` para todas las instancias de la misma imagen lógica.
 */
export function buildDesignerAssetObjectKey(
  spaceId: string | null | undefined,
  assetId: string,
  variant: "HR" | "OPT",
  ext: string,
): string {
  const space = sanitizeSpaceSegment(spaceId);
  const aid = sanitizeAssetId(assetId);
  const e = ext.replace(/^\./, "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${PREFIX}${space}/designer/${aid}_${variant}.${e}`;
}

export function isDesignerAssetKey(key: string): boolean {
  return key.startsWith(PREFIX) && key.includes("/designer/") && (key.includes("_HR.") || key.includes("_OPT."));
}
