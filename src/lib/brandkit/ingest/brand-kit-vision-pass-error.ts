/** Error cuando el usuario autorizó análisis de pago pero la visión no devolvió resultado. */
export class BrandKitVisionPassError extends Error {
  readonly code = "brand_kit_vision_pass_failed" as const;
  billedCostUsd?: number;
  billedUsage?: import("./page-vision-batch-gemini-usage").PageVisionGeminiUsageSnapshot;

  constructor(message: string) {
    super(message);
    this.name = "BrandKitVisionPassError";
  }
}
