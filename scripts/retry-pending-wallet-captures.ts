import { loadEnvConfig } from "@next/env";
import { retryPendingWalletCaptures } from "../src/lib/wallet-ledger";

loadEnvConfig(process.cwd());

function readArg(name: string): string | undefined {
  const idx = process.argv.findIndex((value) => value === `--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function readNumberArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --${name} value: ${raw}`);
  }
  return value;
}

async function main(): Promise<void> {
  const result = await retryPendingWalletCaptures({
    dryRun: process.argv.includes("--dry-run"),
    limit: Math.round(readNumberArg("limit", 100)),
    nowIso: readArg("now"),
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[wallet:retry-captures] failed:", error);
  process.exitCode = 1;
});
