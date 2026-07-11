#!/usr/bin/env npx tsx
/**
 * Diagnóstico: ingesta REAL catalogo26 (sin pageVisionAuditFixture).
 * Emula cwd de Next (.next/server) y captura skipReason / stack de abort.
 */

import fs from "node:fs";
import path from "node:path";
import { loadScriptEnv } from "./load-script-env";
import { ingestPdfIntoGenome } from "../src/lib/brandKit/ingest/pdf-ingest-server";
import { emptyGenome, getTrait } from "../src/lib/brandKit/model/trait";
import { CATALOGO26_FILENAME } from "../src/lib/brandKit/fixtures/brandkit-paths";
import type { LogoValue } from "../src/lib/brandKit/model/trait-values";

const REPO_ROOT = path.resolve(__dirname, "..");
const PDF = path.join(REPO_ROOT, "fixtures/brandkit/catalogo26.pdf");

async function runScenario(name: string, cwd: string, opts: Parameters<typeof ingestPdfIntoGenome>[3]) {
  fs.mkdirSync(cwd, { recursive: true });
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const buffer = fs.readFileSync(PDF);
    let genome = emptyGenome();
    const events: Array<{ type: string; detail?: unknown }> = [];
    for await (const event of ingestPdfIntoGenome(buffer, CATALOGO26_FILENAME, genome, opts)) {
      if (
        event.type === "page_vision_pass" ||
        event.type === "micro" ||
        event.type === "section_resolved"
      ) {
        events.push({ type: event.type, detail: event });
      }
      if (event.type === "genome_update") genome = event.genome;
    }
    const src = genome.sources[0]?.pageVisionPass;
    const trait = getTrait(genome, "logo.primary");
    const crowned = trait?.candidates.find((c) => c.id === trait.crownedIds?.[0]);
    const logo = crowned?.value as LogoValue | undefined;
    return {
      name,
      cwd: process.cwd(),
      skipReason: src?.skipReason ?? null,
      status: src?.status ?? null,
      summary: src?.summary ?? null,
      logoLabel: logo?.label ?? null,
      logoOrigin: logo?.assetOrigin ?? null,
      events,
    };
  } catch (error) {
    return {
      name,
      cwd: process.cwd(),
      thrown: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    };
  } finally {
    process.chdir(prev);
  }
}

async function main() {
  loadScriptEnv();
  const scenarios = [
    { name: "repo-root-real", cwd: REPO_ROOT, opts: { allowPaidAnalysis: true, allowMaterialPrompts: false } },
    {
      name: "next-server-cwd-real",
      cwd: path.join(REPO_ROOT, ".next/server"),
      opts: { allowPaidAnalysis: true, allowMaterialPrompts: false },
    },
    {
      name: "no-api-key",
      cwd: REPO_ROOT,
      opts: { allowPaidAnalysis: true, allowMaterialPrompts: false },
      env: { GEMINI_API_KEY: "", GOOGLE_API_KEY: "" },
    },
    {
      name: "flags-off",
      cwd: REPO_ROOT,
      opts: { allowPaidAnalysis: true, allowMaterialPrompts: false },
      env: { BRAND_KIT_PAGE_VISION_PASS_ENABLED: "0", BRAND_KIT_PAGE_VISION_NIVEL1: "0" },
    },
  ] as const;

  for (const s of scenarios) {
    const saved: Record<string, string | undefined> = {};
    if ("env" in s && s.env) {
      for (const [k, v] of Object.entries(s.env)) {
        saved[k] = process.env[k];
        if (v === "") delete process.env[k];
        else process.env[k] = v;
      }
    }
    const result = await runScenario(s.name, s.cwd, s.opts);
    console.log(JSON.stringify(result, null, 2));
    if ("env" in s && s.env) {
      for (const [k] of Object.entries(s.env)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  }
}

void main();
