import { describe, expect, it } from "vitest";
import { isPhashNearRejected, phashHammingDistance } from "./logo-phash";

describe("logo-phash", () => {
  it("Hamming distance entre cadenas de bits", () => {
    expect(phashHammingDistance("1111", "1111")).toBe(0);
    expect(phashHammingDistance("1111", "0000")).toBe(4);
  });

  it("isPhashNearRejected detecta firma similar", () => {
    const a = "1".repeat(32);
    const b = `${"1".repeat(30)}00`;
    expect(isPhashNearRejected(b, [a])).toBe(true);
  });
});
