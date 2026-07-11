#!/usr/bin/env npx tsx
/** Consolida paridad Fase B desde audits cacheados (último audit por sha). */
import fs from "node:fs";
import path from "node:path";
import { arbitrateBrandIdentity } from "../src/lib/brandKit/ingest/page-vision-identity-arbitration";
import { buildLogoCandidatesFromPageVision } from "../src/lib/brandKit/ingest/page-vision-pass-apply";
import { assessWordmarkIntegrityStatus } from "../src/lib/brandKit/ingest/page-vision-wordmark-integrity";

const RUNS = path.join(process.cwd(), "fixtures/page-vision-pass/runs");

function latestAudit(prefix: string): string {
  const file = fs
    .readdirSync(RUNS)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".audit.json"))
    .sort()
    .pop();
  if (!file) throw new Error(`Sin audit para ${prefix}`);
  return file;
}

async function main() {
  const cases = [
    ["oaro-nivel1", "1403be85f444", "fixtures/brandkit/sample-brand-deck.pdf"],
    ["catalogo26-nivel1", "f9e683edde0a", "fixtures/brandkit/catalogo26.pdf"],
    ["catalogo26-nivel0", "f9e683edde0a-2026-07-07T06-46-17-368Z.audit.json", "fixtures/brandkit/catalogo26.pdf"],
    ["einf-nivel1", "7f779ce9b0b0", "fixtures/brandkit/einf_2023_atresmedia.pdf"],
  ] as const;

  for (const row of cases) {
    const id = row[0];
    const pdf = row[2];
    const file = row[1].endsWith(".audit.json") ? row[1] : latestAudit(row[1]);
    const audit = JSON.parse(fs.readFileSync(path.join(RUNS, file), "utf8"));
    const identity = arbitrateBrandIdentity(audit);
    const logos = await buildLogoCandidatesFromPageVision(audit, fs.readFileSync(pdf), id);
    const primary = logos.find((e) => e.slot === "primary") ?? logos[0];
    const p3 = audit.pages.find((p: { pageNumber: number }) => p.pageNumber === 3);
    console.log(
      JSON.stringify(
        {
          id,
          auditFile: file,
          emitterBrand: identity.emitterBrand,
          contentNames: identity.contentNames.slice(0, 8),
          contentNamesCount: identity.contentNames.length,
          crowned: primary?.candidate.value.assetOrigin ?? null,
          wordmarkIntegrity: primary
            ? assessWordmarkIntegrityStatus(primary.candidate.value.assetOrigin, primary.candidate.signals)
            : null,
          p3bne: p3?.result?.brandNameEvidence?.length ?? 0,
          p3pageKind: p3?.result?.pageKind,
          okPages: `${audit.pages.filter((p: { ok: boolean }) => p.ok).length}/${audit.pages.length}`,
          latencyMs: audit.ingestMetrics?.latencyMs,
          batchLatencyMs: audit.ingestMetrics?.batchLatencyMs,
          thoughtsTokenCount: audit.ingestMetrics?.geminiUsage?.thoughtsTokenCount,
          batchFallbackUsed: audit.ingestMetrics?.batchFallbackUsed,
          logoHarvestMs: audit.ingestMetrics?.logoHarvestMs,
          parallelPrepassRenderMs: audit.ingestMetrics?.parallelPrepassRenderMs,
          nivel1Contract: audit.nivel1Contract ?? null,
          logoPath: audit.ingestMetrics?.logoPath,
          geminiModel: audit.ingestMetrics?.geminiModel,
        },
        null,
        2,
      ),
    );
  }
}

void main();
