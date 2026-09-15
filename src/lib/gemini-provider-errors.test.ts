import { describe, expect, it } from "vitest";
import {
  GEMINI_DEADLINE_USER_MESSAGE,
  GEMINI_HIGH_DEMAND_USER_MESSAGE,
  mapGeminiProviderErrorMessage,
} from "./gemini-provider-errors";

describe("mapGeminiProviderErrorMessage", () => {
  it("maps Google high-demand 503 to a Spanish no-retry message", () => {
    expect(
      mapGeminiProviderErrorMessage(
        503,
        "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
      ),
    ).toBe(GEMINI_HIGH_DEMAND_USER_MESSAGE);
  });

  it("maps deadline 503 without charging a retry", () => {
    expect(mapGeminiProviderErrorMessage(503, "The operation timed out / deadline expired")).toBe(
      GEMINI_DEADLINE_USER_MESSAGE,
    );
  });

  it("keeps 429 quota copy", () => {
    expect(mapGeminiProviderErrorMessage(429, "RESOURCE_EXHAUSTED")).toMatch(/429/);
  });
});
