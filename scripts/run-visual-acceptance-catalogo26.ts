#!/usr/bin/env npx tsx
/**
 * Informe de aceptación visual Fase B — catalogo26.
 * Emite: path audit diff, variantes claro/oscuro, integridad wordmark, brandKit fresco.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CATALOGO26_FILENAME, CATALOGO26_PDF } from "../src/lib/brandKit/fixtures/brandkit-paths";
import { buildLogoCandidatesFromPageVision } from "../src/lib/brandKit/ingest/page-vision-pass-apply";
import { arbitrateBrandIdentity } from "../src/lib/brandKit/ingest/page-vision-identity-arbitration";
import { ingestPdfIntoGenome } from "../src/lib/brandKit/ingest/pdf-ingest-server";
import { emptyGenome } from "../src/lib/brandKit/model/trait";
import { findCrownedLogoVectorizeJob } from "../src/lib/brandKit/projection/logo-vectorize-action";
import type { PageVisionPassRunAudit } from "../src/lib/brandKit/ingest/page-vision-pass-runner";
import type { LogoVariantAsset } from "../src/lib/brandKit/model/trait-values";

const OUT = "docs/brandKit-evidence";
const AUDIT_PATH =
  process.env.CATALOGO26_AUDIT_PATH ??
  "fixtures/page-vision-pass/runs/f9e683edde0a-2026-07-07T06-37-27-385Z.audit.json";
const PUBLIC_GENOME = "public/fixtures/page-vision-pass/runs/catalogo26-ingest-genome.json";

async function rasterSvgOnBg(svg: string, bg: string, outPath: string) {
  const meta = await sharp(Buffer.from(svg)).metadata();
  const w = meta.width ?? 500;
  const h = meta.height ?? 200;
  const targetW = 900;
  const targetH = Math.max(1, Math.round((h / w) * targetW));
  const logoPng = await sharp(Buffer.from(svg)).resize(targetW, targetH, { fit: "inside" }).png().toBuffer();
  const logoMeta = await sharp(logoPng).metadata();
  const lw = logoMeta.width ?? targetW;
  const lh = logoMeta.height ?? targetH;
  const pad = 48;
  await sharp({
    create: { width: lw + pad * 2, height: lh + pad * 2, channels: 3, background: bg },
  })
    .composite([{ input: logoPng, left: pad, top: pad }])
    .png()
    .toFile(outPath);
}

function variantSvgFromDataUrl(url: string): string {
  return Buffer.from(url.split(",")[1]!, "base64").toString("utf8");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const buffer = fs.readFileSync(CATALOGO26_PDF);
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8")) as PageVisionPassRunAudit;

  const entries = await buildLogoCandidatesFromPageVision(audit, buffer, "acceptance_report");
  const primary = entries[0];
  const identity = arbitrateBrandIdentity(audit);
  const pathAudit = primary?.pathAudit;
  const rejected = pathAudit?.entries.filter((e) => e.decision === "rejected") ?? [];
  const integritySignal = primary?.candidate.signals.find((s) => s.kind === "wordmark-integrity");

  const variants = (primary?.candidate.value.variants ?? []) as LogoVariantAsset[];
  const positive = variants.find((v) => v.variant === "positive");
  const negative = variants.find((v) => v.variant === "negative");

  if (positive?.imageUrl.includes("svg+xml")) {
    const svg = variantSvgFromDataUrl(positive.imageUrl);
    fs.writeFileSync(`${OUT}/catalogo26-vector-native-positive.svg`, svg);
    await rasterSvgOnBg(svg, "#f5f5f0", `${OUT}/catalogo26-vector-native-light.png`);
  }
  if (negative?.imageUrl.includes("svg+xml")) {
    const svg = variantSvgFromDataUrl(negative.imageUrl);
    fs.writeFileSync(`${OUT}/catalogo26-vector-native-negative.svg`, svg);
    await rasterSvgOnBg(svg, "#1a1a2e", `${OUT}/catalogo26-vector-native-dark.png`);
  }

  let genome = emptyGenome();
  if (process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED === "1") {
    for await (const event of ingestPdfIntoGenome(buffer, CATALOGO26_FILENAME, genome, {
      allowPaidAnalysis: true,
      allowMaterialPrompts: false,
    })) {
      if (event.type === "genome_update") genome = event.genome;
    }
    fs.mkdirSync(path.dirname(PUBLIC_GENOME), { recursive: true });
    fs.writeFileSync(PUBLIC_GENOME, `${JSON.stringify(genome, null, 2)}\n`);
    fs.writeFileSync(
      "fixtures/page-vision-pass/runs/catalogo26-ingest-genome.json",
      `${JSON.stringify(genome, null, 2)}\n`,
    );
  }

  const vectorizeJob = findCrownedLogoVectorizeJob(genome);
  const report = {
    pathFilterDiff: pathAudit
      ? {
          beforeCount: pathAudit.beforeCount,
          afterCount: pathAudit.afterCount,
          rejected,
          acceptedRules: [...new Set(pathAudit.entries.filter((e) => e.decision === "accepted").map((e) => e.rule))],
        }
      : null,
    wordmarkIntegrity: {
      ok: primary?.wordmarkIntegrityOk ?? false,
      detail: integritySignal?.detail ?? null,
    },
    variants: variants.map((v) => ({
      variant: v.variant,
      sourcePageNumber: v.sourcePageNumber,
      assetOrigin: v.assetOrigin,
    })),
    logoPrimary: primary
      ? {
          assetOrigin: primary.candidate.value.assetOrigin,
          persistence: primary.candidate.signals.find((s) => s.kind === "recurrence")?.detail,
          variantCount: variants.length,
        }
      : null,
    identity: {
      emitterBrand: identity.emitterBrand,
      contentNames: identity.contentNames,
      auditPath: AUDIT_PATH,
    },
    voice: {
      tagline: genome.traits["message.tagline"]?.candidates.map((c) => c.value.text) ?? [],
      tone: genome.traits["message.tone"]?.candidates.map((c) => c.value.text) ?? [],
      absolute: genome.traits["claim.absolute"]?.candidates.map((c) => c.value.text) ?? [],
      forbidden: genome.traits["claim.forbidden"]?.candidates.map((c) => c.value.text) ?? [],
    },
    vectorizeGate: {
      jobCreated: Boolean(vectorizeJob),
      blockedReason: vectorizeJob ? null : "vector_native / SVG nativo — fail-closed",
    },
    crowned: Boolean(genome.traits["logo.primary"]?.crownedIds.length),
  };

  fs.writeFileSync(`${OUT}/catalogo26-acceptance-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

void main();
