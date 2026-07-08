#!/usr/bin/env tsx
/**
 * Benchmark del pipeline actual sobre el golden set (Brief 0).
 * Uso: npm run benchmark:logos [-- --doc catalogo26] [-- --no-cache]
 */
import {
  formatBenchmarkTable,
  runLogoBenchmark,
} from "../src/lib/genoma/logo-lab/golden/benchmark";

function parseArgs(argv: string[]): { docId?: string; noCache?: boolean } {
  const options: { docId?: string; noCache?: boolean } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-cache") options.noCache = true;
    if (arg === "--doc" && argv[i + 1]) {
      options.docId = argv[++i];
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  let visionCalls = 0;
  let cacheHits = 0;

  const result = await runLogoBenchmark({
    ...options,
    onVisionCall: () => {
      visionCalls += 1;
      console.error(`[vision] llamada Gemini (${visionCalls})`);
    },
    onVisionCacheHit: (docId) => {
      cacheHits += 1;
      console.error(`[vision] cache hit: ${docId}`);
    },
  });

  console.log(formatBenchmarkTable(result));
  console.error(`\nvision: ${visionCalls} llamadas, ${cacheHits} cache hits`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
