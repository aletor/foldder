import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAID_API_NO_AUTO_RETRY_ON_ERROR } from "./paid-api-policy";

describe("paid-api-policy", () => {
  it("declares no auto-retry on paid API errors", () => {
    expect(PAID_API_NO_AUTO_RETRY_ON_ERROR).toBe(true);
  });

  it("gallery generate does not re-call gemini in catch blocks", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/brandkit/run-gallery-generate.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/retrying text-only/i);
    expect(source).not.toMatch(/return await attempt\(/);
    const catchBlocks = source.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/g) ?? [];
    for (const block of catchBlocks) {
      expect(block).not.toMatch(/geminiImageGenerate/);
    }
  });
});
