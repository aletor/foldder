import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMock = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@/lib/dynamo-utils", () => ({
  ddbClient: { send: dynamoMock.send },
}));

import {
  captureWalletReservation,
  creditWalletBalance,
  debitWalletBalance,
  listWalletLedgerEntriesForAccount,
  listExpiredWalletReservations,
  recordPendingWalletCapture,
  releaseWalletReservation,
  reserveWalletAmount,
  walletAccountIdForEmail,
  WalletInsufficientFundsError,
  WalletValidationError,
} from "./wallet-ledger";

const TABLE = "wallet-ledger-test";
const USER_EMAIL = "Creator@Example.com";

function txInput() {
  const call = dynamoMock.send.mock.calls.find(
    ([command]) => command.constructor.name === "TransactWriteCommand",
  );
  if (!call) throw new Error("No TransactWriteCommand was sent");
  return call[0].input as {
    ClientRequestToken?: string;
    TransactItems: Array<{
      Put?: { Item: Record<string, unknown>; ConditionExpression?: string };
      Update?: {
        Key: { pk: string; sk: string };
        UpdateExpression?: string;
        ConditionExpression?: string;
        ExpressionAttributeNames?: Record<string, string>;
        ExpressionAttributeValues?: Record<string, unknown>;
      };
    }>;
  };
}

function putInput() {
  const call = dynamoMock.send.mock.calls.find(
    ([command]) => command.constructor.name === "PutCommand",
  );
  if (!call) throw new Error("No PutCommand was sent");
  return call[0].input as {
    Item: Record<string, unknown>;
    ConditionExpression?: string;
  };
}

function queryInput() {
  const call = dynamoMock.send.mock.calls.find(
    ([command]) => command.constructor.name === "QueryCommand",
  );
  if (!call) throw new Error("No QueryCommand was sent");
  return call[0].input as {
    IndexName?: string;
    KeyConditionExpression?: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ScanIndexForward?: boolean;
    Limit?: number;
  };
}

function assertNoUnusedExpressionAttributeNames(input: {
  UpdateExpression?: string;
  ConditionExpression?: string;
  KeyConditionExpression?: string;
  FilterExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
}) {
  const source = [
    input.UpdateExpression,
    input.ConditionExpression,
    input.KeyConditionExpression,
    input.FilterExpression,
  ].filter(Boolean).join(" ");
  const unused = Object.keys(input.ExpressionAttributeNames || {}).filter((name) => !source.includes(name));
  expect(unused).toEqual([]);
}

describe("wallet-ledger", () => {
  beforeEach(() => {
    dynamoMock.send.mockReset();
    dynamoMock.send.mockResolvedValue({});
  });

  it("credits balance and available micros idempotently", async () => {
    const result = await creditWalletBalance({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      amountMicros: 5_000_000,
      operationId: "stripe_evt_1",
      type: "purchase",
      stripeEventId: "evt_1",
    });

    expect(result.amountMicros).toBe(5_000_000);
    expect(result.duplicate).toBe(false);
    const tx = txInput();
    expect(tx.ClientRequestToken).toHaveLength(32);
    expect(tx.TransactItems).toHaveLength(3);

    const accountUpdate = tx.TransactItems.find((item) => item.Update?.Key.sk === "ACCOUNT")?.Update;
    expect(accountUpdate?.UpdateExpression).toContain("#balance = if_not_exists(#balance, :zero) + :amount");
    expect(accountUpdate?.UpdateExpression).toContain("#available = if_not_exists(#available, :zero) + :amount");
    expect(accountUpdate?.ExpressionAttributeValues?.[":amount"]).toBe(5_000_000);

    const ledgerItem = tx.TransactItems.find(
      (item) => item.Put?.Item.entityType === "wallet-ledger-entry",
    )?.Put?.Item;
    expect(ledgerItem).toMatchObject({
      type: "purchase",
      balanceDeltaMicros: 5_000_000,
      reservedDeltaMicros: 0,
      availableDeltaMicros: 5_000_000,
    });
  });

  it("debits clawbacks and flags the account without requiring positive available funds", async () => {
    const result = await debitWalletBalance({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      amountMicros: 2_500_000,
      operationId: "stripe_refund:re_1:clawback",
      type: "refund",
      stripeEventId: "evt_refund",
      flagAccount: true,
      billingReviewReason: "stripe_refund",
    });

    expect(result).toMatchObject({
      amountMicros: 2_500_000,
      accountFlagged: true,
      accountBlocked: false,
      type: "refund",
    });

    const tx = txInput();
    expect(tx.TransactItems).toHaveLength(3);
    const accountUpdate = tx.TransactItems.find((item) => item.Update?.Key.sk === "ACCOUNT")?.Update;
    expect(accountUpdate?.UpdateExpression).toContain("#balance = if_not_exists(#balance, :zero) - :amount");
    expect(accountUpdate?.UpdateExpression).toContain("#available = if_not_exists(#available, :zero) - :amount");
    expect(accountUpdate?.UpdateExpression).toContain("#billingReviewRequired = :true");
    expect(accountUpdate?.ConditionExpression).not.toContain("#available >=");

    const ledgerItem = tx.TransactItems.find(
      (item) => item.Put?.Item.entityType === "wallet-ledger-entry",
    )?.Put?.Item;
    expect(ledgerItem).toMatchObject({
      type: "refund",
      balanceDeltaMicros: -2_500_000,
      reservedDeltaMicros: 0,
      availableDeltaMicros: -2_500_000,
    });
  });

  it("can block the wallet account on dispute clawback", async () => {
    await debitWalletBalance({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      amountMicros: 5_000_000,
      operationId: "stripe_dispute:du_1:clawback",
      type: "adjustment",
      flagAccount: true,
      blockAccount: true,
      billingReviewReason: "stripe_dispute",
    });

    const tx = txInput();
    const accountUpdate = tx.TransactItems.find((item) => item.Update?.Key.sk === "ACCOUNT")?.Update;
    expect(accountUpdate?.UpdateExpression).toContain("#status = :blocked");
    expect(accountUpdate?.ExpressionAttributeValues?.[":blocked"]).toBe("blocked");
  });

  it("lists account ledger entries newest first without scanning other accounts", async () => {
    dynamoMock.send.mockResolvedValueOnce({
      Items: [
        {
          entryId: "led_new",
          type: "capture",
          accountId: walletAccountIdForEmail(USER_EMAIL),
          userEmail: "creator@example.com",
          currency: "usd",
          amountMicros: 500_000,
          balanceDeltaMicros: -500_000,
          reservedDeltaMicros: -500_000,
          availableDeltaMicros: 0,
          operationId: "op_new",
          createdAt: "2026-06-09T12:00:00.000Z",
        },
        {
          entryId: "led_old",
          type: "purchase",
          accountId: walletAccountIdForEmail(USER_EMAIL),
          userEmail: "creator@example.com",
          currency: "usd",
          amountMicros: 1_000_000,
          balanceDeltaMicros: 1_000_000,
          reservedDeltaMicros: 0,
          availableDeltaMicros: 1_000_000,
          operationId: "op_old",
          createdAt: "2026-06-09T10:00:00.000Z",
        },
      ],
      LastEvaluatedKey: { pk: "next" },
    });

    const result = await listWalletLedgerEntriesForAccount(USER_EMAIL, {
      tableName: TABLE,
      limit: 25,
      beforeIso: "2026-06-10T00:00:00.000Z",
    });

    expect(result.truncated).toBe(true);
    expect(result.entries.map((entry) => entry.entryId)).toEqual(["led_new", "led_old"]);
    const query = queryInput();
    expect(query.KeyConditionExpression).toContain("#pk = :pk");
    expect(query.KeyConditionExpression).toContain("#sk BETWEEN :ledgerStart AND :ledgerEnd");
    expect(query.ExpressionAttributeValues).toMatchObject({
      ":pk": `WALLET#${walletAccountIdForEmail(USER_EMAIL)}`,
      ":ledgerStart": "LEDGER#",
      ":ledgerEnd": "LEDGER#2026-06-10T00:00:00.000Z#~",
    });
    expect(query.ScanIndexForward).toBe(false);
    expect(query.Limit).toBe(25);
  });

  it("reserves only when available micros cover the operation", async () => {
    const result = await reserveWalletAmount({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      amountMicros: 1_250_000,
      operationId: "req_1",
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/gemini/generate",
    });

    expect(result.type).toBe("reserve");
    expect(result.amountMicros).toBe(1_250_000);

    const tx = txInput();
    expect(tx.TransactItems).toHaveLength(4);
    const accountUpdate = tx.TransactItems.find((item) => item.Update?.Key.sk === "ACCOUNT")?.Update;
    expect(accountUpdate?.ConditionExpression).toContain("#available >= :amount");
    expect(accountUpdate?.UpdateExpression).toContain("#reserved = #reserved + :amount");
    expect(accountUpdate?.UpdateExpression).toContain("#available = #available - :amount");
    expect(accountUpdate?.ExpressionAttributeValues?.[":amount"]).toBe(1_250_000);
    assertNoUnusedExpressionAttributeNames(accountUpdate || {});

    const reservation = tx.TransactItems.find(
      (item) => item.Put?.Item.entityType === "wallet-reservation",
    )?.Put?.Item;
    expect(reservation).toMatchObject({
      amountMicros: 1_250_000,
      status: "reserved",
      serviceId: "gemini-nano",
      provider: "gemini",
    });
  });

  it("indexes expiring reservations for the TTL release sweep", async () => {
    await reserveWalletAmount({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      amountMicros: 1_250_000,
      operationId: "req_expiring",
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/gemini/generate",
      expiresAt: "2026-06-09T13:00:00.000Z",
    });

    const tx = txInput();
    const reservation = tx.TransactItems.find(
      (item) => item.Put?.Item.entityType === "wallet-reservation",
    )?.Put?.Item;
    expect(reservation).toMatchObject({
      expiresAt: "2026-06-09T13:00:00.000Z",
      gsi1pk: "WALLET_RESERVATION#reserved",
      gsi1sk: "2026-06-09T13:00:00.000Z",
    });
  });

  it("returns the stored result when the same operation is replayed", async () => {
    const accountId = walletAccountIdForEmail(USER_EMAIL);
    dynamoMock.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("cancelled"), {
          name: "TransactionCanceledException",
          CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
        }),
      )
      .mockResolvedValueOnce({
        Item: {
          result: {
            accountId,
            userEmail: "creator@example.com",
            operationId: "req_replay",
            ledgerEntryId: "led_existing",
            duplicate: false,
            type: "reserve",
            reservationId: "rsv_existing",
            amountMicros: 750_000,
          },
        },
      });

    const result = await reserveWalletAmount({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      amountMicros: 750_000,
      operationId: "req_replay",
    });

    expect(result).toMatchObject({
      duplicate: true,
      reservationId: "rsv_existing",
      ledgerEntryId: "led_existing",
    });
  });

  it("maps an account conditional failure to insufficient funds", async () => {
    dynamoMock.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("cancelled"), {
          name: "TransactionCanceledException",
          CancellationReasons: [{ Code: "None" }, { Code: "ConditionalCheckFailed" }],
        }),
      )
      .mockResolvedValueOnce({});

    await expect(
      reserveWalletAmount({
        tableName: TABLE,
        userEmail: USER_EMAIL,
        amountMicros: 99_000_000,
        operationId: "req_expensive",
      }),
    ).rejects.toBeInstanceOf(WalletInsufficientFundsError);
  });

  it("captures actual cost and releases the unused reservation remainder", async () => {
    const accountId = walletAccountIdForEmail(USER_EMAIL);
    dynamoMock.send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          accountId,
          userEmail: "creator@example.com",
          reservationId: "rsv_1",
          status: "reserved",
          amountMicros: 1_000_000,
          capturedMicros: 0,
          releasedMicros: 0,
          serviceId: "gemini-nano",
          provider: "gemini",
          route: "/api/gemini/generate",
          requestId: "req_1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({});

    const result = await captureWalletReservation({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      reservationId: "rsv_1",
      captureMicros: 700_000,
      operationId: "capture_1",
    });

    expect(result).toMatchObject({
      capturedMicros: 700_000,
      releasedMicros: 300_000,
    });

    const tx = txInput();
    const accountUpdate = tx.TransactItems.find((item) => item.Update?.Key.sk === "ACCOUNT")?.Update;
    expect(accountUpdate?.ExpressionAttributeValues).toMatchObject({
      ":captureAmount": 700_000,
      ":reservedAmount": 1_000_000,
      ":releaseAmount": 300_000,
    });
    assertNoUnusedExpressionAttributeNames(accountUpdate || {});

    const ledgerItems = tx.TransactItems
      .map((item) => item.Put?.Item)
      .filter((item): item is Record<string, unknown> => item?.entityType === "wallet-ledger-entry");
    expect(ledgerItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "capture",
          balanceDeltaMicros: -700_000,
          reservedDeltaMicros: -700_000,
          availableDeltaMicros: 0,
        }),
        expect.objectContaining({
          type: "release",
          balanceDeltaMicros: 0,
          reservedDeltaMicros: -300_000,
          availableDeltaMicros: 300_000,
        }),
      ]),
    );
  });

  it("releases reservations without unused Dynamo expression attribute names", async () => {
    const accountId = walletAccountIdForEmail(USER_EMAIL);
    dynamoMock.send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Item: {
          accountId,
          userEmail: "creator@example.com",
          reservationId: "rsv_release",
          status: "reserved",
          amountMicros: 1_000_000,
          capturedMicros: 0,
          releasedMicros: 0,
          serviceId: "gemini-nano",
          provider: "gemini",
          route: "/api/gemini/generate",
          requestId: "req_1",
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({});

    await releaseWalletReservation({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      reservationId: "rsv_release",
      operationId: "release_1",
      reason: "provider_error",
    });

    const tx = txInput();
    const accountUpdate = tx.TransactItems.find((item) => item.Update?.Key.sk === "ACCOUNT")?.Update;
    expect(accountUpdate?.UpdateExpression).toContain("#reserved = #reserved - :reservedAmount");
    expect(accountUpdate?.UpdateExpression).toContain("#available = #available + :reservedAmount");
    assertNoUnusedExpressionAttributeNames(accountUpdate || {});
  });

  it("queries expired reserved reservations through the wallet work index", async () => {
    dynamoMock.send.mockResolvedValueOnce({
      Items: [
        {
          accountId: "acct_1",
          userEmail: "creator@example.com",
          reservationId: "rsv_expired",
          status: "reserved",
          amountMicros: 10_000,
          capturedMicros: 0,
          releasedMicros: 0,
          createdAt: "2026-06-09T12:00:00.000Z",
          updatedAt: "2026-06-09T12:00:00.000Z",
          expiresAt: "2026-06-09T12:30:00.000Z",
        },
      ],
    });

    const result = await listExpiredWalletReservations({
      tableName: TABLE,
      nowIso: "2026-06-09T12:31:00.000Z",
      limit: 25,
    });

    expect(result[0]?.reservationId).toBe("rsv_expired");
    const query = queryInput();
    expect(query.IndexName).toBe("gsi1pk-gsi1sk-index");
    expect(query.KeyConditionExpression).toContain("#gsi1pk = :workPk");
    expect(query.ExpressionAttributeValues).toMatchObject({
      ":workPk": "WALLET_RESERVATION#reserved",
      ":now": "2026-06-09T12:31:00.000Z",
    });
  });

  it("records failed captures into an indexed pending-capture outbox", async () => {
    const result = await recordPendingWalletCapture({
      tableName: TABLE,
      userEmail: USER_EMAIL,
      reservationId: "rsv_capture",
      captureMicros: 700_000,
      operationId: "capture_retry_1",
      providerCostId: "provider_cost_1",
      nextAttemptAt: "2026-06-09T12:05:00.000Z",
      metadata: { route: "/api/gemini/generate" },
      lastError: "Dynamo timeout",
    });

    expect(result).toMatchObject({
      captureMicros: 700_000,
      operationId: "capture_retry_1",
      status: "open",
    });
    const put = putInput();
    expect(put.Item).toMatchObject({
      entityType: "wallet-pending-capture",
      reservationId: "rsv_capture",
      captureMicros: 700_000,
      gsi1pk: "WALLET_PENDING_CAPTURE#open",
      gsi1sk: "2026-06-09T12:05:00.000Z",
    });
  });

  it("rejects non-integer micro amounts", async () => {
    await expect(
      reserveWalletAmount({
        tableName: TABLE,
        userEmail: USER_EMAIL,
        amountMicros: 1.5,
        operationId: "bad_amount",
      }),
    ).rejects.toBeInstanceOf(WalletValidationError);
  });
});
