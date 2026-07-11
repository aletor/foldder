import fs from "node:fs";
import path from "node:path";

/** PDFs del golden set (gitignored). Override con GOLDEN_SET_DIR. */
export function goldenSetDir(): string {
  const env = process.env.GOLDEN_SET_DIR?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "golden-set");
}

export const GOLDEN_MANIFEST_PATH = path.join(
  process.cwd(),
  "src/lib/brandKit/logo-lab/golden/manifest.json",
);

export const BENCHMARK_RUNS_DIR = path.join(process.cwd(), "benchmark-runs");

/** Cache de audits de visión (gitignored). Clave = sha256 + versión prompt. */
export function visionCacheDir(): string {
  const env = process.env.VISION_CACHE_DIR?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "vision-cache");
}

export function resolveGoldenPdfPath(fileName: string): string {
  return path.join(goldenSetDir(), fileName);
}

export function goldenPdfExists(fileName: string): boolean {
  return fs.existsSync(resolveGoldenPdfPath(fileName));
}
