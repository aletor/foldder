import {
  inferServiceIdFromRecord,
  readUsageRecordsSince,
  type UsageRecordLine,
} from "@/lib/api-usage";
import {
  listExpiredWalletReservations,
  listPendingWalletCaptures,
  releaseExpiredWalletReservations,
  retryPendingWalletCaptures,
  scanWalletAccounts,
  scanWalletLedgerEntries,
  type WalletAccountSnapshot,
  type WalletExpiredReservationReleaseResult,
  type WalletLedgerEntry,
  type WalletPendingCaptureRetryResult,
} from "@/lib/wallet-ledger";

export type WalletReconciliationIssueSeverity = "info" | "warning" | "critical";
export type WalletReconciliationIssueCode =
  | "scan_truncated"
  | "usage_without_wallet_capture"
  | "wallet_capture_without_usage"
  | "expired_reservations"
  | "pending_captures"
  | "negative_wallet_account"
  | "wallet_account_invariant_mismatch"
  | "underreserved_capture";

export type WalletReconciliationIssue = {
  code: WalletReconciliationIssueCode;
  severity: WalletReconciliationIssueSeverity;
  message: string;
  amountMicros?: number;
  count?: number;
  key?: string;
  sample?: unknown;
};

export type WalletReconciliationReport = {
  dryRun: boolean;
  sinceIso: string;
  nowIso: string;
  toleranceMicros: number;
  limits: {
    ledgerScanLimit: number;
    accountScanLimit: number;
    maintenanceLimit: number;
  };
  totals: {
    usageCostMicros: number;
    walletCapturedMicros: number;
    walletReleasedMicros: number;
    walletReservedMicros: number;
    pendingCaptureMicros: number;
    expiredReservationMicros: number;
  };
  counts: {
    usageRecords: number;
    ledgerEntries: number;
    walletAccounts: number;
    pendingCaptures: number;
    expiredReservations: number;
  };
  repairs?: {
    pendingCaptures?: WalletPendingCaptureRetryResult;
    expiredReservations?: WalletExpiredReservationReleaseResult;
  };
  issues: WalletReconciliationIssue[];
  ok: boolean;
};

type Aggregate = {
  key: string;
  userEmail: string;
  provider: string;
  serviceId: string;
  costMicros: number;
  count: number;
};

function usdToMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * 1_000_000);
}

function aggregateKey(input: {
  provider?: string;
  serviceId?: string;
  userEmail?: string;
}): string {
  return [
    (input.userEmail || "unknown@unattributed").trim().toLowerCase(),
    (input.provider || "unknown").trim().toLowerCase(),
    (input.serviceId || "unknown").trim(),
  ].join("::");
}

function aggregateUsage(records: UsageRecordLine[]): Map<string, Aggregate> {
  const map = new Map<string, Aggregate>();
  for (const record of records) {
    if (record.costIsKnown === false) continue;
    const costMicros = usdToMicros(record.costUsd ?? 0);
    if (costMicros <= 0) continue;
    const serviceId = inferServiceIdFromRecord(record);
    const key = aggregateKey({
      userEmail: record.userEmail,
      provider: record.provider,
      serviceId,
    });
    const row =
      map.get(key) ||
      {
        key,
        userEmail: (record.userEmail || "unknown@unattributed").trim().toLowerCase(),
        provider: record.provider,
        serviceId,
        costMicros: 0,
        count: 0,
      };
    row.costMicros += costMicros;
    row.count += 1;
    map.set(key, row);
  }
  return map;
}

function aggregateCaptures(entries: WalletLedgerEntry[]): Map<string, Aggregate> {
  const map = new Map<string, Aggregate>();
  for (const entry of entries) {
    if (entry.type !== "capture") continue;
    const key = aggregateKey({
      userEmail: entry.userEmail,
      provider: entry.provider,
      serviceId: entry.serviceId,
    });
    const row =
      map.get(key) ||
      {
        key,
        userEmail: entry.userEmail,
        provider: entry.provider || "unknown",
        serviceId: entry.serviceId || "unknown",
        costMicros: 0,
        count: 0,
      };
    row.costMicros += entry.amountMicros;
    row.count += 1;
    map.set(key, row);
  }
  return map;
}

function walletAccountIssues(accounts: WalletAccountSnapshot[]): WalletReconciliationIssue[] {
  const issues: WalletReconciliationIssue[] = [];
  for (const account of accounts) {
    if (account.balanceMicros < 0 || account.availableMicros < 0) {
      issues.push({
        code: "negative_wallet_account",
        severity: "critical",
        message: `Wallet account has negative balance or available funds: ${account.userEmail}`,
        amountMicros: Math.min(account.balanceMicros, account.availableMicros),
        key: account.accountId,
        sample: {
          userEmail: account.userEmail,
          balanceMicros: account.balanceMicros,
          reservedMicros: account.reservedMicros,
          availableMicros: account.availableMicros,
        },
      });
    }
    const expectedAvailable = account.balanceMicros - account.reservedMicros;
    if (Math.abs(expectedAvailable - account.availableMicros) > 1) {
      issues.push({
        code: "wallet_account_invariant_mismatch",
        severity: "critical",
        message: `Wallet availableMicros does not equal balanceMicros - reservedMicros: ${account.userEmail}`,
        amountMicros: account.availableMicros - expectedAvailable,
        key: account.accountId,
        sample: {
          userEmail: account.userEmail,
          balanceMicros: account.balanceMicros,
          reservedMicros: account.reservedMicros,
          availableMicros: account.availableMicros,
          expectedAvailableMicros: expectedAvailable,
        },
      });
    }
  }
  return issues;
}

function aggregateDriftIssues(input: {
  usage: Map<string, Aggregate>;
  captures: Map<string, Aggregate>;
  toleranceMicros: number;
}): WalletReconciliationIssue[] {
  const issues: WalletReconciliationIssue[] = [];
  const keys = new Set([...input.usage.keys(), ...input.captures.keys()]);
  for (const key of keys) {
    const usage = input.usage.get(key);
    const capture = input.captures.get(key);
    const usageMicros = usage?.costMicros ?? 0;
    const capturedMicros = capture?.costMicros ?? 0;
    const delta = usageMicros - capturedMicros;
    if (delta > input.toleranceMicros) {
      issues.push({
        code: "usage_without_wallet_capture",
        severity: "critical",
        message: "Recorded API usage exceeds wallet captures for this user/provider/service.",
        amountMicros: delta,
        key,
        sample: { usage, capture },
      });
    } else if (-delta > input.toleranceMicros) {
      issues.push({
        code: "wallet_capture_without_usage",
        severity: "warning",
        message: "Wallet captures exceed recorded API usage for this user/provider/service.",
        amountMicros: -delta,
        key,
        sample: { usage, capture },
      });
    }
  }
  return issues;
}

function underreservedIssues(entries: WalletLedgerEntry[]): WalletReconciliationIssue[] {
  return entries
    .filter((entry) => entry.type === "capture")
    .filter((entry) => {
      const value = entry.metadata?.underreservedMicros;
      return typeof value === "number" && value > 0;
    })
    .slice(0, 50)
    .map((entry) => ({
      code: "underreserved_capture" as const,
      severity: "warning" as const,
      message: "A capture reported actual cost above the reserved maximum.",
      amountMicros: Number(entry.metadata?.underreservedMicros ?? 0),
      key: entry.operationId,
      sample: {
        userEmail: entry.userEmail,
        provider: entry.provider,
        serviceId: entry.serviceId,
        reservationId: entry.reservationId,
        capturedMicros: entry.amountMicros,
        metadata: entry.metadata,
      },
    }));
}

export async function reconcileWallet(input?: {
  dryRun?: boolean;
  sinceIso?: string;
  nowIso?: string;
  toleranceMicros?: number;
  ledgerScanLimit?: number;
  accountScanLimit?: number;
  maintenanceLimit?: number;
}): Promise<WalletReconciliationReport> {
  const dryRun = input?.dryRun !== false;
  const nowIso = input?.nowIso || new Date().toISOString();
  const sinceIso =
    input?.sinceIso || new Date(Date.now() - 7 * 86_400 * 1000).toISOString();
  const toleranceMicros = Math.max(0, Math.round(input?.toleranceMicros ?? 1_000));
  const ledgerScanLimit = Math.max(1, Math.round(input?.ledgerScanLimit ?? 5_000));
  const accountScanLimit = Math.max(1, Math.round(input?.accountScanLimit ?? 5_000));
  const maintenanceLimit = Math.max(1, Math.round(input?.maintenanceLimit ?? 500));

  const usageRecords = await readUsageRecordsSince(sinceIso);
  const ledger = await scanWalletLedgerEntries({ sinceIso, limit: ledgerScanLimit });
  const accounts = await scanWalletAccounts({ limit: accountScanLimit });
  const pendingCaptures = await listPendingWalletCaptures({ limit: maintenanceLimit, nowIso });
  const expiredReservations = await listExpiredWalletReservations({ limit: maintenanceLimit, nowIso });

  const issues: WalletReconciliationIssue[] = [];
  if (ledger.truncated) {
    issues.push({
      code: "scan_truncated",
      severity: "warning",
      message: "Wallet ledger scan reached its limit; reconciliation may be incomplete.",
      count: ledger.entries.length,
      sample: { limit: ledger.limit, scanned: ledger.scanned },
    });
  }
  if (accounts.truncated) {
    issues.push({
      code: "scan_truncated",
      severity: "warning",
      message: "Wallet account scan reached its limit; account invariant checks may be incomplete.",
      count: accounts.accounts.length,
      sample: { limit: accounts.limit, scanned: accounts.scanned },
    });
  }
  if (pendingCaptures.length > 0) {
    issues.push({
      code: "pending_captures",
      severity: "critical",
      message: "There are wallet captures pending retry.",
      count: pendingCaptures.length,
      amountMicros: pendingCaptures.reduce((sum, item) => sum + item.captureMicros, 0),
      sample: pendingCaptures.slice(0, 5),
    });
  }
  if (expiredReservations.length > 0) {
    issues.push({
      code: "expired_reservations",
      severity: "warning",
      message: "There are expired wallet reservations that should be released.",
      count: expiredReservations.length,
      amountMicros: expiredReservations.reduce((sum, item) => sum + item.amountMicros, 0),
      sample: expiredReservations.slice(0, 5),
    });
  }

  const usageAgg = aggregateUsage(usageRecords);
  const captureAgg = aggregateCaptures(ledger.entries);
  issues.push(...aggregateDriftIssues({ usage: usageAgg, captures: captureAgg, toleranceMicros }));
  issues.push(...walletAccountIssues(accounts.accounts));
  issues.push(...underreservedIssues(ledger.entries));

  const repairs = dryRun
    ? undefined
    : {
        pendingCaptures: await retryPendingWalletCaptures({ limit: maintenanceLimit, nowIso }),
        expiredReservations: await releaseExpiredWalletReservations({ limit: maintenanceLimit, nowIso }),
      };

  const walletCapturedMicros = ledger.entries
    .filter((entry) => entry.type === "capture")
    .reduce((sum, entry) => sum + entry.amountMicros, 0);
  const walletReleasedMicros = ledger.entries
    .filter((entry) => entry.type === "release")
    .reduce((sum, entry) => sum + entry.amountMicros, 0);
  const walletReservedMicros = ledger.entries
    .filter((entry) => entry.type === "reserve")
    .reduce((sum, entry) => sum + entry.amountMicros, 0);
  const usageCostMicros = usageRecords.reduce((sum, record) => {
    if (record.costIsKnown === false) return sum;
    return sum + usdToMicros(record.costUsd ?? 0);
  }, 0);

  const report: WalletReconciliationReport = {
    dryRun,
    sinceIso,
    nowIso,
    toleranceMicros,
    limits: { ledgerScanLimit, accountScanLimit, maintenanceLimit },
    totals: {
      usageCostMicros,
      walletCapturedMicros,
      walletReleasedMicros,
      walletReservedMicros,
      pendingCaptureMicros: pendingCaptures.reduce((sum, item) => sum + item.captureMicros, 0),
      expiredReservationMicros: expiredReservations.reduce((sum, item) => sum + item.amountMicros, 0),
    },
    counts: {
      usageRecords: usageRecords.length,
      ledgerEntries: ledger.entries.length,
      walletAccounts: accounts.accounts.length,
      pendingCaptures: pendingCaptures.length,
      expiredReservations: expiredReservations.length,
    },
    repairs,
    issues,
    ok: !issues.some((issue) => issue.severity === "critical"),
  };

  return report;
}
