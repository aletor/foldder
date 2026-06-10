import { allowedStripeTopupCents, stripeAutomaticTaxEnabled, stripeCurrency } from "@/lib/stripe-billing";
import { walletGateMode } from "@/lib/wallet-api-gate";
import { billingNotificationsMode } from "@/lib/billing-notifications";
import { spendControlsMode } from "@/lib/spend-controls";

export type BillingReadinessStatus = "ready" | "warning" | "blocked";
export type BillingReadinessOwner = "codex" | "user" | "manual";

export type BillingReadinessCheck = {
  id: string;
  label: string;
  status: BillingReadinessStatus;
  owner: BillingReadinessOwner;
  detail: string;
  action?: string;
};

export type BillingReadinessReport = {
  generatedAt: string;
  overallStatus: BillingReadinessStatus;
  nextUserAction: string | null;
  checks: BillingReadinessCheck[];
};

const REQUIRED_SPEND_LIMIT_ENVS = [
  "FOLDDER_SPEND_ACCOUNT_HOURLY_USD",
  "FOLDDER_SPEND_ACCOUNT_DAILY_USD",
  "FOLDDER_SPEND_PROVIDER_DAILY_USD",
  "FOLDDER_SPEND_GLOBAL_DAILY_USD",
  "FOLDDER_SPEND_GLOBAL_MONTHLY_USD",
] as const;

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function value(name: string): string {
  return process.env[name]?.trim() || "";
}

function redactedPresence(name: string): string {
  return present(name) ? `${name} is set` : `${name} is missing`;
}

function hasProductionUrl(): boolean {
  const appUrl = value("FOLDDER_APP_URL") || value("NEXT_PUBLIC_APP_URL");
  if (!appUrl) return false;
  return /^https:\/\//i.test(appUrl) && !/localhost|127\.0\.0\.1/i.test(appUrl);
}

function topupPackageDetail(): string {
  const packages = allowedStripeTopupCents().map((cents) => `$${(cents / 100).toFixed(0)}`);
  return `Top-up packages: ${packages.join(", ")}.`;
}

function checkWallet(): BillingReadinessCheck[] {
  const walletTable = present("FOLDDER_WALLET_DDB_TABLE");
  const mode = walletGateMode();
  return [
    {
      id: "wallet-table",
      label: "Wallet DynamoDB table",
      status: walletTable ? "ready" : "blocked",
      owner: walletTable ? "codex" : "user",
      detail: redactedPresence("FOLDDER_WALLET_DDB_TABLE"),
      action: walletTable ? undefined : "Run Dynamo provisioning and set FOLDDER_WALLET_DDB_TABLE.",
    },
    {
      id: "wallet-work-gsi",
      label: "Wallet work index",
      status: walletTable ? "ready" : "blocked",
      owner: walletTable ? "codex" : "user",
      detail: present("FOLDDER_WALLET_DDB_WORK_GSI")
        ? "FOLDDER_WALLET_DDB_WORK_GSI is set."
        : "Using default wallet work GSI name: gsi1pk-gsi1sk-index.",
      action: walletTable ? undefined : "Provision the wallet table before enabling SaaS billing.",
    },
    {
      id: "wallet-gate",
      label: "Wallet gate mode",
      status: mode === "enforce" ? "ready" : mode === "dry_run" ? "warning" : "blocked",
      owner: mode === "enforce" ? "codex" : "user",
      detail: `walletGateMode=${mode}.`,
      action: mode === "enforce" ? undefined : "Set FOLDDER_WALLET_GATE_MODE=enforce or FOLDDER_SAAS_MODE=1.",
    },
  ];
}

function checkSpendControls(): BillingReadinessCheck[] {
  const mode = spendControlsMode();
  const missing = REQUIRED_SPEND_LIMIT_ENVS.filter((name) => !present(name));
  const invalid = REQUIRED_SPEND_LIMIT_ENVS.filter((name) => {
    const raw = value(name);
    if (!raw) return false;
    const amount = Number(raw);
    return !Number.isFinite(amount) || amount <= 0;
  });
  const blocked = mode === "enforce" && (missing.length > 0 || invalid.length > 0);
  return [
    {
      id: "spend-controls",
      label: "Internal spend caps",
      status: blocked ? "blocked" : mode === "enforce" ? "ready" : "warning",
      owner: blocked || mode !== "enforce" ? "user" : "codex",
      detail:
        mode === "enforce"
          ? missing.length || invalid.length
            ? `Spend controls enforce mode, missing: ${missing.join(", ") || "none"}, invalid: ${invalid.join(", ") || "none"}.`
            : "Spend controls enforce mode with all required caps present."
          : `spendControlsMode=${mode}.`,
      action: blocked || mode !== "enforce"
        ? "Set FOLDDER_SPEND_* caps and enable enforce mode before paid launch."
        : undefined,
    },
    {
      id: "external-provider-caps",
      label: "External provider caps",
      status: "warning",
      owner: "manual",
      detail: "Cannot be verified from code. Must be configured in OpenAI, Google Cloud, Replicate, Runway, Seedance/Ark dashboards.",
      action: "Set provider-side budgets/quotas above internal caps and keep screenshots/notes in the launch checklist.",
    },
  ];
}

function checkStripe(): BillingReadinessCheck[] {
  const currency = stripeCurrency();
  const hasSecret = present("STRIPE_SECRET_KEY");
  const hasWebhook = present("STRIPE_WEBHOOK_SECRET");
  const automaticTax = stripeAutomaticTaxEnabled();
  return [
    {
      id: "stripe-secret-key",
      label: "Stripe secret key",
      status: hasSecret ? "ready" : "blocked",
      owner: "user",
      detail: redactedPresence("STRIPE_SECRET_KEY"),
      action: hasSecret ? undefined : "Create/copy the Stripe restricted secret key into STRIPE_SECRET_KEY.",
    },
    {
      id: "stripe-webhook-secret",
      label: "Stripe webhook signing secret",
      status: hasWebhook ? "ready" : "blocked",
      owner: "user",
      detail: redactedPresence("STRIPE_WEBHOOK_SECRET"),
      action: hasWebhook ? undefined : "Create Stripe webhook endpoint and set STRIPE_WEBHOOK_SECRET.",
    },
    {
      id: "stripe-currency",
      label: "Stripe currency",
      status: currency === "usd" ? "ready" : "blocked",
      owner: currency === "usd" ? "codex" : "user",
      detail: `FOLDDER_STRIPE_CURRENCY=${currency}. Wallet ledger is USD-only right now.`,
      action: currency === "usd" ? undefined : "Use USD for launch or plan a ledger currency migration before paid balances exist.",
    },
    {
      id: "stripe-automatic-tax",
      label: "Stripe automatic tax",
      status: automaticTax ? "ready" : "warning",
      owner: "user",
      detail: `automaticTax=${automaticTax ? "enabled" : "disabled"}.`,
      action: automaticTax
        ? undefined
        : "Configure Stripe Tax head office address, then set FOLDDER_STRIPE_AUTOMATIC_TAX_ENABLED=1 before real paid launch.",
    },
    {
      id: "stripe-topups",
      label: "Stripe top-up packages",
      status: "ready",
      owner: "codex",
      detail: topupPackageDetail(),
    },
    {
      id: "app-url",
      label: "Public app URL",
      status: hasProductionUrl() ? "ready" : "warning",
      owner: "user",
      detail: present("FOLDDER_APP_URL") || present("NEXT_PUBLIC_APP_URL")
        ? "App URL is configured, but production HTTPS should be confirmed before Stripe redirects/webhooks."
        : "FOLDDER_APP_URL/NEXT_PUBLIC_APP_URL is missing.",
      action: hasProductionUrl() ? undefined : "Set FOLDDER_APP_URL to the production HTTPS origin before real Checkout.",
    },
  ];
}

function checkNotificationsAndOps(): BillingReadinessCheck[] {
  const mode = billingNotificationsMode();
  const sendMode = mode === "send";
  return [
    {
      id: "billing-notifications",
      label: "Billing notifications",
      status: sendMode
        ? present("FOLDDER_BILLING_EMAIL_FROM") && present("RESEND_API_KEY")
          ? "ready"
          : "blocked"
        : mode === "log"
          ? "warning"
          : "warning",
      owner: sendMode ? "user" : "user",
      detail: `billingNotificationsMode=${mode}. ${redactedPresence("FOLDDER_BILLING_EMAIL_FROM")}. ${redactedPresence("RESEND_API_KEY")}.`,
      action: sendMode && present("FOLDDER_BILLING_EMAIL_FROM") && present("RESEND_API_KEY")
        ? undefined
        : "Configure Resend sender or keep mode=log for staging.",
    },
    {
      id: "wallet-reconciliation",
      label: "Wallet reconciliation alerts",
      status: present("FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL") ? "ready" : "warning",
      owner: "user",
      detail: redactedPresence("FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL"),
      action: present("FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL")
        ? undefined
        : "Set alert webhook before live traffic so drift is visible.",
    },
  ];
}

function overall(checks: BillingReadinessCheck[]): BillingReadinessStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ready";
}

function nextUserAction(checks: BillingReadinessCheck[]): string | null {
  return checks.find((check) => check.status === "blocked" && check.action)?.action ??
    checks.find((check) => check.status === "warning" && check.action)?.action ??
    null;
}

export function getBillingReadinessReport(now = new Date()): BillingReadinessReport {
  const checks = [
    ...checkWallet(),
    ...checkSpendControls(),
    ...checkStripe(),
    ...checkNotificationsAndOps(),
  ];
  return {
    generatedAt: now.toISOString(),
    overallStatus: overall(checks),
    nextUserAction: nextUserAction(checks),
    checks,
  };
}
