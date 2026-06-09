import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMock = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@/lib/dynamo-utils", () => ({
  ddbClient: { send: dynamoMock.send },
}));

import {
  SpendControlConfigurationError,
  SpendControlLimitExceededError,
  SpendControlProviderDisabledError,
  checkAndRecordSpendControl,
  releaseSpendControl,
  spendControlsMode,
} from "./spend-controls";

const BASE_INPUT = {
  userEmail: "Creator@Example.com",
  provider: "gemini" as const,
  serviceId: "gemini-nano" as const,
  route: "/api/gemini/generate",
  amountMicros: 250_000,
  operationId: "op_123",
  now: new Date("2026-06-09T18:34:00.000Z"),
};

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
        ConditionExpression?: string;
        ExpressionAttributeValues?: Record<string, unknown>;
      };
    }>;
  };
}

describe("spend-controls", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...previousEnv };
    delete process.env.FOLDDER_SPEND_CONTROLS_MODE;
    delete process.env.FOLDDER_SPEND_CONTROLS_ENABLED;
    delete process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD;
    delete process.env.FOLDDER_SPEND_ACCOUNT_DAILY_USD;
    delete process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD;
    delete process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD_GEMINI;
    delete process.env.FOLDDER_SPEND_GLOBAL_DAILY_USD;
    delete process.env.FOLDDER_SPEND_GLOBAL_MONTHLY_USD;
    delete process.env.FOLDDER_SPEND_DISABLED_PROVIDERS;
    delete process.env.FOLDDER_SPEND_PROVIDER_DISABLED_GEMINI;
    delete process.env.FOLDDER_WALLET_DDB_TABLE;
    delete process.env.FOLDDER_SAAS_MODE;
    dynamoMock.send.mockReset();
    dynamoMock.send.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it("stays off unless spend controls or SaaS mode are enabled", async () => {
    expect(spendControlsMode()).toBe("off");
    const result = await checkAndRecordSpendControl(BASE_INPUT);
    expect(result).toMatchObject({
      mode: "off",
      provider: "gemini",
      wouldBlock: false,
    });
    expect(dynamoMock.send).not.toHaveBeenCalled();
  });

  it("fails closed in SaaS mode when limits are missing", async () => {
    process.env.FOLDDER_SAAS_MODE = "1";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";

    await expect(checkAndRecordSpendControl(BASE_INPUT)).rejects.toBeInstanceOf(
      SpendControlConfigurationError,
    );
    expect(dynamoMock.send).not.toHaveBeenCalled();
  });

  it("records account/hour, account/day, and provider/day counters atomically", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD = "1";
    process.env.FOLDDER_SPEND_ACCOUNT_DAILY_USD = "5";
    process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD = "25";
    process.env.FOLDDER_SPEND_GLOBAL_DAILY_USD = "100";
    process.env.FOLDDER_SPEND_GLOBAL_MONTHLY_USD = "1000";
    dynamoMock.send.mockImplementation((command) => {
      if (command.constructor.name === "GetCommand") return Promise.resolve({});
      return Promise.resolve({});
    });

    const result = await checkAndRecordSpendControl(BASE_INPUT);

    expect(result).toMatchObject({ mode: "enforce", duplicate: false, wouldBlock: false });
    const tx = txInput();
    expect(tx.ClientRequestToken).toHaveLength(32);
    expect(tx.TransactItems).toHaveLength(6);
    expect(tx.TransactItems[0]?.Put?.Item).toMatchObject({
      entityType: "spend-control-idempotency",
      operationId: "op_123",
      provider: "gemini",
    });

    const accountHour = tx.TransactItems[1]?.Update;
    const accountDay = tx.TransactItems[2]?.Update;
    const providerDay = tx.TransactItems[3]?.Update;
    const globalDay = tx.TransactItems[4]?.Update;
    const globalMonth = tx.TransactItems[5]?.Update;
    expect(accountHour?.Key.sk).toBe("HOUR#2026-06-09T18Z");
    expect(accountDay?.Key.sk).toBe("DAY#2026-06-09");
    expect(providerDay?.Key.pk).toBe("SPEND#PROVIDER#gemini");
    expect(providerDay?.Key.sk).toBe("DAY#2026-06-09");
    expect(globalDay?.Key).toMatchObject({ pk: "SPEND#GLOBAL", sk: "DAY#2026-06-09" });
    expect(globalMonth?.Key).toMatchObject({ pk: "SPEND#GLOBAL", sk: "MONTH#2026-06" });
    expect(providerDay?.ConditionExpression).toContain("#spentMicros <= :remainingMicros");
    expect(accountHour?.ExpressionAttributeValues).toMatchObject({
      ":amountMicros": 250_000,
      ":limitMicros": 1_000_000,
      ":remainingMicros": 750_000,
      ":windowKind": "account_hour",
    });
    expect(providerDay?.ExpressionAttributeValues).toMatchObject({
      ":limitMicros": 25_000_000,
      ":remainingMicros": 24_750_000,
      ":windowKind": "provider_day",
    });
    expect(globalDay?.ExpressionAttributeValues).toMatchObject({
      ":limitMicros": 100_000_000,
      ":remainingMicros": 99_750_000,
      ":windowKind": "global_day",
    });
    expect(globalMonth?.ExpressionAttributeValues).toMatchObject({
      ":limitMicros": 1_000_000_000,
      ":remainingMicros": 999_750_000,
      ":windowKind": "global_month",
    });
  });

  it("uses provider-specific daily limits when configured", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD = "1";
    process.env.FOLDDER_SPEND_ACCOUNT_DAILY_USD = "5";
    process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD = "25";
    process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD_GEMINI = "2";
    process.env.FOLDDER_SPEND_GLOBAL_DAILY_USD = "100";
    process.env.FOLDDER_SPEND_GLOBAL_MONTHLY_USD = "1000";

    await checkAndRecordSpendControl(BASE_INPUT);

    const providerDay = txInput().TransactItems[3]?.Update;
    expect(providerDay?.ExpressionAttributeValues?.[":limitMicros"]).toBe(2_000_000);
  });

  it("releases previously recorded counters atomically from the original counter snapshots", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    const originalCounters = [
      {
        kind: "account_hour",
        pk: "SPEND#ACCOUNT#acct_original",
        sk: "HOUR#2026-06-09T18Z",
        limitMicros: 1_000_000,
        expiresAtEpoch: 1_781_000_000,
        windowStart: "2026-06-09T18Z",
      },
      {
        kind: "global_day",
        pk: "SPEND#GLOBAL",
        sk: "DAY#2026-06-09",
        limitMicros: 100_000_000,
        expiresAtEpoch: 1_781_000_000,
        windowStart: "2026-06-09",
      },
    ];
    dynamoMock.send
      .mockResolvedValueOnce({
        Item: {
          entityType: "spend-control-idempotency",
          operationId: "op_123",
          accountId: "acct_original",
          provider: "gemini",
          result: {
            mode: "enforce",
            operationId: "op_123",
            amountMicros: 250_000,
            provider: "gemini",
            accountId: "acct_original",
            duplicate: false,
            wouldBlock: false,
          },
          counters: originalCounters,
          createdAt: "2026-06-09T18:34:00.000Z",
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await releaseSpendControl({
      userEmail: BASE_INPUT.userEmail,
      operationId: "op_123",
      releaseOperationId: "op_123:release-remainder",
      amountMicros: 100_000,
      reason: "capture_remainder",
      now: new Date("2026-06-09T18:35:00.000Z"),
    });

    expect(result).toMatchObject({
      amountMicros: 100_000,
      duplicate: false,
      provider: "gemini",
      released: true,
      releaseOperationId: "op_123:release-remainder",
    });
    const tx = txInput();
    expect(tx.TransactItems).toHaveLength(3);
    expect(tx.TransactItems[0]?.Put?.Item).toMatchObject({
      entityType: "spend-control-release-idempotency",
      operationId: "op_123",
      releaseOperationId: "op_123:release-remainder",
    });
    const accountHourRelease = tx.TransactItems[1]?.Update;
    const globalDayRelease = tx.TransactItems[2]?.Update;
    expect(accountHourRelease?.Key).toMatchObject({
      pk: "SPEND#ACCOUNT#acct_original",
      sk: "HOUR#2026-06-09T18Z",
    });
    expect(globalDayRelease?.Key).toMatchObject({
      pk: "SPEND#GLOBAL",
      sk: "DAY#2026-06-09",
    });
    expect(accountHourRelease?.ConditionExpression).toContain("#spentMicros >= :amountMicros");
    expect(accountHourRelease?.ExpressionAttributeValues).toMatchObject({
      ":amountMicros": 100_000,
      ":releaseOperationId": "op_123:release-remainder",
      ":releaseReason": "capture_remainder",
    });
  });

  it("does not decrement counters twice for the same spend release operation", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    dynamoMock.send
      .mockResolvedValueOnce({
        Item: {
          entityType: "spend-control-idempotency",
          operationId: "op_123",
          accountId: "acct_original",
          provider: "gemini",
          result: {
            mode: "enforce",
            operationId: "op_123",
            amountMicros: 250_000,
            provider: "gemini",
            accountId: "acct_original",
            duplicate: false,
            wouldBlock: false,
          },
          counters: [
            {
              kind: "account_hour",
              pk: "SPEND#ACCOUNT#acct_original",
              sk: "HOUR#2026-06-09T18Z",
              limitMicros: 1_000_000,
              expiresAtEpoch: 1_781_000_000,
              windowStart: "2026-06-09T18Z",
            },
          ],
          createdAt: "2026-06-09T18:34:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        Item: {
          entityType: "spend-control-release-idempotency",
          result: {
            mode: "enforce",
            operationId: "op_123",
            releaseOperationId: "op_123:release-remainder",
            amountMicros: 100_000,
            provider: "gemini",
            accountId: "acct_original",
            duplicate: false,
            released: true,
            reason: "capture_remainder",
          },
        },
      });

    const result = await releaseSpendControl({
      userEmail: BASE_INPUT.userEmail,
      operationId: "op_123",
      releaseOperationId: "op_123:release-remainder",
      amountMicros: 100_000,
      reason: "capture_remainder",
    });

    expect(result).toMatchObject({ duplicate: true, released: true });
    expect(
      dynamoMock.send.mock.calls.some(
        ([command]) => command.constructor.name === "TransactWriteCommand",
      ),
    ).toBe(false);
  });

  it("blocks single operations above the global hard ceiling before writing counters", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD = "50";
    process.env.FOLDDER_SPEND_ACCOUNT_DAILY_USD = "50";
    process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD = "50";
    process.env.FOLDDER_SPEND_GLOBAL_DAILY_USD = "0.10";
    process.env.FOLDDER_SPEND_GLOBAL_MONTHLY_USD = "1000";

    await expect(checkAndRecordSpendControl(BASE_INPUT)).rejects.toMatchObject({
      name: "SpendControlLimitExceededError",
      windowKind: "global_day",
      limitMicros: 100_000,
      amountMicros: 250_000,
    } satisfies Partial<SpendControlLimitExceededError>);
    expect(dynamoMock.send).not.toHaveBeenCalled();
  });

  it("blocks disabled providers in enforce mode", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_SPEND_DISABLED_PROVIDERS = "gemini, runway";

    await expect(checkAndRecordSpendControl(BASE_INPUT)).rejects.toBeInstanceOf(
      SpendControlProviderDisabledError,
    );
    expect(dynamoMock.send).not.toHaveBeenCalled();
  });

  it("does not block disabled providers in dry_run", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "dry_run";
    process.env.FOLDDER_SPEND_PROVIDER_DISABLED_GEMINI = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await checkAndRecordSpendControl(BASE_INPUT);

    expect(result).toMatchObject({
      mode: "dry_run",
      wouldBlock: true,
      blockedWindow: "provider_disabled",
    });
    expect(dynamoMock.send).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("maps conditional counter failures to the blocking window", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD = "1";
    process.env.FOLDDER_SPEND_ACCOUNT_DAILY_USD = "5";
    process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD = "25";
    process.env.FOLDDER_SPEND_GLOBAL_DAILY_USD = "100";
    process.env.FOLDDER_SPEND_GLOBAL_MONTHLY_USD = "1000";
    dynamoMock.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("cancelled"), {
          name: "TransactionCanceledException",
          CancellationReasons: [
            { Code: "None" },
            { Code: "None" },
            { Code: "ConditionalCheckFailed" },
            { Code: "None" },
          ],
        }),
      )
      .mockResolvedValueOnce({});

    await expect(checkAndRecordSpendControl(BASE_INPUT)).rejects.toMatchObject({
      name: "SpendControlLimitExceededError",
      windowKind: "account_day",
      limitMicros: 5_000_000,
      amountMicros: 250_000,
    } satisfies Partial<SpendControlLimitExceededError>);
  });

  it("returns stored idempotency results without incrementing counters again", async () => {
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "enforce";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    process.env.FOLDDER_SPEND_ACCOUNT_HOURLY_USD = "1";
    process.env.FOLDDER_SPEND_ACCOUNT_DAILY_USD = "5";
    process.env.FOLDDER_SPEND_PROVIDER_DAILY_USD = "25";
    process.env.FOLDDER_SPEND_GLOBAL_DAILY_USD = "100";
    process.env.FOLDDER_SPEND_GLOBAL_MONTHLY_USD = "1000";
    dynamoMock.send.mockResolvedValueOnce({
      Item: {
        result: {
          mode: "enforce",
          operationId: "op_123",
          amountMicros: 250_000,
          provider: "gemini",
          accountId: "acct_existing",
          duplicate: false,
          wouldBlock: false,
        },
      },
    });

    const result = await checkAndRecordSpendControl(BASE_INPUT);

    expect(result).toMatchObject({ duplicate: true, accountId: "acct_existing" });
    expect(
      dynamoMock.send.mock.calls.some(
        ([command]) => command.constructor.name === "TransactWriteCommand",
      ),
    ).toBe(false);
  });
});
