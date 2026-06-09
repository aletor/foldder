import { describe, expect, it, vi } from "vitest";
import {
  buildWalletReconciliationAlert,
  sendWalletReconciliationAlert,
} from "./wallet-reconciliation-alerts";
import type { WalletReconciliationReport } from "./wallet-reconciliation";

function report(overrides?: Partial<WalletReconciliationReport>): WalletReconciliationReport {
  return {
    dryRun: true,
    sinceIso: "2026-06-09T00:00:00.000Z",
    nowIso: "2026-06-09T11:00:00.000Z",
    toleranceMicros: 1_000,
    limits: { ledgerScanLimit: 5_000, accountScanLimit: 5_000, maintenanceLimit: 500 },
    totals: {
      usageCostMicros: 12_000,
      walletCapturedMicros: 10_000,
      walletReleasedMicros: 0,
      walletReservedMicros: 20_000,
      pendingCaptureMicros: 5_000,
      expiredReservationMicros: 7_000,
    },
    counts: {
      usageRecords: 1,
      ledgerEntries: 2,
      walletAccounts: 1,
      pendingCaptures: 1,
      expiredReservations: 1,
    },
    issues: [
      {
        code: "usage_without_wallet_capture",
        severity: "critical",
        message: "Recorded API usage exceeds wallet captures.",
        amountMicros: 2_000,
        key: "creator@example.com::gemini::gemini-nano",
        sample: { secretish: "not included" },
      },
      {
        code: "expired_reservations",
        severity: "warning",
        message: "Expired reservations should be released.",
        amountMicros: 7_000,
        count: 1,
      },
    ],
    ok: false,
    ...overrides,
  };
}

describe("wallet-reconciliation-alerts", () => {
  it("builds a compact critical alert without leaking issue samples", () => {
    const alert = buildWalletReconciliationAlert(report(), {
      environment: "production",
    });

    expect(alert.shouldAlert).toBe(true);
    expect(alert.severity).toBe("critical");
    expect(alert.payload.environment).toBe("production");
    expect(alert.payload.issueCounts).toMatchObject({ critical: 1, warning: 1, info: 0 });
    expect(alert.text).toContain("Foldder wallet reconciliation CRITICAL [production]");
    expect(alert.text).toContain("usage_without_wallet_capture $0.002000");
    expect(JSON.stringify(alert.payload)).not.toContain("secretish");
  });

  it("keeps warning-only reports quiet unless the minimum severity includes warning", () => {
    const warningReport = report({
      ok: true,
      issues: [
        {
          code: "expired_reservations",
          severity: "warning",
          message: "Expired reservations should be released.",
          count: 1,
        },
      ],
    });

    expect(buildWalletReconciliationAlert(warningReport).shouldAlert).toBe(false);
    expect(
      buildWalletReconciliationAlert(warningReport, { minSeverity: "warning" }).shouldAlert,
    ).toBe(true);
  });

  it("sends Slack-compatible and generic webhook JSON when an alert should fire", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("ok"),
    });

    const result = await sendWalletReconciliationAlert({
      report: report(),
      webhookUrl: "https://hooks.example.test/foldder",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      options: { environment: "production" },
    });

    expect(result).toMatchObject({ attempted: true, sent: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hooks.example.test/foldder",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text).toContain("Foldder wallet reconciliation CRITICAL");
    expect(body.content).toBe(body.text);
    expect(body.event).toBe("foldder.wallet_reconciliation");
  });

  it("fails explicitly when alerts are required but no webhook is configured", async () => {
    await expect(
      sendWalletReconciliationAlert({
        report: report(),
        required: true,
      }),
    ).rejects.toThrow("no webhook URL");
  });

  it("rejects non-http webhook URLs", async () => {
    await expect(
      sendWalletReconciliationAlert({
        report: report(),
        webhookUrl: "file:///tmp/alert.json",
      }),
    ).rejects.toThrow("HTTP(S)");
  });
});
