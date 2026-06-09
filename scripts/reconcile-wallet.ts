import { loadEnvConfig } from "@next/env";
import {
  sendWalletReconciliationAlert,
  type WalletReconciliationAlertOptions,
} from "../src/lib/wallet-reconciliation-alerts";
import { reconcileWallet } from "../src/lib/wallet-reconciliation";

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

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readAlertOptions(): WalletReconciliationAlertOptions {
  return {
    environment: readArg("alert-environment"),
    minSeverity: readArg("alert-min-severity") as WalletReconciliationAlertOptions["minSeverity"],
    alertOnOk: hasFlag("alert-on-ok") ? true : undefined,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const report = await reconcileWallet({
    dryRun: !apply,
    sinceIso: readArg("since"),
    nowIso: readArg("now"),
    toleranceMicros: Math.round(readNumberArg("tolerance-micros", 1_000)),
    ledgerScanLimit: Math.round(readNumberArg("ledger-limit", 5_000)),
    accountScanLimit: Math.round(readNumberArg("account-limit", 5_000)),
    maintenanceLimit: Math.round(readNumberArg("maintenance-limit", 500)),
  });

  console.log(JSON.stringify(report, null, 2));
  const alertRequested =
    hasFlag("alert") ||
    Boolean(process.env.FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL?.trim());
  let alertFailed = false;
  if (alertRequested && !hasFlag("no-alert")) {
    try {
      const result = await sendWalletReconciliationAlert({
        report,
        webhookUrl: readArg("alert-webhook-url"),
        required: hasFlag("alert"),
        options: readAlertOptions(),
      });
      if (result.sent) {
        console.error(`[wallet:reconcile] alert sent severity=${result.severity} status=${result.status}`);
      } else {
        console.error(
          `[wallet:reconcile] alert skipped severity=${result.severity} reason=${result.skippedReason}`,
        );
      }
    } catch (error) {
      alertFailed = true;
      console.error("[wallet:reconcile] alert failed:", error);
    }
  }
  if (!report.ok) process.exitCode = 1;
  if (alertFailed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[wallet:reconcile] failed:", error);
  process.exitCode = 1;
});
