/**
 * Logs quirúrgicos del pase de visión BrandKit — servidor (stdout).
 * Prefijo unificado para filtrar: `[vision]` / `[palette]` / `[logo]`.
 */

import type { BrandKitPdfVisionResult } from "./pdf-vision-types";
import type { PdfPaletteSource } from "./pdf-palette-vision";

export type VisionIngestGateDecision = {
  willRunVision: boolean;
  reason: string;
};

export function logVisionIngestStart(input: {
  sha256: string;
  duplicate: boolean;
  allowPaidExtractOps: boolean;
  allowPaidAnalysis?: boolean;
}): void {
  console.info(
    `[vision] ingest start: sha256=${input.sha256} duplicate=${input.duplicate} ` +
      `allowPaidExtractOps=${input.allowPaidExtractOps} allowPaidAnalysis=${input.allowPaidAnalysis ?? false}`,
  );
}

export function logVisionGateDecision(decision: VisionIngestGateDecision): void {
  console.info(
    `[vision] gate decision: willRunVision=${decision.willRunVision} reason="${decision.reason}"`,
  );
}

export function logVisionMosaicBuilt(input: { pages: number; bytes: number }): void {
  console.info(`[vision] mosaic built: pages=${input.pages} bytes=${input.bytes}`);
}

export function logVisionApiCall(input: { model: string }): void {
  console.info(`[vision] API call: model=${input.model}`);
}

export function logVisionNoApiKey(): void {
  console.error("[vision] no API key configured");
}

export function logVisionApiResponse(input: {
  ok: boolean;
  logoBbox?: string;
  paletteLength: number;
}): void {
  console.info(
    `[vision] API response: ok=${input.ok} logo.bbox=${input.logoBbox ?? "none"} palette.length=${input.paletteLength}`,
  );
}

export function logVisionParseFailed(rawText: string): void {
  const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 240);
  console.error(`[vision] JSON parse failed, raw snippet: ${snippet || "(empty)"}`);
}

export function logVisionApiFailed(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[vision] API failed: ${message}`);
}

export function logVisionApplied(pass: BrandKitPdfVisionResult): void {
  const roles = pass.palette.map((p) => p.role).join(",") || "none";
  const bbox = pass.logo?.emitter?.bbox
    ? `${pass.logo.emitter.bbox.x.toFixed(2)},${pass.logo.emitter.bbox.y.toFixed(2)}`
    : "none";
  console.info(`[vision] applied: paletteRoles=${roles} logoBbox=${bbox}`);
}

export function logPaletteSource(input: {
  source: PdfPaletteSource;
  visionMatchCount?: number;
  roles?: string[];
}): void {
  const roles = input.roles?.join(",") ?? "none";
  const matches =
    input.visionMatchCount !== undefined ? ` visionMatches=${input.visionMatchCount}` : "";
  console.info(`[palette] source used: "${input.source}"${matches} roles=${roles}`);
}

export function logLogoIsolationPath(
  path: "vision-bbox" | "deterministic-fallback",
  extra?: { polarity?: string; pixelsKeptPct?: number },
): void {
  const suffix =
    extra?.polarity !== undefined
      ? ` polarity=${extra.polarity}${extra.pixelsKeptPct !== undefined ? ` pixelsKept=${extra.pixelsKeptPct.toFixed(1)}%` : ""}`
      : "";
  console.info(`[logo] isolation path: "${path}"${suffix}`);
}

export function logLogoBboxRejected(input: {
  reason: string;
  pixelsKeptPct: number;
  pixelBBox: { x: number; y: number; width: number; height: number };
  polarity: string;
}): void {
  console.info(
    `[logo] vision-bbox rejected: reason=${input.reason} pixelsKept=${input.pixelsKeptPct.toFixed(1)}% ` +
      `bbox=x=${input.pixelBBox.x},y=${input.pixelBBox.y},w=${input.pixelBBox.width},h=${input.pixelBBox.height} ` +
      `polarity=${input.polarity}`,
  );
}

export function logPageVisionPassStart(input: {
  fileName: string;
  selectionScope: string;
  selectedPages: number;
  totalPages: number;
}): void {
  console.info(
    `[vision] Fase A start: file="${input.fileName}" scope=${input.selectionScope} ` +
      `selected=${input.selectedPages} totalPages=${input.totalPages}`,
  );
}

export function logPageVisionPassDone(input: {
  fileName: string;
  okPages: number;
  totalPages: number;
  logoInstances: number;
  images: number;
}): void {
  console.info(
    `[vision] Fase A done: file="${input.fileName}" ok=${input.okPages}/${input.totalPages} ` +
      `logoInstances=${input.logoInstances} images=${input.images}`,
  );
}
