# SaaS Stripe Connection Runbook

This is the final handoff point before real paid traffic. The code is ready to run without exposing provider keys to the browser, but Stripe cannot be connected safely until the real account, keys, webhook secret, app URL, and sender domain are configured.

## What Is Already Implemented

- Hosted Stripe Checkout sessions for wallet top-ups.
- Server-owned top-up packages.
- `automatic_tax` enabled in Checkout.
- Card-only payment methods for launch.
- Raw-body webhook verification with `stripe.webhooks.constructEvent`.
- Credit is applied only from signed Stripe webhooks.
- Checkout creation fails closed if the wallet DynamoDB ledger is unavailable.
- Refund and dispute clawbacks debit the wallet and flag/restrict the account.
- Billing notifications can run in `off`, `log`, or `send` mode.

## Required Stripe Dashboard Setup

1. Create or choose the Stripe account for Foldder production.
2. Confirm the business profile, tax settings, and payout/bank details.
3. Enable Stripe Tax for Checkout if you intend to use automatic tax.
4. Create the production webhook endpoint:

```text
https://<production-domain>/api/billing/stripe-webhook
```

5. Subscribe the endpoint to these events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
charge.refunded
charge.dispute.created
charge.dispute.funds_withdrawn
```

6. Reveal and copy the webhook signing secret. It starts with `whsec_`.
7. Create/copy the server secret key. For production it starts with `sk_live_`.

## Required Environment

```bash
FOLDDER_APP_URL=https://<production-domain>
NEXT_PUBLIC_APP_URL=https://<production-domain>

FOLDDER_SAAS_MODE=1
FOLDDER_WALLET_GATE_MODE=enforce
FOLDDER_WALLET_DDB_TABLE=foldder-prod-wallet-ledger
FOLDDER_WALLET_DDB_WORK_GSI=gsi1pk-gsi1sk-index

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
FOLDDER_STRIPE_CURRENCY=usd
FOLDDER_STRIPE_TOPUP_AMOUNTS_USD=10,25,50,100,250

FOLDDER_SPEND_CONTROLS_MODE=enforce
FOLDDER_SPEND_ACCOUNT_HOURLY_USD=1
FOLDDER_SPEND_ACCOUNT_DAILY_USD=5
FOLDDER_SPEND_PROVIDER_DAILY_USD=25
FOLDDER_SPEND_GLOBAL_DAILY_USD=100
FOLDDER_SPEND_GLOBAL_MONTHLY_USD=1000
```

Optional but recommended before launch:

```bash
FOLDDER_BILLING_NOTIFICATIONS_MODE=send
FOLDDER_BILLING_EMAIL_FROM="Foldder <billing@yourdomain.com>"
FOLDDER_BILLING_EMAIL_REPLY_TO=support@yourdomain.com
RESEND_API_KEY=re_...

FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL=https://...
FOLDDER_WALLET_RECONCILE_ALERT_MIN_SEVERITY=critical
FOLDDER_WALLET_RECONCILE_ALERT_ENV=production
```

## Readiness Check

After deployment, as an admin:

```bash
curl https://<production-domain>/api/admin/billing-readiness
```

The endpoint returns:

- `overallStatus`
- `nextUserAction`
- individual checks for wallet, spend controls, Stripe, notifications, reconciliation, and manual provider caps

It never returns secret values.

## Manual Checks Before First Real Payment

- Wallet DynamoDB table exists and has the work GSI active.
- Provider-side hard caps/budgets are configured outside Foldder.
- Stripe webhook is using the Dashboard endpoint secret, not a Stripe CLI secret.
- Production app URL is HTTPS and matches the deployed domain.
- A small test top-up credits the wallet exactly once.
- Refreshing/replaying the webhook does not duplicate the credit.
- A cancelled Checkout does not add credit.
- A refund/dispute in Stripe creates the wallet clawback and flags the account.

## Important Currency Decision

The current ledger is USD-only. Stripe Checkout can calculate tax, but wallet balances are stored and displayed as USD micro-units. If Foldder should show EUR to Spanish/EU users, decide before production balances exist. Migrating live wallet balances from USD to EUR later is a financial ledger migration, not just a UI text change.

## Official Stripe References

- [Stripe Checkout](https://docs.stripe.com/payments/checkout)
- [Stripe Tax with Checkout](https://docs.stripe.com/tax/checkout)
- [Webhook signature verification](https://docs.stripe.com/webhooks/signature)
