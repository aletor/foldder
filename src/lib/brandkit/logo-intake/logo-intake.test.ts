import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { box2dToBBoxPage, isValidBox2d } from "@/lib/brandkit/logo-intake/bbox";
import { dHashHamming, phashNear } from "@/lib/brandkit/logo-intake/phash";

const MODULE_DIR = path.join(process.cwd(), "src/lib/brandKit/logo-intake");
const FORBIDDEN_IMPORTS = [
  "page-vision-pass-bbox",
  "logo-lab/refine-bbox",
  "logo-lab/pick-best-logo",
];

describe("logo-intake", () => {
  it("convierte box_2d Gemini a bboxPage sin heurísticas", () => {
    expect(isValidBox2d([100, 200, 400, 600])).toBe(true);
    expect(box2dToBBoxPage([100, 200, 400, 600])).toEqual([0.2, 0.1, 0.6, 0.4]);
    expect(box2dToBBoxPage([900, 900, 902, 902])).toBeNull();
  });

  it("dedup por pHash usa hamming ≤ 12", () => {
    expect(phashNear("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa")).toBe(true);
    expect(dHashHamming("0000000000000000", "ffffffffffffffff")).toBeGreaterThan(12);
  });

  it("no importa capas congeladas del logo-lab clásico", () => {
    const importPattern = /from\s+["']@\/lib\/brandKit\/(?:ingest\/)?([^"']+)["']/g;
    const files = fs.readdirSync(MODULE_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(MODULE_DIR, file), "utf8");
      for (const match of content.matchAll(importPattern)) {
        const target = match[1] ?? "";
        for (const forbidden of FORBIDDEN_IMPORTS) {
          expect(target, `${file} must not import ${forbidden}`).not.toContain(forbidden);
        }
      }
    }
  });
});
