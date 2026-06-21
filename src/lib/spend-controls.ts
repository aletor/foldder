import { createHash } from "node:crypto";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { UsageProvider, UsageServiceId } from "@/lib/api-usage";
import { ddbClient } from "@/lib/dynamo-utils";
import { withDynamoRetry, isDynamoTransactionConflict, sleepMs } from "@/lib/dynamo-retry";
import {
  WALLET_DDB_TABLE_ENV,
  WalletConfigurationError,
  walletAccountIdForEmail,
} from "@/lib/wallet-ledger";

export const SPEND_CONTROLS_MODE_ENV = "FOLDDER_SPEND_CONTROLS_MODE";
export const SPEND_CONTROLS_ENABLED_ENV = "FOLDDER_SPEND_CONTROLS_ENABLED";
export const SPEND_ACCOUNT_HOURLY_USD_ENV = "FOLDDER_SPEND_ACCOUNT_HOURLY_USD";
export const SPEND_ACCOUNT_DAILY_USD_ENV = "FOLDDER_SPEND_ACCOUNT_DAILY_USD";
export const SPEND_PROVIDER_DAILY_USD_ENV = "FOLDDER_SPEND_PROVIDER_DAILY_USD";
export const SPEND_GLOBAL_DAILY_USD_ENV = "FOLDDER_SPEND_GLOBAL_DAILY_USD";
export const SPEND_GLOBAL_MONTHLY_USD_ENV = "FOLDDER_SPEND_GLOBAL_MONTHLY_USD";
export const SPEND_DISABLED_PROVIDERS_ENV = "FOLDDER_SPEND_DISABLED_PROVIDERS";
export const SPEND_CONTROLS_TABLE_ENV = "FOLDDER_SPEND_CONTROLS_DDB_TABLE";

export type SpendControlMode = "off" | "dry_run" | "enforce";
export type SpendControlWindowKind =
  | "account_hour"
  | "account_day"
  | "provider_day"
  | "global_day"
  | "global_month";

export type SpendControlResult = {
  mode: SpendControlMode;
  operationId: string;
  amountMicros: number;
  provider: UsageProvider;
  accountId: string;
  duplicate: boolean;
  wouldBlock: boolean;
  blockedWindow?: SpendControlWindowKind | "provider_disabled" | "missing_config";
};

export type SpendControlReleaseResult = {
  mode: SpendControlMode;
  operationId: string;
  releaseOperationId: string;
  amountMicros: number;
  provider?: UsageProvider;
  accountId: string;
  duplicate: boolean;
  released: boolean;
  reason?: string;
};

type SpendLimitSet = {
  accountHourlyMicros?: number;
  accountDailyMicros?: number;
  providerDailyMicros?: number;
  globalDailyMicros?: number;
  globalMonthlyMicros?: number;
};

type SpendControlIdempotencyItem = {
  pk: string;
  sk: string;
  entityType: "spend-control-idempotency";
  operationId: string;
  accountId: string;
  provider: UsageProvider;
  result: SpendControlResult;
  counters?: CounterDefinition[];
  createdAt: string;
};

type SpendControlReleaseIdempotencyItem = {
  pk: string;
  sk: string;
  entityType: "spend-control-release-idempotency";
  operationId: string;
  releaseOperationId: string;
  accountId: string;
  provider?: UsageProvider;
  result: SpendControlReleaseResult;
  createdAt: string;
};

type CounterDefinition = {
  kind: SpendControlWindowKind;
  pk: string;
  sk: string;
  limitMicros: number;
  expiresAtEpoch: number;
  windowStart: string;
};

export class SpendControlConfigurationError extends WalletConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = "SpendControlConfigurationError";
  }
}

export class SpendControlLimitExceededError extends Error {
  constructor(
    public windowKind: SpendControlWindowKind,
    public limitMicros: number,
    public amountMicros: number,
    public provider: UsageProvider,
  ) {
    super(`Spend limit exceeded for ${windowKind}.`);
    this.name = "SpendControlLimitExceededError";
  }
}

export class SpendControlProviderDisabledError extends Error {
  constructor(public provider: UsageProvider) {
    super(`Provider disabled by spend controls: ${provider}`);
    this.name = "SpendControlProviderDisabledError";
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function nowIso(date: Date): string {
  return date.toISOString();
}

function spendControlsTableName(): string {
  const tableName =
    process.env[SPEND_CONTROLS_TABLE_ENV]?.trim() ||
    process.env[WALLET_DDB_TABLE_ENV]?.trim();
  if (!tableName) {
    throw new SpendControlConfigurationError(
      `${SPEND_CONTROLS_TABLE_ENV} or ${WALLET_DDB_TABLE_ENV} is required for spend controls.`,
    );
  }
  return tableName;
}

function normalizeEmail(userEmail: string): string {
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new SpendControlConfigurationError("Spend controls require an authenticated user email.");
  }
  return normalized;
}

function normalizeOperationId(operationId: string): string {
  const normalized = operationId.trim();
  if (!normalized) throw new SpendControlConfigurationError("Spend controls require operationId.");
  return normalized;
}

function providerEnvToken(provider: UsageProvider): string {
  return provider.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function readUsdLimitMicros(envName: string): number | undefined {
  const raw = process.env[envName]?.trim();
  if (!raw) return undefined;
  const usd = Number(raw);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new SpendControlConfigurationError(`${envName} must be a positive USD amount.`);
  }
  const micros = Math.floor(usd * 1_000_000);
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    throw new SpendControlConfigurationError(`${envName} is too large or too small.`);
  }
  return micros;
}

function spendControlLimits(provider: UsageProvider): SpendLimitSet {
  const token = providerEnvToken(provider);
  return {
    accountHourlyMicros: readUsdLimitMicros(SPEND_ACCOUNT_HOURLY_USD_ENV),
    accountDailyMicros: readUsdLimitMicros(SPEND_ACCOUNT_DAILY_USD_ENV),
    providerDailyMicros:
      readUsdLimitMicros(`${SPEND_PROVIDER_DAILY_USD_ENV}_${token}`) ??
      readUsdLimitMicros(SPEND_PROVIDER_DAILY_USD_ENV),
    globalDailyMicros: readUsdLimitMicros(SPEND_GLOBAL_DAILY_USD_ENV),
    globalMonthlyMicros: readUsdLimitMicros(SPEND_GLOBAL_MONTHLY_USD_ENV),
  };
}

export function spendControlsMode(): SpendControlMode {
  const raw = process.env[SPEND_CONTROLS_MODE_ENV]?.trim().toLowerCase();
  if (raw === "off" || raw === "dry_run" || raw === "enforce") return raw;
  if (process.env[SPEND_CONTROLS_ENABLED_ENV] === "0") return "off";
  if (process.env[SPEND_CONTROLS_ENABLED_ENV] === "1") return "enforce";
  if (process.env.FOLDDER_SAAS_MODE === "1") return "enforce";
  return "off";
}

function disabledProviders(): Set<string> {
  return new Set(
    (process.env[SPEND_DISABLED_PROVIDERS_ENV] || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isProviderDisabled(provider: UsageProvider): boolean {
  const token = providerEnvToken(provider);
  if (disabledProviders().has(provider)) return true;
  return process.env[`FOLDDER_SPEND_PROVIDER_DISABLED_${token}`] === "1";
}

function assertAmountMicros(amountMicros: number): number {
  const amount = Math.ceil(amountMicros);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new SpendControlConfigurationError("Spend controls require a positive amountMicros.");
  }
  return amount;
}

function requiredLimit(
  limits: SpendLimitSet,
  key: keyof SpendLimitSet,
  envLabel: string,
): number {
  const value = limits[key];
  if (!Number.isSafeInteger(value) || !value || value <= 0) {
    throw new SpendControlConfigurationError(`${envLabel} is required when spend controls are enforced.`);
  }
  return value;
}

function firstSingleOperationLimitBlock(
  amountMicros: number,
  limits: SpendLimitSet,
): { windowKind: SpendControlWindowKind; limitMicros: number } | null {
  const checks: Array<{ windowKind: SpendControlWindowKind; limitMicros?: number }> = [
    { windowKind: "account_hour", limitMicros: limits.accountHourlyMicros },
    { windowKind: "account_day", limitMicros: limits.accountDailyMicros },
    { windowKind: "provider_day", limitMicros: limits.providerDailyMicros },
    { windowKind: "global_day", limitMicros: limits.globalDailyMicros },
    { windowKind: "global_month", limitMicros: limits.globalMonthlyMicros },
  ];
  for (const check of checks) {
    if (check.limitMicros && amountMicros > check.limitMicros) {
      return { windowKind: check.windowKind, limitMicros: check.limitMicros };
    }
  }
  return null;
}

function hourWindow(date: Date): string {
  return `${date.toISOString().slice(0, 13)}Z`;
}

function dayWindow(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthWindow(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function counterDefinitions(input: {
  accountId: string;
  provider: UsageProvider;
  limits: Required<SpendLimitSet>;
  now: Date;
}): CounterDefinition[] {
  const hour = hourWindow(input.now);
  const day = dayWindow(input.now);
  const month = monthWindow(input.now);
  const nowEpoch = epochSeconds(input.now);
  return [
    {
      kind: "account_hour",
      pk: `SPEND#ACCOUNT#${input.accountId}`,
      sk: `HOUR#${hour}`,
      limitMicros: input.limits.accountHourlyMicros,
      expiresAtEpoch: nowEpoch + 3 * 86_400,
      windowStart: hour,
    },
    {
      kind: "account_day",
      pk: `SPEND#ACCOUNT#${input.accountId}`,
      sk: `DAY#${day}`,
      limitMicros: input.limits.accountDailyMicros,
      expiresAtEpoch: nowEpoch + 45 * 86_400,
      windowStart: day,
    },
    {
      kind: "provider_day",
      pk: `SPEND#PROVIDER#${input.provider}`,
      sk: `DAY#${day}`,
      limitMicros: input.limits.providerDailyMicros,
      expiresAtEpoch: nowEpoch + 45 * 86_400,
      windowStart: day,
    },
    {
      kind: "global_day",
      pk: "SPEND#GLOBAL",
      sk: `DAY#${day}`,
      limitMicros: input.limits.globalDailyMicros,
      expiresAtEpoch: nowEpoch + 45 * 86_400,
      windowStart: day,
    },
    {
      kind: "global_month",
      pk: "SPEND#GLOBAL",
      sk: `MONTH#${month}`,
      limitMicros: input.limits.globalMonthlyMicros,
      expiresAtEpoch: nowEpoch + 395 * 86_400,
      windowStart: month,
    },
  ];
}

function idempotencyKey(accountId: string, operationId: string): { pk: string; sk: string } {
  return {
    pk: `SPEND#ACCOUNT#${accountId}`,
    sk: `IDEMPOTENCY#${sha256(operationId)}`,
  };
}

async function getIdempotencyResult(
  tableName: string,
  key: { pk: string; sk: string },
): Promise<SpendControlResult | null> {
  const item = await getIdempotencyItem(tableName, key);
  return item?.result ?? null;
}

async function getIdempotencyItem(
  tableName: string,
  key: { pk: string; sk: string },
): Promise<SpendControlIdempotencyItem | null> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: key,
      }),
    ),
  );
  const item = response.Item as SpendControlIdempotencyItem | undefined;
  return item ?? null;
}

async function getReleaseIdempotencyResult(
  tableName: string,
  key: { pk: string; sk: string },
): Promise<SpendControlReleaseResult | null> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: key,
      }),
    ),
  );
  const item = response.Item as SpendControlReleaseIdempotencyItem | undefined;
  return item?.result ?? null;
}

function cancellationWindowKind(error: unknown): SpendControlWindowKind | null {
  if ((error as { name?: string })?.name !== "TransactionCanceledException") return null;
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  const failedIndex = reasons?.findIndex((reason, index) => index > 0 && reason.Code === "ConditionalCheckFailed");
  if (failedIndex === 1) return "account_hour";
  if (failedIndex === 2) return "account_day";
  if (failedIndex === 3) return "provider_day";
  if (failedIndex === 4) return "global_day";
  if (failedIndex === 5) return "global_month";
  return null;
}

function counterUpdate(params: {
  tableName: string;
  counter: CounterDefinition;
  amountMicros: number;
  accountId: string;
  userEmail: string;
  provider: UsageProvider;
  serviceId?: UsageServiceId;
  route: string;
  operationId: string;
  requestId?: string;
  createdAt: string;
}) {
  return {
    Update: {
      TableName: params.tableName,
      Key: { pk: params.counter.pk, sk: params.counter.sk },
      UpdateExpression: [
        "SET #entityType = if_not_exists(#entityType, :entityType)",
        "#accountId = if_not_exists(#accountId, :accountId)",
        "#userEmail = if_not_exists(#userEmail, :userEmail)",
        "#provider = :provider",
        "#serviceId = :serviceId",
        "#route = :route",
        "#operationId = :operationId",
        "#requestId = :requestId",
        "#windowKind = :windowKind",
        "#windowStart = :windowStart",
        "#limitMicros = :limitMicros",
        "#spentMicros = if_not_exists(#spentMicros, :zero) + :amountMicros",
        "#updatedAt = :now",
        "#createdAt = if_not_exists(#createdAt, :now)",
        "#expiresAtEpoch = :expiresAtEpoch",
      ].join(", "),
      ConditionExpression: "attribute_not_exists(#spentMicros) OR #spentMicros <= :remainingMicros",
      ExpressionAttributeNames: {
        "#accountId": "accountId",
        "#createdAt": "createdAt",
        "#entityType": "entityType",
        "#expiresAtEpoch": "expiresAtEpoch",
        "#limitMicros": "limitMicros",
        "#operationId": "operationId",
        "#provider": "provider",
        "#requestId": "requestId",
        "#route": "route",
        "#serviceId": "serviceId",
        "#spentMicros": "spentMicros",
        "#updatedAt": "updatedAt",
        "#userEmail": "userEmail",
        "#windowKind": "windowKind",
        "#windowStart": "windowStart",
      },
      ExpressionAttributeValues: {
        ":accountId": params.accountId,
        ":amountMicros": params.amountMicros,
        ":entityType": "spend-control-counter",
        ":expiresAtEpoch": params.counter.expiresAtEpoch,
        ":limitMicros": params.counter.limitMicros,
        ":now": params.createdAt,
        ":operationId": params.operationId,
        ":provider": params.provider,
        ":remainingMicros": params.counter.limitMicros - params.amountMicros,
        ":requestId": params.requestId || "",
        ":route": params.route,
        ":serviceId": params.serviceId || "",
        ":userEmail": params.userEmail,
        ":windowKind": params.counter.kind,
        ":windowStart": params.counter.windowStart,
        ":zero": 0,
      },
    },
  };
}

function counterReleaseUpdate(params: {
  tableName: string;
  counter: CounterDefinition;
  amountMicros: number;
  releaseOperationId: string;
  reason?: string;
  createdAt: string;
}) {
  return {
    Update: {
      TableName: params.tableName,
      Key: { pk: params.counter.pk, sk: params.counter.sk },
      UpdateExpression: [
        "SET #spentMicros = #spentMicros - :amountMicros",
        "#updatedAt = :now",
        "#releaseOperationId = :releaseOperationId",
        "#releaseReason = :releaseReason",
      ].join(", "),
      ConditionExpression: "attribute_exists(#spentMicros) AND #spentMicros >= :amountMicros",
      ExpressionAttributeNames: {
        "#releaseOperationId": "releaseOperationId",
        "#releaseReason": "releaseReason",
        "#spentMicros": "spentMicros",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":amountMicros": params.amountMicros,
        ":now": params.createdAt,
        ":releaseOperationId": params.releaseOperationId,
        ":releaseReason": params.reason || "",
      },
    },
  };
}

export async function checkAndRecordSpendControl(input: {
  userEmail: string;
  provider: UsageProvider;
  serviceId?: UsageServiceId;
  route: string;
  amountMicros: number;
  operationId: string;
  requestId?: string;
  now?: Date;
}): Promise<SpendControlResult> {
  const mode = spendControlsMode();
  const amountMicros = assertAmountMicros(input.amountMicros);
  const userEmail = normalizeEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const operationId = normalizeOperationId(input.operationId);
  const resultBase = {
    mode,
    operationId,
    amountMicros,
    provider: input.provider,
    accountId,
    duplicate: false,
  };

  if (mode === "off") {
    return { ...resultBase, wouldBlock: false };
  }

  if (isProviderDisabled(input.provider)) {
    if (mode === "dry_run") {
      console.warn("[spend-controls] provider disabled would block in dry_run", {
        provider: input.provider,
        operationId,
      });
      return { ...resultBase, wouldBlock: true, blockedWindow: "provider_disabled" };
    }
    throw new SpendControlProviderDisabledError(input.provider);
  }

  const limits = spendControlLimits(input.provider);
  const singleOperationBlock = firstSingleOperationLimitBlock(amountMicros, limits);
  if (mode === "dry_run") {
    if (singleOperationBlock) {
      console.warn("[spend-controls] limit would block single operation in dry_run", {
        windowKind: singleOperationBlock.windowKind,
        limitMicros: singleOperationBlock.limitMicros,
        amountMicros,
        provider: input.provider,
        operationId,
      });
      return { ...resultBase, wouldBlock: true, blockedWindow: singleOperationBlock.windowKind };
    }
    return { ...resultBase, wouldBlock: false };
  }

  const requiredLimits: Required<SpendLimitSet> = {
    accountHourlyMicros: requiredLimit(limits, "accountHourlyMicros", SPEND_ACCOUNT_HOURLY_USD_ENV),
    accountDailyMicros: requiredLimit(limits, "accountDailyMicros", SPEND_ACCOUNT_DAILY_USD_ENV),
    providerDailyMicros: requiredLimit(
      limits,
      "providerDailyMicros",
      `${SPEND_PROVIDER_DAILY_USD_ENV} or ${SPEND_PROVIDER_DAILY_USD_ENV}_${providerEnvToken(input.provider)}`,
    ),
    globalDailyMicros: requiredLimit(limits, "globalDailyMicros", SPEND_GLOBAL_DAILY_USD_ENV),
    globalMonthlyMicros: requiredLimit(limits, "globalMonthlyMicros", SPEND_GLOBAL_MONTHLY_USD_ENV),
  };
  const hardBlock = firstSingleOperationLimitBlock(amountMicros, requiredLimits);
  if (hardBlock) {
    throw new SpendControlLimitExceededError(
      hardBlock.windowKind,
      hardBlock.limitMicros,
      amountMicros,
      input.provider,
    );
  }

  const tableName = spendControlsTableName();
  const idempotency = idempotencyKey(accountId, operationId);

  const now = input.now ?? new Date();
  const createdAt = nowIso(now);
  const counters = counterDefinitions({
    accountId,
    provider: input.provider,
    limits: requiredLimits,
    now,
  });
  const result: SpendControlResult = {
    ...resultBase,
    wouldBlock: false,
  };

  const transactItems = [
    {
      Put: {
        TableName: tableName,
        Item: {
          ...idempotency,
          entityType: "spend-control-idempotency",
          operationId,
          accountId,
          provider: input.provider,
          result,
          counters,
          createdAt,
        } satisfies SpendControlIdempotencyItem,
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      },
    },
    ...counters.map((counter) =>
      counterUpdate({
        tableName,
        counter,
        amountMicros,
        accountId,
        userEmail,
        provider: input.provider,
        serviceId: input.serviceId,
        route: input.route,
        operationId,
        requestId: input.requestId,
        createdAt,
      }),
    ),
  ];

  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const replay = await getIdempotencyResult(tableName, idempotency);
    if (replay) return { ...replay, duplicate: true };

    try {
      await withDynamoRetry(() =>
        ddbClient.send(
          new TransactWriteCommand({
            ClientRequestToken: sha256(operationId).slice(0, 32),
            TransactItems: transactItems,
          }),
        ),
      );
      return result;
    } catch (error) {
      const duplicate = await getIdempotencyResult(tableName, idempotency);
      if (duplicate) return { ...duplicate, duplicate: true };
      const windowKind = cancellationWindowKind(error);
      if (windowKind) {
        const counter = counters.find((item) => item.kind === windowKind);
        throw new SpendControlLimitExceededError(
          windowKind,
          counter?.limitMicros ?? 0,
          amountMicros,
          input.provider,
        );
      }
      if (isDynamoTransactionConflict(error) && attempt < maxAttempts) {
        await sleepMs(20 * 2 ** (attempt - 1) + Math.floor(Math.random() * 15));
        continue;
      }
      throw error;
    }
  }

  throw new Error("spend control transaction conflict retries exhausted");
}

export async function releaseSpendControl(input: {
  userEmail: string;
  operationId: string;
  releaseOperationId?: string;
  amountMicros?: number;
  reason?: string;
  now?: Date;
}): Promise<SpendControlReleaseResult> {
  const mode = spendControlsMode();
  const userEmail = normalizeEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const operationId = normalizeOperationId(input.operationId);
  const requestedReleaseMicros =
    input.amountMicros == null ? undefined : assertAmountMicros(input.amountMicros);
  const releaseOperationId = normalizeOperationId(
    input.releaseOperationId ||
      `${operationId}:release:${requestedReleaseMicros == null ? "all" : requestedReleaseMicros}`,
  );

  const noWriteResult: SpendControlReleaseResult = {
    mode,
    operationId,
    releaseOperationId,
    amountMicros: requestedReleaseMicros ?? 0,
    accountId,
    duplicate: false,
    released: false,
    reason: input.reason,
  };
  if (mode === "off" || mode === "dry_run") return noWriteResult;

  const tableName = spendControlsTableName();
  const originalKey = idempotencyKey(accountId, operationId);
  const original = await getIdempotencyItem(tableName, originalKey);
  if (!original || original.result.wouldBlock || original.result.mode !== "enforce") {
    return {
      ...noWriteResult,
      provider: original?.provider,
      amountMicros: requestedReleaseMicros ?? original?.result.amountMicros ?? 0,
    };
  }

  const amountMicros = Math.min(
    requestedReleaseMicros ?? original.result.amountMicros,
    original.result.amountMicros,
  );
  if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) {
    return {
      ...noWriteResult,
      provider: original.provider,
      amountMicros: 0,
    };
  }

  const counters = original.counters || [];
  if (counters.length === 0) {
    return {
      ...noWriteResult,
      provider: original.provider,
      amountMicros,
    };
  }

  const releaseKey = idempotencyKey(accountId, releaseOperationId);
  const existing = await getReleaseIdempotencyResult(tableName, releaseKey);
  if (existing) return { ...existing, duplicate: true };

  const createdAt = nowIso(input.now ?? new Date());
  const result: SpendControlReleaseResult = {
    mode,
    operationId,
    releaseOperationId,
    amountMicros,
    provider: original.provider,
    accountId,
    duplicate: false,
    released: true,
    reason: input.reason,
  };

  try {
    await withDynamoRetry(() =>
      ddbClient.send(
        new TransactWriteCommand({
          ClientRequestToken: sha256(releaseOperationId).slice(0, 32),
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...releaseKey,
                  entityType: "spend-control-release-idempotency",
                  operationId,
                  releaseOperationId,
                  accountId,
                  provider: original.provider,
                  result,
                  createdAt,
                } satisfies SpendControlReleaseIdempotencyItem,
                ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
              },
            },
            ...counters.map((counter) =>
              counterReleaseUpdate({
                tableName,
                counter,
                amountMicros,
                releaseOperationId,
                reason: input.reason,
                createdAt,
              }),
            ),
          ],
        }),
      ),
    );
    return result;
  } catch (error) {
    const duplicate = await getReleaseIdempotencyResult(tableName, releaseKey);
    if (duplicate) return { ...duplicate, duplicate: true };
    throw error;
  }
}
