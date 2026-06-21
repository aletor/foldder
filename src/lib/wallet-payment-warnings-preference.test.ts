import { afterEach, describe, expect, it } from "vitest";
import {
  getPaymentWarningsEnabledSnapshot,
  readPaymentWarningsEnabled,
  resetPaymentWarningsPreferenceForTests,
  writePaymentWarningsEnabled,
} from "./wallet-payment-warnings-preference";

describe("wallet-payment-warnings-preference", () => {
  afterEach(() => {
    resetPaymentWarningsPreferenceForTests();
  });

  it("defaults to enabled", () => {
    expect(readPaymentWarningsEnabled()).toBe(true);
    expect(getPaymentWarningsEnabledSnapshot()).toBe(true);
  });

  it("persists disabled state", () => {
    writePaymentWarningsEnabled(false);
    expect(readPaymentWarningsEnabled()).toBe(false);
    writePaymentWarningsEnabled(true);
    expect(readPaymentWarningsEnabled()).toBe(true);
  });
});
