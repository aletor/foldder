import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLogoCandidatesFromPageVision } from "./page-vision-pass-apply";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";

const CATALOGO26_PDF = path.join(process.cwd(), "fixtures/brandkit/catalogo26.pdf");
const AUDIT_FIXTURE =
  "fixtures/page-vision-pass/runs/f9e683edde0a-2026-07-06T21-22-39-790Z.audit.json";

describe.skipIf(!fs.existsSync(CATALOGO26_PDF))("page-vision-pass-apply — catalogo26 logos", () => {
  it("consolida 4 instancias ATRESMEDIA SALES en 1 candidato con persistencia ×4", async () => {
    const audit = JSON.parse(fs.readFileSync(AUDIT_FIXTURE, "utf8")) as PageVisionPassRunAudit;
    const buffer = fs.readFileSync(CATALOGO26_PDF);
    const entries = await buildLogoCandidatesFromPageVision(audit, buffer, "src_test");
    expect(entries.length).toBe(1);
    expect(entries[0]?.slot).toBe("primary");
    expect(entries[0]?.candidate.value.assetOrigin).toBe("vector_native");
    expect(entries[0]?.imageUrl).toContain("image/svg+xml");
    expect(entries[0]?.candidate.signals.find((s) => s.kind === "recurrence")?.detail).toBe(
      "persistencia ×4",
    );
    expect(entries[0]?.candidate.signals.some((s) => s.kind === "wordmark-integrity" && s.detail?.includes("✓"))).toBe(
      true,
    );
    expect(entries[0]?.candidate.value.variants?.some((v) => v.variant === "positive")).toBe(true);
    expect(entries[0]?.candidate.value.variants?.some((v) => v.variant === "negative")).toBe(true);
  });
});
