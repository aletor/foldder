import { loadEnvConfig } from "@next/env";
import { backfillPaidWalletCheckoutSessions } from "../src/lib/stripe-billing";

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
  const days = readNumberArg("days", 30);
  const maxSessions = Math.round(readNumberArg("max-sessions", 1_000));
  const dryRun = process.argv.includes("--dry-run");
  const createdGte = Math.floor(Date.now() / 1000 - days * 86_400);
  const result = await backfillPaidWalletCheckoutSessions({
    createdGte,
    dryRun,
    maxSessions,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[backfill:stripe-wallet] failed:", error);
  process.exitCode = 1;
});
