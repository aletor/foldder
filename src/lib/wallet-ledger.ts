import { createHash, randomUUID } from "node:crypto";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbClient } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";
import type { UsageServiceId } from "@/lib/api-usage";

export const WALLET_DDB_TABLE_ENV = "FOLDDER_WALLET_DDB_TABLE";
export const WALLET_DDB_WORK_GSI_ENV = "FOLDDER_WALLET_DDB_WORK_GSI";
export const WALLET_CURRENCY = "usd";

export type WalletLedgerEntryType =
  | "purchase"
  | "reserve"
  | "capture"
  | "release"
  | "refund"
  | "adjustment"
  | "grant";

export type WalletAccountStatus = "active" | "blocked";

export type WalletAccountSnapshot = {
  accountId: string;
  userEmail: string;
  currency: typeof WALLET_CURRENCY;
  status: WalletAccountStatus;
  balanceMicros: number;
  reservedMicros: number;
  availableMicros: number;
  billingReviewRequired?: boolean;
  billingReviewReason?: string;
  billingReviewUpdatedAt?: string;
  billingClawbackMicros?: number;
  billingClawbackCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type WalletReservationStatus = "reserved" | "captured" | "released";

export type WalletReservation = {
  accountId: string;
  userEmail: string;
  reservationId: string;
  status: WalletReservationStatus;
  amountMicros: number;
  capturedMicros: number;
  releasedMicros: number;
  serviceId?: UsageServiceId;
  provider?: string;
  route?: string;
  requestId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type WalletMutationResult = {
  accountId: string;
  userEmail: string;
  operationId: string;
  ledgerEntryId: string;
  duplicate: boolean;
};

export type WalletCreditResult = WalletMutationResult & {
  type: Exclude<WalletLedgerEntryType, "reserve" | "capture" | "release">;
  amountMicros: number;
};

export type WalletDebitResult = WalletMutationResult & {
  type: "refund" | "adjustment";
  amountMicros: number;
  accountFlagged: boolean;
  accountBlocked: boolean;
};

export type WalletReserveResult = WalletMutationResult & {
  type: "reserve";
  reservationId: string;
  amountMicros: number;
};

export type WalletCaptureResult = WalletMutationResult & {
  type: "capture";
  reservationId: string;
  reservedMicros: number;
  capturedMicros: number;
  releasedMicros: number;
};

export type WalletReleaseResult = WalletMutationResult & {
  type: "release";
  reservationId: string;
  releasedMicros: number;
  reason?: string;
};

export type WalletProviderJobLink = {
  provider: string;
  providerJobId: string;
  accountId: string;
  userEmail: string;
  reservationId: string;
  reservedMicros: number;
  serviceId?: UsageServiceId;
  route?: string;
  operationId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: WalletLedgerMetadata;
};

export type WalletLedgerEntry = {
  entryId: string;
  type: WalletLedgerEntryType;
  accountId: string;
  userEmail: string;
  currency: typeof WALLET_CURRENCY;
  amountMicros: number;
  balanceDeltaMicros: number;
  reservedDeltaMicros: number;
  availableDeltaMicros: number;
  reservationId?: string;
  serviceId?: UsageServiceId;
  provider?: string;
  route?: string;
  requestId?: string;
  operationId: string;
  metadata?: WalletLedgerMetadata;
  createdAt: string;
};

type WalletTableInput = {
  tableName?: string;
  workGsiName?: string;
};

export type WalletLedgerMetadata = Record<string, unknown>;

export type WalletPendingCaptureStatus = "open" | "settled" | "failed";

export type WalletPendingCapture = {
  accountId: string;
  userEmail: string;
  reservationId: string;
  captureMicros: number;
  operationId: string;
  providerCostId?: string;
  metadata?: WalletLedgerMetadata;
  status: WalletPendingCaptureStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lastError?: string;
  failureReason?: string;
};

export type WalletExpiredReservationReleaseResult = {
  dryRun: boolean;
  checked: number;
  released: number;
  skipped: number;
  failed: number;
  reservations: Array<{
    reservationId: string;
    userEmail: string;
    amountMicros: number;
    expiresAt?: string;
    action: "would_release" | "released" | "skipped" | "failed";
    error?: string;
  }>;
};

export type WalletPendingCaptureRetryResult = {
  dryRun: boolean;
  checked: number;
  captured: number;
  postponed: number;
  failed: number;
  pendingCaptures: Array<{
    reservationId: string;
    userEmail: string;
    captureMicros: number;
    operationId: string;
    action: "would_capture" | "captured" | "postponed" | "failed";
    error?: string;
  }>;
};

export type WalletLedgerScanResult = {
  limit: number;
  scanned: number;
  truncated: boolean;
  entries: WalletLedgerEntry[];
};

export type WalletAccountScanResult = {
  limit: number;
  scanned: number;
  truncated: boolean;
  accounts: WalletAccountSnapshot[];
};

export type WalletLedgerAccountEntriesResult = {
  accountId: string;
  userEmail: string;
  currency: typeof WALLET_CURRENCY;
  limit: number;
  truncated: boolean;
  entries: WalletLedgerEntry[];
};

export class WalletConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletConfigurationError";
  }
}

export class WalletValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletValidationError";
  }
}

export class WalletInsufficientFundsError extends Error {
  constructor(
    public amountMicros: number,
    message = "Saldo insuficiente para reservar la operación.",
  ) {
    super(message);
    this.name = "WalletInsufficientFundsError";
  }
}

export class WalletReservationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletReservationStateError";
  }
}

type IdempotencyItem<T> = {
  pk: string;
  sk: string;
  entityType: "wallet-idempotency";
  accountId: string;
  userEmail: string;
  operationKind: string;
  operationId: string;
  result: T;
  createdAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeWalletEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new WalletValidationError("Wallet user email is required.");
  }
  return normalized;
}

export function walletAccountIdForEmail(email: string): string {
  return `acct_${sha256(normalizeWalletEmail(email)).slice(0, 32)}`;
}

function accountPk(accountId: string): string {
  return `WALLET#${accountId}`;
}

function ledgerSk(createdAt: string, entryId: string): string {
  return `LEDGER#${createdAt}#${entryId}`;
}

function idempotencySk(operationKind: string, operationId: string): string {
  return `IDEMPOTENCY#${operationKind}#${sha256(operationId)}`;
}

function reservationSk(reservationId: string): string {
  return `RESERVATION#${reservationId}`;
}

function providerJobPk(provider: string, providerJobId: string): string {
  return `PROVIDER_JOB#${provider}#${sha256(providerJobId)}`;
}

function pendingCapturePk(accountId: string): string {
  return `WALLET_PENDING_CAPTURE#${accountId}`;
}

function pendingCaptureSk(operationId: string): string {
  return `CAPTURE#${sha256(operationId)}`;
}

const RESERVED_RESERVATION_WORK_PK = "WALLET_RESERVATION#reserved";
const PENDING_CAPTURE_WORK_PK = "WALLET_PENDING_CAPTURE#open";

function ledgerEntryId(): string {
  return `led_${randomUUID()}`;
}

function stableClientRequestToken(operationId: string): string {
  return sha256(operationId).slice(0, 32);
}

function walletTableName(input?: WalletTableInput): string {
  const tableName = input?.tableName?.trim() || process.env[WALLET_DDB_TABLE_ENV]?.trim();
  if (!tableName) {
    throw new WalletConfigurationError(`${WALLET_DDB_TABLE_ENV} is required for wallet ledger operations.`);
  }
  return tableName;
}

function walletWorkGsiName(input?: WalletTableInput): string {
  return input?.workGsiName?.trim() || process.env[WALLET_DDB_WORK_GSI_ENV]?.trim() || "gsi1pk-gsi1sk-index";
}

function assertMicros(amountMicros: number, label: string): void {
  if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) {
    throw new WalletValidationError(`${label} must be a positive safe integer in micro-USD.`);
  }
}

function normalizeOperationId(operationId: string): string {
  const normalized = operationId.trim();
  if (!normalized) throw new WalletValidationError("operationId is required.");
  return normalized;
}

function compactMetadata(metadata: WalletLedgerMetadata | undefined): WalletLedgerMetadata | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}

function workIndexAttributes(workPk: string, workSk: string): { gsi1pk: string; gsi1sk: string } {
  return {
    gsi1pk: workPk,
    gsi1sk: workSk,
  };
}

function isoAfterMs(ms: number, from = new Date()): string {
  return new Date(from.getTime() + Math.max(0, ms)).toISOString();
}

function errorSummary(error: unknown, max = 500): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, max);
  return String(error).slice(0, max);
}

function baseAccountUpdateNames(): Record<string, string> {
  return {
    "#accountId": "accountId",
    "#available": "availableMicros",
    "#balance": "balanceMicros",
    "#createdAt": "createdAt",
    "#currency": "currency",
    "#entityType": "entityType",
    "#reserved": "reservedMicros",
    "#status": "status",
    "#updatedAt": "updatedAt",
    "#userEmail": "userEmail",
  };
}

function existingAccountBalanceNames(): Record<string, string> {
  return {
    "#available": "availableMicros",
    "#balance": "balanceMicros",
    "#currency": "currency",
    "#reserved": "reservedMicros",
    "#status": "status",
    "#updatedAt": "updatedAt",
  };
}

function existingAccountReservationNames(): Record<string, string> {
  return {
    "#available": "availableMicros",
    "#currency": "currency",
    "#reserved": "reservedMicros",
    "#status": "status",
    "#updatedAt": "updatedAt",
  };
}

async function getIdempotencyResult<T>(
  tableName: string,
  pk: string,
  sk: string,
): Promise<T | null> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk, sk },
      }),
    ),
  );
  const item = response.Item as IdempotencyItem<T> | undefined;
  return item?.result ?? null;
}

function isConditionalTransactionCancel(error: unknown, itemIndex: number): boolean {
  if ((error as { name?: string })?.name !== "TransactionCanceledException") return false;
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  return reasons?.[itemIndex]?.Code === "ConditionalCheckFailed";
}

async function sendIdempotentTransaction<T extends WalletMutationResult>(params: {
  tableName: string;
  pk: string;
  operationKind: string;
  operationId: string;
  transactItems: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]>;
  result: T;
  insufficientFundsIndex?: number;
}): Promise<T> {
  const idemSk = idempotencySk(params.operationKind, params.operationId);
  const existing = await getIdempotencyResult<T>(params.tableName, params.pk, idemSk);
  if (existing) return { ...existing, duplicate: true };

  try {
    await withDynamoRetry(() =>
      ddbClient.send(
        new TransactWriteCommand({
          ClientRequestToken: stableClientRequestToken(params.operationId),
          TransactItems: params.transactItems,
        }),
      ),
    );
    return params.result;
  } catch (error) {
    const duplicate = await getIdempotencyResult<T>(params.tableName, params.pk, idemSk);
    if (duplicate) return { ...duplicate, duplicate: true };
    if (
      params.insufficientFundsIndex != null &&
      isConditionalTransactionCancel(error, params.insufficientFundsIndex)
    ) {
      throw new WalletInsufficientFundsError(
        "amountMicros" in params.result ? Number(params.result.amountMicros) : 0,
      );
    }
    throw error;
  }
}

function idempotencyPut<T extends WalletMutationResult>(params: {
  tableName: string;
  pk: string;
  operationKind: string;
  operationId: string;
  result: T;
  createdAt: string;
}) {
  return {
    Put: {
      TableName: params.tableName,
      Item: {
        pk: params.pk,
        sk: idempotencySk(params.operationKind, params.operationId),
        entityType: "wallet-idempotency",
        accountId: params.result.accountId,
        userEmail: params.result.userEmail,
        operationKind: params.operationKind,
        operationId: params.operationId,
        result: params.result,
        createdAt: params.createdAt,
      } satisfies IdempotencyItem<T>,
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    },
  };
}

function ledgerPut(params: {
  tableName: string;
  pk: string;
  sk: string;
  entryId: string;
  type: WalletLedgerEntryType;
  accountId: string;
  userEmail: string;
  amountMicros: number;
  operationId: string;
  createdAt: string;
  balanceDeltaMicros: number;
  reservedDeltaMicros: number;
  availableDeltaMicros: number;
  reservationId?: string;
  serviceId?: UsageServiceId;
  provider?: string;
  route?: string;
  requestId?: string;
  metadata?: WalletLedgerMetadata;
}) {
  return {
    Put: {
      TableName: params.tableName,
      Item: {
        pk: params.pk,
        sk: params.sk,
        entityType: "wallet-ledger-entry",
        entryId: params.entryId,
        type: params.type,
        accountId: params.accountId,
        userEmail: params.userEmail,
        currency: WALLET_CURRENCY,
        amountMicros: params.amountMicros,
        balanceDeltaMicros: params.balanceDeltaMicros,
        reservedDeltaMicros: params.reservedDeltaMicros,
        availableDeltaMicros: params.availableDeltaMicros,
        reservationId: params.reservationId,
        serviceId: params.serviceId,
        provider: params.provider,
        route: params.route,
        requestId: params.requestId,
        operationId: params.operationId,
        metadata: compactMetadata(params.metadata),
        createdAt: params.createdAt,
      },
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    },
  };
}

export async function getWalletAccount(
  userEmail: string,
  options?: WalletTableInput,
): Promise<WalletAccountSnapshot> {
  const tableName = walletTableName(options);
  const normalizedEmail = normalizeWalletEmail(userEmail);
  const accountId = walletAccountIdForEmail(normalizedEmail);
  const createdAt = nowIso();
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: accountPk(accountId), sk: "ACCOUNT" },
      }),
    ),
  );
  const item = response.Item as Partial<WalletAccountSnapshot> | undefined;
  return {
    accountId,
    userEmail: normalizedEmail,
    currency: WALLET_CURRENCY,
    status: item?.status === "blocked" ? "blocked" : "active",
    balanceMicros: Number(item?.balanceMicros ?? 0),
    reservedMicros: Number(item?.reservedMicros ?? 0),
    availableMicros: Number(item?.availableMicros ?? 0),
    billingReviewRequired: item?.billingReviewRequired === true ? true : undefined,
    billingReviewReason:
      typeof item?.billingReviewReason === "string" ? item.billingReviewReason : undefined,
    billingReviewUpdatedAt:
      typeof item?.billingReviewUpdatedAt === "string" ? item.billingReviewUpdatedAt : undefined,
    billingClawbackMicros:
      Number.isFinite(Number(item?.billingClawbackMicros)) ? Number(item?.billingClawbackMicros) : undefined,
    billingClawbackCount:
      Number.isFinite(Number(item?.billingClawbackCount)) ? Number(item?.billingClawbackCount) : undefined,
    createdAt: String(item?.createdAt ?? createdAt),
    updatedAt: String(item?.updatedAt ?? createdAt),
  };
}

function scanLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(Math.round(limit ?? 2_000), 20_000));
}

export async function scanWalletLedgerEntries(input?: WalletTableInput & {
  limit?: number;
  sinceIso?: string;
}): Promise<WalletLedgerScanResult> {
  const tableName = walletTableName(input);
  const limit = scanLimit(input?.limit);
  const entries: WalletLedgerEntry[] = [];
  let scanned = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
          FilterExpression: input?.sinceIso
            ? "#entityType = :entityType AND #createdAt >= :sinceIso"
            : "#entityType = :entityType",
          ExpressionAttributeNames: {
            "#entityType": "entityType",
            ...(input?.sinceIso ? { "#createdAt": "createdAt" } : {}),
          },
          ExpressionAttributeValues: {
            ":entityType": "wallet-ledger-entry",
            ...(input?.sinceIso ? { ":sinceIso": input.sinceIso } : {}),
          },
          Limit: Math.min(1_000, limit - entries.length),
        }),
      ),
    );
    scanned += response.ScannedCount ?? 0;
    entries.push(...((response.Items || []) as WalletLedgerEntry[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey && entries.length < limit);

  return {
    limit,
    scanned,
    truncated: Boolean(exclusiveStartKey),
    entries: entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function listWalletLedgerEntriesForAccount(
  userEmail: string,
  input?: WalletTableInput & {
    limit?: number;
    beforeIso?: string;
  },
): Promise<WalletLedgerAccountEntriesResult> {
  const tableName = walletTableName(input);
  const normalizedEmail = normalizeWalletEmail(userEmail);
  const accountId = walletAccountIdForEmail(normalizedEmail);
  const limit = scanLimit(input?.limit);
  const beforeIso = input?.beforeIso?.trim() || "9999-12-31T23:59:59.999Z";
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk AND #sk BETWEEN :ledgerStart AND :ledgerEnd",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#sk": "sk",
        },
        ExpressionAttributeValues: {
          ":pk": accountPk(accountId),
          ":ledgerStart": "LEDGER#",
          ":ledgerEnd": `LEDGER#${beforeIso}#~`,
        },
        ScanIndexForward: false,
        Limit: limit,
      }),
    ),
  );

  return {
    accountId,
    userEmail: normalizedEmail,
    currency: WALLET_CURRENCY,
    limit,
    truncated: Boolean(response.LastEvaluatedKey),
    entries: ((response.Items || []) as WalletLedgerEntry[]).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  };
}

export async function scanWalletAccounts(input?: WalletTableInput & {
  limit?: number;
}): Promise<WalletAccountScanResult> {
  const tableName = walletTableName(input);
  const limit = scanLimit(input?.limit);
  const accounts: WalletAccountSnapshot[] = [];
  let scanned = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
          FilterExpression: "#entityType = :entityType",
          ExpressionAttributeNames: {
            "#entityType": "entityType",
          },
          ExpressionAttributeValues: {
            ":entityType": "wallet-account",
          },
          Limit: Math.min(1_000, limit - accounts.length),
        }),
      ),
    );
    scanned += response.ScannedCount ?? 0;
    accounts.push(
      ...((response.Items || []) as Array<Partial<WalletAccountSnapshot>>).map((item): WalletAccountSnapshot => ({
        accountId: String(item.accountId || ""),
        userEmail: String(item.userEmail || ""),
        currency: WALLET_CURRENCY,
        status: item.status === "blocked" ? "blocked" : "active",
        balanceMicros: Number(item.balanceMicros ?? 0),
        reservedMicros: Number(item.reservedMicros ?? 0),
        availableMicros: Number(item.availableMicros ?? 0),
        billingReviewRequired: item.billingReviewRequired === true ? true : undefined,
        billingReviewReason:
          typeof item.billingReviewReason === "string" ? item.billingReviewReason : undefined,
        billingReviewUpdatedAt:
          typeof item.billingReviewUpdatedAt === "string" ? item.billingReviewUpdatedAt : undefined,
        billingClawbackMicros:
          Number.isFinite(Number(item.billingClawbackMicros)) ? Number(item.billingClawbackMicros) : undefined,
        billingClawbackCount:
          Number.isFinite(Number(item.billingClawbackCount)) ? Number(item.billingClawbackCount) : undefined,
        createdAt: String(item.createdAt || ""),
        updatedAt: String(item.updatedAt || ""),
      })),
    );
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey && accounts.length < limit);

  return {
    limit,
    scanned,
    truncated: Boolean(exclusiveStartKey),
    accounts: accounts.sort((a, b) => a.userEmail.localeCompare(b.userEmail)),
  };
}

export async function creditWalletBalance(input: WalletTableInput & {
  userEmail: string;
  amountMicros: number;
  operationId: string;
  type: "purchase" | "refund" | "adjustment" | "grant";
  stripeEventId?: string;
  metadata?: WalletLedgerMetadata;
}): Promise<WalletCreditResult> {
  assertMicros(input.amountMicros, "amountMicros");
  const tableName = walletTableName(input);
  const operationId = normalizeOperationId(input.operationId);
  const userEmail = normalizeWalletEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const pk = accountPk(accountId);
  const createdAt = nowIso();
  const entryId = ledgerEntryId();
  const result: WalletCreditResult = {
    accountId,
    userEmail,
    operationId,
    ledgerEntryId: entryId,
    duplicate: false,
    type: input.type,
    amountMicros: input.amountMicros,
  };

  return sendIdempotentTransaction({
    tableName,
    pk,
    operationKind: input.type,
    operationId,
    result,
    transactItems: [
      idempotencyPut({ tableName, pk, operationKind: input.type, operationId, result, createdAt }),
      {
        Update: {
          TableName: tableName,
          Key: { pk, sk: "ACCOUNT" },
          UpdateExpression: [
            "SET #entityType = if_not_exists(#entityType, :accountEntity)",
            "#accountId = if_not_exists(#accountId, :accountId)",
            "#userEmail = if_not_exists(#userEmail, :userEmail)",
            "#currency = if_not_exists(#currency, :currency)",
            "#status = if_not_exists(#status, :active)",
            "#createdAt = if_not_exists(#createdAt, :now)",
            "#updatedAt = :now",
            "#balance = if_not_exists(#balance, :zero) + :amount",
            "#available = if_not_exists(#available, :zero) + :amount",
            "#reserved = if_not_exists(#reserved, :zero)",
          ].join(", "),
          ConditionExpression: "attribute_not_exists(#status) OR #status = :active",
          ExpressionAttributeNames: baseAccountUpdateNames(),
          ExpressionAttributeValues: {
            ":accountEntity": "wallet-account",
            ":accountId": accountId,
            ":active": "active",
            ":amount": input.amountMicros,
            ":currency": WALLET_CURRENCY,
            ":now": createdAt,
            ":userEmail": userEmail,
            ":zero": 0,
          },
        },
      },
      ledgerPut({
        tableName,
        pk,
        sk: ledgerSk(createdAt, entryId),
        entryId,
        type: input.type,
        accountId,
        userEmail,
        amountMicros: input.amountMicros,
        balanceDeltaMicros: input.amountMicros,
        reservedDeltaMicros: 0,
        availableDeltaMicros: input.amountMicros,
        operationId,
        metadata: {
          ...input.metadata,
          stripeEventId: input.stripeEventId,
        },
        createdAt,
      }),
    ],
  });
}

export async function debitWalletBalance(input: WalletTableInput & {
  userEmail: string;
  amountMicros: number;
  operationId: string;
  type: "refund" | "adjustment";
  stripeEventId?: string;
  flagAccount?: boolean;
  blockAccount?: boolean;
  billingReviewReason?: string;
  metadata?: WalletLedgerMetadata;
}): Promise<WalletDebitResult> {
  assertMicros(input.amountMicros, "amountMicros");
  const tableName = walletTableName(input);
  const operationId = normalizeOperationId(input.operationId);
  const userEmail = normalizeWalletEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const pk = accountPk(accountId);
  const createdAt = nowIso();
  const entryId = ledgerEntryId();
  const accountFlagged = input.flagAccount === true || input.blockAccount === true;
  const accountBlocked = input.blockAccount === true;
  const result: WalletDebitResult = {
    accountId,
    userEmail,
    operationId,
    ledgerEntryId: entryId,
    duplicate: false,
    type: input.type,
    amountMicros: input.amountMicros,
    accountFlagged,
    accountBlocked,
  };

  const expressionAttributeNames = accountFlagged
    ? {
        ...baseAccountUpdateNames(),
        "#billingClawbackCount": "billingClawbackCount",
        "#billingClawbackMicros": "billingClawbackMicros",
        "#billingReviewReason": "billingReviewReason",
        "#billingReviewRequired": "billingReviewRequired",
        "#billingReviewUpdatedAt": "billingReviewUpdatedAt",
      }
    : baseAccountUpdateNames();
  const expressionAttributeValues: Record<string, unknown> = {
    ":accountEntity": "wallet-account",
    ":accountId": accountId,
    ":active": "active",
    ":amount": input.amountMicros,
    ":blocked": "blocked",
    ":currency": WALLET_CURRENCY,
    ":now": createdAt,
    ":userEmail": userEmail,
    ":zero": 0,
  };
  if (accountFlagged) {
    expressionAttributeValues[":billingReviewReason"] = input.billingReviewReason || input.type;
    expressionAttributeValues[":one"] = 1;
    expressionAttributeValues[":true"] = true;
  }
  const updateExpression = [
    "SET #entityType = if_not_exists(#entityType, :accountEntity)",
    "#accountId = if_not_exists(#accountId, :accountId)",
    "#userEmail = if_not_exists(#userEmail, :userEmail)",
    "#currency = if_not_exists(#currency, :currency)",
    accountBlocked ? "#status = :blocked" : "#status = if_not_exists(#status, :active)",
    "#createdAt = if_not_exists(#createdAt, :now)",
    "#updatedAt = :now",
    "#balance = if_not_exists(#balance, :zero) - :amount",
    "#available = if_not_exists(#available, :zero) - :amount",
    "#reserved = if_not_exists(#reserved, :zero)",
    ...(accountFlagged
      ? [
          "#billingReviewRequired = :true",
          "#billingReviewReason = :billingReviewReason",
          "#billingReviewUpdatedAt = :now",
          "#billingClawbackMicros = if_not_exists(#billingClawbackMicros, :zero) + :amount",
          "#billingClawbackCount = if_not_exists(#billingClawbackCount, :zero) + :one",
        ]
      : []),
  ].join(", ");

  return sendIdempotentTransaction({
    tableName,
    pk,
    operationKind: input.type,
    operationId,
    result,
    transactItems: [
      idempotencyPut({ tableName, pk, operationKind: input.type, operationId, result, createdAt }),
      {
        Update: {
          TableName: tableName,
          Key: { pk, sk: "ACCOUNT" },
          UpdateExpression: updateExpression,
          ConditionExpression:
            "attribute_not_exists(#status) OR #status = :active OR #status = :blocked",
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        },
      },
      ledgerPut({
        tableName,
        pk,
        sk: ledgerSk(createdAt, entryId),
        entryId,
        type: input.type,
        accountId,
        userEmail,
        amountMicros: input.amountMicros,
        balanceDeltaMicros: -input.amountMicros,
        reservedDeltaMicros: 0,
        availableDeltaMicros: -input.amountMicros,
        operationId,
        metadata: {
          ...input.metadata,
          stripeEventId: input.stripeEventId,
          billingReviewReason: input.billingReviewReason,
          accountFlagged,
          accountBlocked,
        },
        createdAt,
      }),
    ],
  });
}

export async function reserveWalletAmount(input: WalletTableInput & {
  userEmail: string;
  amountMicros: number;
  operationId: string;
  serviceId?: UsageServiceId;
  provider?: string;
  route?: string;
  requestId?: string;
  expiresAt?: string;
  metadata?: WalletLedgerMetadata;
}): Promise<WalletReserveResult> {
  assertMicros(input.amountMicros, "amountMicros");
  const tableName = walletTableName(input);
  const operationId = normalizeOperationId(input.operationId);
  const userEmail = normalizeWalletEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const pk = accountPk(accountId);
  const createdAt = nowIso();
  const entryId = ledgerEntryId();
  const reservationId = `rsv_${randomUUID()}`;
  const result: WalletReserveResult = {
    accountId,
    userEmail,
    operationId,
    ledgerEntryId: entryId,
    duplicate: false,
    type: "reserve",
    reservationId,
    amountMicros: input.amountMicros,
  };

  return sendIdempotentTransaction({
    tableName,
    pk,
    operationKind: "reserve",
    operationId,
    result,
    insufficientFundsIndex: 1,
    transactItems: [
      idempotencyPut({ tableName, pk, operationKind: "reserve", operationId, result, createdAt }),
      {
        Update: {
          TableName: tableName,
          Key: { pk, sk: "ACCOUNT" },
          UpdateExpression: [
            "SET #updatedAt = :now",
            "#reserved = #reserved + :amount",
            "#available = #available - :amount",
          ].join(", "),
          ConditionExpression: [
            "attribute_exists(pk)",
            "#status = :active",
            "#currency = :currency",
            "#available >= :amount",
          ].join(" AND "),
          ExpressionAttributeNames: existingAccountReservationNames(),
          ExpressionAttributeValues: {
            ":active": "active",
            ":amount": input.amountMicros,
            ":currency": WALLET_CURRENCY,
            ":now": createdAt,
          },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            pk,
            sk: reservationSk(reservationId),
            entityType: "wallet-reservation",
            accountId,
            userEmail,
            reservationId,
            status: "reserved",
            currency: WALLET_CURRENCY,
            amountMicros: input.amountMicros,
            capturedMicros: 0,
            releasedMicros: 0,
            serviceId: input.serviceId,
            provider: input.provider,
            route: input.route,
            requestId: input.requestId,
            operationId,
            metadata: compactMetadata(input.metadata),
            createdAt,
            updatedAt: createdAt,
            expiresAt: input.expiresAt,
            ...(input.expiresAt
              ? workIndexAttributes(RESERVED_RESERVATION_WORK_PK, input.expiresAt)
              : {}),
          },
          ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
        },
      },
      ledgerPut({
        tableName,
        pk,
        sk: ledgerSk(createdAt, entryId),
        entryId,
        type: "reserve",
        accountId,
        userEmail,
        amountMicros: input.amountMicros,
        balanceDeltaMicros: 0,
        reservedDeltaMicros: input.amountMicros,
        availableDeltaMicros: -input.amountMicros,
        reservationId,
        serviceId: input.serviceId,
        provider: input.provider,
        route: input.route,
        requestId: input.requestId,
        operationId,
        metadata: input.metadata,
        createdAt,
      }),
    ],
  });
}

async function readReservation(
  tableName: string,
  pk: string,
  reservationId: string,
): Promise<WalletReservation> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk, sk: reservationSk(reservationId) },
      }),
    ),
  );
  const item = response.Item as WalletReservation | undefined;
  if (!item) throw new WalletReservationStateError(`Reservation not found: ${reservationId}`);
  return item;
}

export async function captureWalletReservation(input: WalletTableInput & {
  userEmail: string;
  reservationId: string;
  captureMicros: number;
  operationId: string;
  providerCostId?: string;
  metadata?: WalletLedgerMetadata;
}): Promise<WalletCaptureResult> {
  assertMicros(input.captureMicros, "captureMicros");
  const tableName = walletTableName(input);
  const operationId = normalizeOperationId(input.operationId);
  const userEmail = normalizeWalletEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const pk = accountPk(accountId);
  const idemSk = idempotencySk("capture", operationId);
  const duplicate = await getIdempotencyResult<WalletCaptureResult>(tableName, pk, idemSk);
  if (duplicate) return { ...duplicate, duplicate: true };

  const reservation = await readReservation(tableName, pk, input.reservationId);
  if (reservation.status !== "reserved") {
    throw new WalletReservationStateError(`Reservation ${input.reservationId} is ${reservation.status}.`);
  }
  if (input.captureMicros > reservation.amountMicros) {
    throw new WalletReservationStateError("captureMicros cannot exceed the reserved amount.");
  }

  const createdAt = nowIso();
  const entryId = ledgerEntryId();
  const releaseEntryId = input.captureMicros < reservation.amountMicros ? ledgerEntryId() : null;
  const releasedMicros = reservation.amountMicros - input.captureMicros;
  const result: WalletCaptureResult = {
    accountId,
    userEmail,
    operationId,
    ledgerEntryId: entryId,
    duplicate: false,
    type: "capture",
    reservationId: input.reservationId,
    reservedMicros: reservation.amountMicros,
    capturedMicros: input.captureMicros,
    releasedMicros,
  };

  const transactItems: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]> = [
    idempotencyPut({ tableName, pk, operationKind: "capture", operationId, result, createdAt }),
    {
      Update: {
        TableName: tableName,
        Key: { pk, sk: "ACCOUNT" },
        UpdateExpression: [
          "SET #updatedAt = :now",
          "#balance = #balance - :captureAmount",
          "#reserved = #reserved - :reservedAmount",
          "#available = #available + :releaseAmount",
        ].join(", "),
        ConditionExpression: [
          "attribute_exists(pk)",
          "#status = :active",
          "#currency = :currency",
          "#balance >= :captureAmount",
          "#reserved >= :reservedAmount",
        ].join(" AND "),
        ExpressionAttributeNames: existingAccountBalanceNames(),
        ExpressionAttributeValues: {
          ":active": "active",
          ":captureAmount": input.captureMicros,
          ":currency": WALLET_CURRENCY,
          ":now": createdAt,
          ":releaseAmount": releasedMicros,
          ":reservedAmount": reservation.amountMicros,
        },
      },
    },
    {
      Update: {
        TableName: tableName,
        Key: { pk, sk: reservationSk(input.reservationId) },
        UpdateExpression: [
          "SET #status = :captured",
          "#capturedMicros = :captureAmount",
          "#releasedMicros = :releaseAmount",
          "#updatedAt = :now",
          "#providerCostId = :providerCostId",
        ].join(", ") + " REMOVE #gsi1pk, #gsi1sk",
        ConditionExpression: "#status = :reserved",
        ExpressionAttributeNames: {
          "#capturedMicros": "capturedMicros",
          "#gsi1pk": "gsi1pk",
          "#gsi1sk": "gsi1sk",
          "#providerCostId": "providerCostId",
          "#releasedMicros": "releasedMicros",
          "#status": "status",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":captured": "captured",
          ":captureAmount": input.captureMicros,
          ":now": createdAt,
          ":providerCostId": input.providerCostId ?? "",
          ":releaseAmount": releasedMicros,
          ":reserved": "reserved",
        },
      },
    },
    ledgerPut({
      tableName,
      pk,
      sk: ledgerSk(createdAt, entryId),
      entryId,
      type: "capture",
      accountId,
      userEmail,
      amountMicros: input.captureMicros,
      balanceDeltaMicros: -input.captureMicros,
      reservedDeltaMicros: -input.captureMicros,
      availableDeltaMicros: 0,
      reservationId: input.reservationId,
      serviceId: reservation.serviceId,
      provider: reservation.provider,
      route: reservation.route,
      requestId: reservation.requestId,
      operationId,
      metadata: input.metadata,
      createdAt,
    }),
  ];

  if (releaseEntryId && releasedMicros > 0) {
    transactItems.push(
      ledgerPut({
        tableName,
        pk,
        sk: ledgerSk(createdAt, releaseEntryId),
        entryId: releaseEntryId,
        type: "release",
        accountId,
        userEmail,
        amountMicros: releasedMicros,
        balanceDeltaMicros: 0,
        reservedDeltaMicros: -releasedMicros,
        availableDeltaMicros: releasedMicros,
        reservationId: input.reservationId,
        serviceId: reservation.serviceId,
        provider: reservation.provider,
        route: reservation.route,
        requestId: reservation.requestId,
        operationId,
        metadata: { reason: "capture_remainder" },
        createdAt,
      }),
    );
  }

  return sendIdempotentTransaction({
    tableName,
    pk,
    operationKind: "capture",
    operationId,
    result,
    transactItems,
  });
}

export async function releaseWalletReservation(input: WalletTableInput & {
  userEmail: string;
  reservationId: string;
  operationId: string;
  reason?: string;
  metadata?: WalletLedgerMetadata;
}): Promise<WalletReleaseResult> {
  const tableName = walletTableName(input);
  const operationId = normalizeOperationId(input.operationId);
  const userEmail = normalizeWalletEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const pk = accountPk(accountId);
  const idemSk = idempotencySk("release", operationId);
  const duplicate = await getIdempotencyResult<WalletReleaseResult>(tableName, pk, idemSk);
  if (duplicate) return { ...duplicate, duplicate: true };

  const reservation = await readReservation(tableName, pk, input.reservationId);
  if (reservation.status !== "reserved") {
    throw new WalletReservationStateError(`Reservation ${input.reservationId} is ${reservation.status}.`);
  }

  const createdAt = nowIso();
  const entryId = ledgerEntryId();
  const result: WalletReleaseResult = {
    accountId,
    userEmail,
    operationId,
    ledgerEntryId: entryId,
    duplicate: false,
    type: "release",
    reservationId: input.reservationId,
    releasedMicros: reservation.amountMicros,
    reason: input.reason,
  };

  return sendIdempotentTransaction({
    tableName,
    pk,
    operationKind: "release",
    operationId,
    result,
    transactItems: [
      idempotencyPut({ tableName, pk, operationKind: "release", operationId, result, createdAt }),
      {
        Update: {
          TableName: tableName,
          Key: { pk, sk: "ACCOUNT" },
          UpdateExpression: [
            "SET #updatedAt = :now",
            "#reserved = #reserved - :reservedAmount",
            "#available = #available + :reservedAmount",
          ].join(", "),
          ConditionExpression: [
            "attribute_exists(pk)",
            "#status = :active",
            "#currency = :currency",
            "#reserved >= :reservedAmount",
          ].join(" AND "),
          ExpressionAttributeNames: existingAccountReservationNames(),
          ExpressionAttributeValues: {
            ":active": "active",
            ":currency": WALLET_CURRENCY,
            ":now": createdAt,
            ":reservedAmount": reservation.amountMicros,
          },
        },
      },
      {
        Update: {
          TableName: tableName,
          Key: { pk, sk: reservationSk(input.reservationId) },
          UpdateExpression: [
            "SET #status = :released",
            "#releasedMicros = :reservedAmount",
            "#updatedAt = :now",
            "#releaseReason = :reason",
          ].join(", ") + " REMOVE #gsi1pk, #gsi1sk",
          ConditionExpression: "#status = :reserved",
          ExpressionAttributeNames: {
            "#gsi1pk": "gsi1pk",
            "#gsi1sk": "gsi1sk",
            "#releasedMicros": "releasedMicros",
            "#releaseReason": "releaseReason",
            "#status": "status",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":now": createdAt,
            ":reason": input.reason ?? "",
            ":released": "released",
            ":reserved": "reserved",
            ":reservedAmount": reservation.amountMicros,
          },
        },
      },
      ledgerPut({
        tableName,
        pk,
        sk: ledgerSk(createdAt, entryId),
        entryId,
        type: "release",
        accountId,
        userEmail,
        amountMicros: reservation.amountMicros,
        balanceDeltaMicros: 0,
        reservedDeltaMicros: -reservation.amountMicros,
        availableDeltaMicros: reservation.amountMicros,
        reservationId: input.reservationId,
        serviceId: reservation.serviceId,
        provider: reservation.provider,
        route: reservation.route,
        requestId: reservation.requestId,
        operationId,
        metadata: {
          ...input.metadata,
          reason: input.reason,
        },
        createdAt,
      }),
    ],
  });
}

export async function listExpiredWalletReservations(input?: WalletTableInput & {
  limit?: number;
  nowIso?: string;
}): Promise<WalletReservation[]> {
  const tableName = walletTableName(input);
  const now = input?.nowIso?.trim() || nowIso();
  const limit = Math.max(1, Math.min(Math.round(input?.limit ?? 100), 1_000));
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: walletWorkGsiName(input),
        KeyConditionExpression: "#gsi1pk = :workPk AND #gsi1sk <= :now",
        FilterExpression: "#status = :reserved",
        ExpressionAttributeNames: {
          "#gsi1pk": "gsi1pk",
          "#gsi1sk": "gsi1sk",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":now": now,
          ":reserved": "reserved",
          ":workPk": RESERVED_RESERVATION_WORK_PK,
        },
        Limit: limit,
        ScanIndexForward: true,
      }),
    ),
  );
  return (response.Items || []) as WalletReservation[];
}

export async function releaseExpiredWalletReservations(input?: WalletTableInput & {
  dryRun?: boolean;
  limit?: number;
  nowIso?: string;
}): Promise<WalletExpiredReservationReleaseResult> {
  const dryRun = input?.dryRun === true;
  const reservations = await listExpiredWalletReservations(input);
  const result: WalletExpiredReservationReleaseResult = {
    dryRun,
    checked: reservations.length,
    released: 0,
    skipped: 0,
    failed: 0,
    reservations: [],
  };

  for (const reservation of reservations) {
    const row = {
      reservationId: reservation.reservationId,
      userEmail: reservation.userEmail,
      amountMicros: reservation.amountMicros,
      expiresAt: reservation.expiresAt,
      action: "would_release" as const,
    };
    if (dryRun) {
      result.reservations.push(row);
      continue;
    }

    try {
      await releaseWalletReservation({
        tableName: input?.tableName,
        userEmail: reservation.userEmail,
        reservationId: reservation.reservationId,
        operationId: `reservation-ttl:${reservation.reservationId}:${reservation.expiresAt || "unknown"}:release`,
        reason: "reservation_expired",
        metadata: {
          expiresAt: reservation.expiresAt,
          provider: reservation.provider,
          route: reservation.route,
          serviceId: reservation.serviceId,
        },
      });
      result.released += 1;
      result.reservations.push({ ...row, action: "released" });
    } catch (error) {
      if (error instanceof WalletReservationStateError) {
        result.skipped += 1;
        result.reservations.push({ ...row, action: "skipped", error: errorSummary(error) });
      } else {
        result.failed += 1;
        result.reservations.push({ ...row, action: "failed", error: errorSummary(error) });
      }
    }
  }

  return result;
}

async function readPendingWalletCapture(
  tableName: string,
  accountId: string,
  operationId: string,
): Promise<WalletPendingCapture | null> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: pendingCapturePk(accountId), sk: pendingCaptureSk(operationId) },
      }),
    ),
  );
  const item = response.Item as (WalletPendingCapture & { entityType?: string }) | undefined;
  if (!item || item.entityType !== "wallet-pending-capture") return null;
  return item;
}

export async function recordPendingWalletCapture(input: WalletTableInput & {
  userEmail: string;
  reservationId: string;
  captureMicros: number;
  operationId: string;
  providerCostId?: string;
  metadata?: WalletLedgerMetadata;
  nextAttemptAt?: string;
  lastError?: string;
}): Promise<WalletPendingCapture> {
  assertMicros(input.captureMicros, "captureMicros");
  const tableName = walletTableName(input);
  const userEmail = normalizeWalletEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const operationId = normalizeOperationId(input.operationId);
  const createdAt = nowIso();
  const nextAttemptAt = input.nextAttemptAt?.trim() || createdAt;
  const pending: WalletPendingCapture = {
    accountId,
    userEmail,
    reservationId: input.reservationId,
    captureMicros: input.captureMicros,
    operationId,
    providerCostId: input.providerCostId,
    metadata: compactMetadata(input.metadata),
    status: "open",
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    nextAttemptAt,
    lastError: input.lastError,
  };

  try {
    await withDynamoRetry(() =>
      ddbClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            pk: pendingCapturePk(accountId),
            sk: pendingCaptureSk(operationId),
            entityType: "wallet-pending-capture",
            ...pending,
            ...workIndexAttributes(PENDING_CAPTURE_WORK_PK, nextAttemptAt),
          },
          ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
        }),
      ),
    );
    return pending;
  } catch (error) {
    if ((error as { name?: string })?.name !== "ConditionalCheckFailedException") throw error;
    const existing = await readPendingWalletCapture(tableName, accountId, operationId);
    if (existing) return existing;
    throw error;
  }
}

export async function listPendingWalletCaptures(input?: WalletTableInput & {
  limit?: number;
  nowIso?: string;
}): Promise<WalletPendingCapture[]> {
  const tableName = walletTableName(input);
  const now = input?.nowIso?.trim() || nowIso();
  const limit = Math.max(1, Math.min(Math.round(input?.limit ?? 100), 1_000));
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: walletWorkGsiName(input),
        KeyConditionExpression: "#gsi1pk = :workPk AND #gsi1sk <= :now",
        FilterExpression: "#status = :open",
        ExpressionAttributeNames: {
          "#gsi1pk": "gsi1pk",
          "#gsi1sk": "gsi1sk",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":now": now,
          ":open": "open",
          ":workPk": PENDING_CAPTURE_WORK_PK,
        },
        Limit: limit,
        ScanIndexForward: true,
      }),
    ),
  );
  return (response.Items || []) as WalletPendingCapture[];
}

async function closePendingWalletCapture(input: WalletTableInput & {
  pending: WalletPendingCapture;
  status: Exclude<WalletPendingCaptureStatus, "open">;
  failureReason?: string;
  error?: unknown;
}): Promise<void> {
  const tableName = walletTableName(input);
  const updatedAt = nowIso();
  const hasError = input.error != null;
  await withDynamoRetry(() =>
    ddbClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          pk: pendingCapturePk(input.pending.accountId),
          sk: pendingCaptureSk(input.pending.operationId),
        },
        UpdateExpression: [
          "SET #status = :status",
          "#updatedAt = :updatedAt",
          "#failureReason = :failureReason",
          ...(hasError ? ["#lastError = :lastError"] : []),
        ].join(", ") + " REMOVE #gsi1pk, #gsi1sk",
        ExpressionAttributeNames: {
          "#failureReason": "failureReason",
          "#gsi1pk": "gsi1pk",
          "#gsi1sk": "gsi1sk",
          "#status": "status",
          "#updatedAt": "updatedAt",
          ...(hasError ? { "#lastError": "lastError" } : {}),
        },
        ExpressionAttributeValues: {
          ":failureReason": input.failureReason ?? "",
          ":status": input.status,
          ":updatedAt": updatedAt,
          ...(hasError ? { ":lastError": errorSummary(input.error) } : {}),
        },
      }),
    ),
  );
}

async function postponePendingWalletCapture(input: WalletTableInput & {
  pending: WalletPendingCapture;
  error: unknown;
  now?: Date;
}): Promise<void> {
  const tableName = walletTableName(input);
  const now = input.now ?? new Date();
  const attemptCount = Math.max(0, input.pending.attemptCount || 0) + 1;
  const delayMs = Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(attemptCount - 1, 7));
  const nextAttemptAt = isoAfterMs(delayMs, now);
  const updatedAt = now.toISOString();
  await withDynamoRetry(() =>
    ddbClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          pk: pendingCapturePk(input.pending.accountId),
          sk: pendingCaptureSk(input.pending.operationId),
        },
        UpdateExpression: [
          "SET #attemptCount = :attemptCount",
          "#lastError = :lastError",
          "#nextAttemptAt = :nextAttemptAt",
          "#updatedAt = :updatedAt",
          "#gsi1pk = :workPk",
          "#gsi1sk = :nextAttemptAt",
        ].join(", "),
        ExpressionAttributeNames: {
          "#attemptCount": "attemptCount",
          "#gsi1pk": "gsi1pk",
          "#gsi1sk": "gsi1sk",
          "#lastError": "lastError",
          "#nextAttemptAt": "nextAttemptAt",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":attemptCount": attemptCount,
          ":lastError": errorSummary(input.error),
          ":nextAttemptAt": nextAttemptAt,
          ":updatedAt": updatedAt,
          ":workPk": PENDING_CAPTURE_WORK_PK,
        },
      }),
    ),
  );
}

export async function retryPendingWalletCaptures(input?: WalletTableInput & {
  dryRun?: boolean;
  limit?: number;
  nowIso?: string;
}): Promise<WalletPendingCaptureRetryResult> {
  const dryRun = input?.dryRun === true;
  const pendingCaptures = await listPendingWalletCaptures(input);
  const result: WalletPendingCaptureRetryResult = {
    dryRun,
    checked: pendingCaptures.length,
    captured: 0,
    postponed: 0,
    failed: 0,
    pendingCaptures: [],
  };

  for (const pending of pendingCaptures) {
    const row = {
      reservationId: pending.reservationId,
      userEmail: pending.userEmail,
      captureMicros: pending.captureMicros,
      operationId: pending.operationId,
      action: "would_capture" as const,
    };
    if (dryRun) {
      result.pendingCaptures.push(row);
      continue;
    }

    try {
      await captureWalletReservation({
        tableName: input?.tableName,
        userEmail: pending.userEmail,
        reservationId: pending.reservationId,
        captureMicros: pending.captureMicros,
        operationId: pending.operationId,
        providerCostId: pending.providerCostId,
        metadata: {
          ...pending.metadata,
          recoveredFromPendingCapture: true,
        },
      });
      await closePendingWalletCapture({
        tableName: input?.tableName,
        pending,
        status: "settled",
      });
      result.captured += 1;
      result.pendingCaptures.push({ ...row, action: "captured" });
    } catch (error) {
      if (error instanceof WalletReservationStateError) {
        await closePendingWalletCapture({
          tableName: input?.tableName,
          pending,
          status: "failed",
          failureReason: "terminal_reservation_state",
          error,
        });
        result.failed += 1;
        result.pendingCaptures.push({ ...row, action: "failed", error: errorSummary(error) });
      } else {
        await postponePendingWalletCapture({
          tableName: input?.tableName,
          pending,
          error,
          now: input?.nowIso ? new Date(input.nowIso) : undefined,
        });
        result.postponed += 1;
        result.pendingCaptures.push({ ...row, action: "postponed", error: errorSummary(error) });
      }
    }
  }

  return result;
}

export async function linkWalletReservationToProviderJob(input: WalletTableInput & {
  userEmail: string;
  reservationId: string;
  reservedMicros: number;
  provider: string;
  providerJobId: string;
  serviceId?: UsageServiceId;
  route?: string;
  operationId: string;
  metadata?: WalletLedgerMetadata;
}): Promise<WalletProviderJobLink> {
  const tableName = walletTableName(input);
  const userEmail = normalizeWalletEmail(input.userEmail);
  const accountId = walletAccountIdForEmail(userEmail);
  const provider = input.provider.trim().toLowerCase();
  const providerJobId = input.providerJobId.trim();
  const operationId = normalizeOperationId(input.operationId);
  assertMicros(input.reservedMicros, "reservedMicros");
  if (!provider || !providerJobId) {
    throw new WalletValidationError("provider and providerJobId are required.");
  }
  const createdAt = nowIso();
  const link: WalletProviderJobLink = {
    provider,
    providerJobId,
    accountId,
    userEmail,
    reservationId: input.reservationId,
    reservedMicros: input.reservedMicros,
    serviceId: input.serviceId,
    route: input.route,
    operationId,
    createdAt,
    updatedAt: createdAt,
    metadata: compactMetadata(input.metadata),
  };

  await withDynamoRetry(() =>
    ddbClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: providerJobPk(provider, providerJobId),
          sk: "WALLET_RESERVATION",
          entityType: "wallet-provider-job-link",
          ...link,
        },
        ConditionExpression:
          "attribute_not_exists(pk) OR (#reservationId = :reservationId AND #accountId = :accountId)",
        ExpressionAttributeNames: {
          "#accountId": "accountId",
          "#reservationId": "reservationId",
        },
        ExpressionAttributeValues: {
          ":accountId": accountId,
          ":reservationId": input.reservationId,
        },
      }),
    ),
  );

  return link;
}

export async function readWalletReservationForProviderJob(input: WalletTableInput & {
  provider: string;
  providerJobId: string;
}): Promise<WalletProviderJobLink | null> {
  const tableName = walletTableName(input);
  const provider = input.provider.trim().toLowerCase();
  const providerJobId = input.providerJobId.trim();
  if (!provider || !providerJobId) {
    throw new WalletValidationError("provider and providerJobId are required.");
  }

  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: providerJobPk(provider, providerJobId), sk: "WALLET_RESERVATION" },
      }),
    ),
  );
  const item = response.Item as (WalletProviderJobLink & { entityType?: string }) | undefined;
  if (!item || item.entityType !== "wallet-provider-job-link") return null;
  return {
    provider: item.provider,
    providerJobId: item.providerJobId,
    accountId: item.accountId,
    userEmail: item.userEmail,
    reservationId: item.reservationId,
    reservedMicros: item.reservedMicros,
    serviceId: item.serviceId,
    route: item.route,
    operationId: item.operationId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    metadata: item.metadata,
  };
}
