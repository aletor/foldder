# SaaS Spend Caps

Esta es la pared externa que debe existir aunque el gate interno funcione perfecto.

## Internal Hard Caps

Required in SaaS/enforce mode:

```bash
FOLDDER_SPEND_CONTROLS_MODE=enforce
FOLDDER_SPEND_ACCOUNT_HOURLY_USD=1
FOLDDER_SPEND_ACCOUNT_DAILY_USD=5
FOLDDER_SPEND_PROVIDER_DAILY_USD=25
FOLDDER_SPEND_GLOBAL_DAILY_USD=100
FOLDDER_SPEND_GLOBAL_MONTHLY_USD=1000
```

Provider overrides:

```bash
FOLDDER_SPEND_PROVIDER_DAILY_USD_GEMINI=40
FOLDDER_SPEND_PROVIDER_DAILY_USD_OPENAI=30
FOLDDER_SPEND_PROVIDER_DAILY_USD_RUNWAY=20
FOLDDER_SPEND_PROVIDER_DAILY_USD_REPLICATE=15
FOLDDER_SPEND_PROVIDER_DAILY_USD_VOLCENGINE=20
```

Emergency kill switches:

```bash
FOLDDER_SPEND_DISABLED_PROVIDERS=runway,volcengine
FOLDDER_SPEND_PROVIDER_DISABLED_GEMINI=1
```

Set the global daily cap to the largest loss you accept in one bad day. Set provider caps lower than the provider dashboard cap so Foldder fails first.

## External Provider Caps

- OpenAI: configure organization/project usage limits in the OpenAI Platform limits page.
  Source: https://platform.openai.com/settings/organization/limits
- Google Cloud / Gemini: create Cloud Billing budgets and budget alerts, and pair them with quota caps or an automated billing-disable response. Google budgets notify by default but do not automatically stop spend.
  Source: https://cloud.google.com/billing/docs/how-to/budgets
- AWS app infrastructure: run `npm run budget:app -- --amount-usd <amount> --name foldder-app-monthly-budget`.
- Runway: keep prepaid/autobilling limits conservative in the developer portal and monitor credit consumption.
  Source: https://docs.dev.runwayml.com/guides/pricing/
- Replicate: configure billing from the account billing page and keep internal `FOLDDER_SPEND_PROVIDER_DAILY_USD_REPLICATE` below the external tolerance.
  Source: https://replicate.com/account/billing
- Volcengine / Seedance: configure console billing and quotas for Ark/Seedance. Keep internal `FOLDDER_SPEND_PROVIDER_DAILY_USD_VOLCENGINE` below the external tolerance.
  Source: https://www.volcengine.com/docs/82379

## Launch Rule

Do not enable expensive video generation in production until all three are true:

1. Internal spend controls are `enforce`.
2. Global daily and monthly caps are set.
3. Provider dashboard caps or alerts are configured outside Foldder.

## Wallet Reconciliation Alerts

Run reconciliation on a schedule after the expired-reservation and pending-capture jobs. The full report stays in job logs; alerts only send the compact operational summary.

```bash
FOLDDER_WALLET_RECONCILE_ALERT_WEBHOOK_URL=https://hooks.example.com/...
FOLDDER_WALLET_RECONCILE_ALERT_MIN_SEVERITY=critical
FOLDDER_WALLET_RECONCILE_ALERT_ENV=production
npm run wallet:reconcile:apply
```

Useful options:

```bash
npm run wallet:reconcile -- --dry-run --alert --alert-min-severity warning
npm run wallet:reconcile -- --apply --alert --alert-on-ok
npm run wallet:reconcile -- --apply --no-alert
```

Default behavior is quiet unless a critical issue exists. Set `FOLDDER_WALLET_RECONCILE_ALERT_MIN_SEVERITY=warning` while stabilizing launch, then move it back to `critical` once the job is clean.
