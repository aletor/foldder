import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBillingReadinessReport } from "./billing-readiness";

function setSpendCaps() {
  process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
  process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD = "1";
  process.env.FOLDDER_SPEND_ACCOUNT_DAILY_USD = "5";
  process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD = "25";
  process.env.FOLDDER_SPEND_GLOBAL_DAILY_USD = "100";
  process.env.FOLDDER_SPEND_GLOBAL_MONTHLY_USD = "1000";
}

describe("billing-readiness", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = {};
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it("blocks an empty environment before paid launch", () => {
    const report = getBillingReadinessReport(new Date("2026-06-10T00:00:00.000Z"));

    expect(report.generatedAt).toBe("2026-06-10T00:00:00.000Z");
    expect(report.overallStatus).toBe("blocked");
    expect(report.nextUserAction).toContain("FOLDDER_WALLET_DDB_TABLE");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "wallet-table", status: "blocked" }),
        expect.objectContaining({ id: "stripe-secret-key", status: "blocked" }),
        expect.objectContaining({ id: "stripe-webhook-secret", status: "blocked" }),
      ]),
    );
  });

  it("reports no blocked checks when required server pieces are configured", () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-prod";
    process.env.FOLDDER_WALLET_DDB_WORK_GSI = "gsi1pk-gsi1sk-index";
    process.env.FOLDDER_WALLET_GATE_MODE = "enforce";
    process.env.STRIPE_SECRET_KEY = "sk_live_redacted";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_redacted";
    process.env.FOLDDER_STRIPE_CURRENCY = "usd";
    process.env.FOLDDER_APP_URL = "https://app.foldder.test";
    process.env.FOLDDER_BILLING_NOTIFICATIONS_MODE = "send";
    process.env.FOLDDER_BILLING_EMAIL_FROM = "Foldder <billing@foldder.test>";
    process.env.RESEND_API_KEY = "re_redacted";
    process.env.FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL = "https://hooks.foldder.test/redacted";
    setSpendCaps();

    const report = getBillingReadinessReport();

    expect(report.checks.filter((check) => check.status === "blocked")).toEqual([]);
    expect(report.overallStatus).toBe("warning");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "external-provider-caps",
        status: "warning",
        owner: "manual",
      }),
    );
  });

  it("blocks unsupported non-USD wallet currency", () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-prod";
    process.env.FOLDDER_STRIPE_CURRENCY = "eur";

    const report = getBillingReadinessReport();

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "stripe-currency",
        status: "blocked",
        action: expect.stringContaining("USD"),
      }),
    );
  });

  it("blocks enforce mode when spend cap envs are incomplete", () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-prod";
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD = "1";

    const report = getBillingReadinessReport();

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "spend-controls",
        status: "blocked",
        detail: expect.stringContaining("FOLDDER_SPEND_ACCOUNT_DAILY_USD"),
      }),
    );
  });
});
