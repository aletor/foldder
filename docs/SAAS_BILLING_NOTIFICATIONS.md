# SaaS Billing Notifications

Foldder sends billing notifications only after the server has committed the money event to the wallet ledger. Emails never credit, debit, reserve, or unlock access; they only explain what already happened.

## Modes

`FOLDDER_BILLING_NOTIFICATIONS_MODE`

- `off`: default when no email provider is configured. No Dynamo claim, no email.
- `log`: records idempotency in the wallet table and logs the notification. Useful for staging.
- `send`: records idempotency in the wallet table and sends email through Resend.

If `FOLDDER_BILLING_NOTIFICATIONS_MODE` is unset and `RESEND_API_KEY` is present, the mode becomes `send`.

## Required Env For Send

```bash
FOLDDER_BILLING_NOTIFICATIONS_MODE=send
FOLDDER_WALLET_DDB_TABLE=foldder-prod-wallet-ledger
FOLDDER_BILLING_EMAIL_FROM="Foldder <billing@yourdomain.com>"
RESEND_API_KEY=re_...
```

Optional:

```bash
FOLDDER_BILLING_EMAIL_REPLY_TO=support@yourdomain.com
FOLDDER_WALLET_LOW_BALANCE_USD=2
```

## Events

- `wallet_topup_confirmed`: sent after a signed Stripe webhook credits a paid Checkout session.
- `billing_review_required`: sent after a refund/dispute clawback is applied to the wallet.
- `wallet_low_balance`: sent after a successful capture leaves available balance below the configured threshold.
- `wallet_operation_blocked`: sent when the wallet reserve fails because available balance cannot cover the maximum reservation.

## Idempotency

Notifications are stored in the wallet DynamoDB table with:

- `pk = BILLING_NOTIFICATION#<accountId>`
- `sk = NOTICE#<kind>#<dedupeHash>`

Dedupe windows:

- Top-up: one email per Stripe Checkout session.
- Review: one email per Stripe refund/dispute object.
- Low balance: one email per user per day.
- Blocked operation: one email per user per route per hour.

If email sending fails, the notification record is marked `failed` so a later attempt can claim it again.
