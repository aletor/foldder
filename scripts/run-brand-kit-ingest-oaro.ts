#!/usr/bin/env npx tsx
/** Regresión OARO end-to-end — logo raster + gate vectorize. */

import fs from "node:fs";
import path from "node:path";
import { ingestPdfIntoGenome } from "../src/lib/brandKit/ingest/pdf-ingest-server";
import { emptyGenome, getTrait } from "../src/lib/brandKit/model/trait";
import { arbitrateBrandIdentity } from "../src/lib/brandKit/ingest/page-vision-identity-arbitration";
import { findCrownedLogoVectorizeJob } from "../src/lib/brandKit/projection/logo-vectorize-action";
import type { PageVisionPassRunAudit } from "../src/lib/brandKit/ingest/page-vision-pass-runner";
import type { LogoValue } from "../src/lib/brandKit/model/trait-values";
import { SAMPLE_BRAND_DECK_FILENAME, SAMPLE_BRAND_DECK_PDF } from "../src/lib/brandKit/fixtures/brandkit-paths";
import { loadScriptEnv } from "./load-script-env";

const OARO_AUDIT_PREFIX = "1afbf7f6630a";

function loadLatestOaroAudit(): PageVisionPassRunAudit | null {
  const runsDir = path.join(process.cwd(), "fixtures/page-vision-pass/runs");
  const auditPath = fs
    .readdirSync(runsDir)
    .filter((f) => f.startsWith(OARO_AUDIT_PREFIX) && f.endsWith(".audit.json"))
    .sort()
    .pop();
  if (!auditPath) return null;
  return JSON.parse(fs.readFileSync(path.join(runsDir, auditPath), "utf8")) as PageVisionPassRunAudit;
}

async function main() {
  loadScriptEnv();
  if (process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED !== "1") {
    console.error("Set BRAND_KIT_PAGE_VISION_PASS_ENABLED=1 en .env.local");
    process.exit(1);
  }
  const auditFixture = loadLatestOaroAudit();
  if (!auditFixture) {
    console.error(`No cached audit under fixtures/page-vision-pass/runs/${OARO_AUDIT_PREFIX}*.audit.json`);
    process.exit(1);
  }
  const buffer = fs.readFileSync(SAMPLE_BRAND_DECK_PDF);
  let genome = emptyGenome();
  for await (const event of ingestPdfIntoGenome(buffer, SAMPLE_BRAND_DECK_FILENAME, genome, {
    allowPaidAnalysis: true,
    allowMaterialPrompts: false,
    pageVisionAuditFixture: auditFixture,
  })) {
    if (event.type === "genome_update") genome = event.genome;
    if (event.type === "section_resolved" && event.section === "logo") {
      console.info("logo:", event.micro);
    }
  }

  const trait = getTrait(genome, "logo.primary");
  const crownedId = trait?.crownedIds[0];
  const primary = trait?.candidates.find((c) => c.id === crownedId) ?? trait?.candidates[0];
  const logo = primary?.value as LogoValue | undefined;
  const vectorizeJob = findCrownedLogoVectorizeJob(genome);
  const identity = arbitrateBrandIdentity(auditFixture);

  const report = {
    emitterBrand: identity?.emitterBrand ?? null,
    logoAssetOrigin: logo?.assetOrigin ?? null,
    logoCrowned: Boolean(crownedId),
    imageMime: logo?.imageUrl?.slice(5, logo?.imageUrl.indexOf(";")),
    vectorizeJobCreated: Boolean(vectorizeJob),
    vectorizeAllowed: logo?.assetOrigin ? logo.assetOrigin !== "vector_native" : null,
  };
  console.log(JSON.stringify(report, null, 2));
  fs.mkdirSync("docs/brandKit-evidence", { recursive: true });
  fs.writeFileSync("docs/brandKit-evidence/oaro-ingest-report.json", `${JSON.stringify(report, null, 2)}\n`);
}

void main();
