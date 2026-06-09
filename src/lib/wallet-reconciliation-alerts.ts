import type {
  WalletReconciliationIssue,
  WalletReconciliationIssueSeverity,
  WalletReconciliationReport,
} from "@/lib/wallet-reconciliation";

export type WalletReconciliationAlertSeverity =
  | "ok"
  | WalletReconciliationIssueSeverity;

export type WalletReconciliationAlertOptions = {
  environment?: string;
  minSeverity?: WalletReconciliationIssueSeverity;
  alertOnOk?: boolean;
  maxIssues?: number;
};

export type WalletReconciliationAlert = {
  shouldAlert: boolean;
  severity: WalletReconciliationAlertSeverity;
  minSeverity: WalletReconciliationIssueSeverity;
  reason: string;
  text: string;
  payload: {
    event: "foldder.wallet_reconciliation";
    severity: WalletReconciliationAlertSeverity;
    environment: string;
    ok: boolean;
    dryRun: boolean;
    sinceIso: string;
    nowIso: string;
    totals: WalletReconciliationReport["totals"];
    counts: WalletReconciliationReport["counts"];
    issueCounts: Record<WalletReconciliationIssueSeverity, number>;
    topIssues: Array<Pick<WalletReconciliationIssue, "code" | "severity" | "message" | "amountMicros" | "count" | "key">>;
    repairs?: WalletReconciliationReport["repairs"];
  };
};

export type WalletReconciliationAlertDeliveryResult = {
  attempted: boolean;
  sent: boolean;
  severity: WalletReconciliationAlertSeverity;
  status?: number;
  skippedReason?: string;
};

const SEVERITY_RANK: Record<WalletReconciliationAlertSeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  critical: 3,
};

function normalizeIssueSeverity(value: string | undefined): WalletReconciliationIssueSeverity {
  if (value === "info" || value === "warning" || value === "critical") return value;
  return "critical";
}

function environmentName(input?: string): string {
  return (
    input?.trim() ||
    process.env.FOLDDER_WALLET_RECONCILE_ALERT_ENV?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "local"
  );
}

function highestSeverity(issues: WalletReconciliationIssue[]): WalletReconciliationAlertSeverity {
  return issues.reduce<WalletReconciliationAlertSeverity>((highest, issue) => {
    return SEVERITY_RANK[issue.severity] > SEVERITY_RANK[highest] ? issue.severity : highest;
  }, "ok");
}

function issueCounts(issues: WalletReconciliationIssue[]): Record<WalletReconciliationIssueSeverity, number> {
  return issues.reduce<Record<WalletReconciliationIssueSeverity, number>>(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { info: 0, warning: 0, critical: 0 },
  );
}

function formatUsdMicros(micros: number | undefined): string {
  const amount = Number.isFinite(micros) ? Number(micros) : 0;
  const usd = amount / 1_000_000;
  const decimals = Math.abs(usd) >= 1 ? 2 : 6;
  return `$${usd.toFixed(decimals)}`;
}

function compactIssue(issue: WalletReconciliationIssue) {
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    ...(issue.amountMicros != null ? { amountMicros: issue.amountMicros } : {}),
    ...(issue.count != null ? { count: issue.count } : {}),
    ...(issue.key ? { key: issue.key } : {}),
  };
}

function topIssues(
  issues: WalletReconciliationIssue[],
  maxIssues: number,
): Array<ReturnType<typeof compactIssue>> {
  return issues
    .map(compactIssue)
    .sort((a, b) => {
      const rankDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (rankDelta !== 0) return rankDelta;
      return a.code.localeCompare(b.code);
    })
    .slice(0, maxIssues);
}

function repairLine(report: WalletReconciliationReport): string | null {
  const pending = report.repairs?.pendingCaptures;
  const expired = report.repairs?.expiredReservations;
  if (!pending && !expired) return null;
  const parts: string[] = [];
  if (pending) {
    parts.push(
      `pending captures captured=${pending.captured} postponed=${pending.postponed} failed=${pending.failed}`,
    );
  }
  if (expired) {
    parts.push(
      `expired reservations released=${expired.released} skipped=${expired.skipped} failed=${expired.failed}`,
    );
  }
  return `Repairs: ${parts.join("; ")}`;
}

export function buildWalletReconciliationAlert(
  report: WalletReconciliationReport,
  options?: WalletReconciliationAlertOptions,
): WalletReconciliationAlert {
  const severity = highestSeverity(report.issues);
  const minSeverity = normalizeIssueSeverity(
    options?.minSeverity || process.env.FOLDDER_WALLET_RECONCILE_ALERT_MIN_SEVERITY,
  );
  const envAlertOnOk =
    process.env.FOLDDER_WALLET_RECONCILE_ALERT_ON_OK === "1" ||
    process.env.FOLDDER_WALLET_RECONCILE_ALERT_ON_OK === "true";
  const alertOnOk = options?.alertOnOk ?? envAlertOnOk;
  const maxIssues = Math.max(1, Math.min(20, Math.round(options?.maxIssues ?? 8)));
  const counts = issueCounts(report.issues);
  const selectedIssues = topIssues(report.issues, maxIssues);
  const shouldAlert =
    severity === "ok" ? alertOnOk : SEVERITY_RANK[severity] >= SEVERITY_RANK[minSeverity];
  const env = environmentName(options?.environment);
  const mode = report.dryRun ? "dry-run" : "apply";

  const status = severity === "ok" ? "OK" : severity.toUpperCase();
  const lines = [
    `Foldder wallet reconciliation ${status} [${env}]`,
    `Window: ${report.sinceIso} -> ${report.nowIso} (${mode})`,
    `Totals: usage ${formatUsdMicros(report.totals.usageCostMicros)}, captured ${formatUsdMicros(
      report.totals.walletCapturedMicros,
    )}, pending ${formatUsdMicros(report.totals.pendingCaptureMicros)}, expired ${formatUsdMicros(
      report.totals.expiredReservationMicros,
    )}`,
    `Issues: critical=${counts.critical}, warning=${counts.warning}, info=${counts.info}`,
    ...selectedIssues.map((issue) => {
      const amount = issue.amountMicros != null ? ` ${formatUsdMicros(issue.amountMicros)}` : "";
      const count = issue.count != null ? ` count=${issue.count}` : "";
      const key = issue.key ? ` key=${issue.key}` : "";
      return `- ${issue.severity} ${issue.code}${amount}${count}${key}: ${issue.message}`;
    }),
  ];
  const repairs = repairLine(report);
  if (repairs) lines.push(repairs);

  return {
    shouldAlert,
    severity,
    minSeverity,
    reason: shouldAlert
      ? `${severity} >= ${minSeverity}`
      : severity === "ok"
        ? "ok_alert_disabled"
        : `${severity} < ${minSeverity}`,
    text: lines.join("\n"),
    payload: {
      event: "foldder.wallet_reconciliation",
      severity,
      environment: env,
      ok: report.ok,
      dryRun: report.dryRun,
      sinceIso: report.sinceIso,
      nowIso: report.nowIso,
      totals: report.totals,
      counts: report.counts,
      issueCounts: counts,
      topIssues: selectedIssues,
      repairs: report.repairs,
    },
  };
}

function webhookUrl(input?: string): string | undefined {
  return input?.trim() || process.env.FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL?.trim();
}

function assertHttpWebhookUrl(rawUrl: string): void {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Wallet reconciliation alert webhook must be an HTTP(S) URL.");
  }
}

function requestBody(alert: WalletReconciliationAlert): string {
  return JSON.stringify({
    text: alert.text,
    content: alert.text,
    ...alert.payload,
  });
}

export async function sendWalletReconciliationAlert(input: {
  report: WalletReconciliationReport;
  webhookUrl?: string;
  required?: boolean;
  timeoutMs?: number;
  options?: WalletReconciliationAlertOptions;
  fetchImpl?: typeof fetch;
}): Promise<WalletReconciliationAlertDeliveryResult> {
  const alert = buildWalletReconciliationAlert(input.report, input.options);
  if (!alert.shouldAlert) {
    return {
      attempted: false,
      sent: false,
      severity: alert.severity,
      skippedReason: alert.reason,
    };
  }

  const url = webhookUrl(input.webhookUrl);
  if (!url) {
    if (input.required) {
      throw new Error("Wallet reconciliation alert is required, but no webhook URL is configured.");
    }
    return {
      attempted: false,
      sent: false,
      severity: alert.severity,
      skippedReason: "missing_webhook",
    };
  }

  assertHttpWebhookUrl(url);
  const fetcher = input.fetchImpl || fetch;
  const timeoutMs = Math.max(1_000, Math.round(input.timeoutMs ?? 10_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "foldder-wallet-reconciliation/1.0",
      },
      body: requestBody(alert),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Wallet reconciliation alert webhook failed with HTTP ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    return { attempted: true, sent: true, severity: alert.severity, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}
