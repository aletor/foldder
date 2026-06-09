import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMock = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@/lib/dynamo-utils", () => ({
  ddbClient: { send: dynamoMock.send },
}));

import {
  billingNotificationsMode,
  lowBalanceTemplate,
  notifyLowWalletBalance,
  sendBillingNotification,
  topupConfirmedTemplate,
  walletLowBalanceThresholdMicros,
} from "./billing-notifications";

function commandInput(name: string) {
  const call = dynamoMock.send.mock.calls.find(([command]) => command.constructor.name === name);
  if (!call) throw new Error(`No ${name} was sent`);
  return call[0].input as Record<string, unknown>;
}

describe("billing-notifications", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...previousEnv };
    delete process.env.FOLDDER_BILLING_NOTIFICATIONS_MODE;
    delete process.env.FOLDDER_BILLING_EMAIL_FROM;
    delete process.env.FOLDDER_BILLING_EMAIL_REPLY_TO;
    delete process.env.FOLDDER_WALLET_DDB_TABLE;
    delete process.env.FOLDDER_WALLET_LOW_BALANCE_USD;
    delete process.env.RESEND_API_KEY;
    dynamoMock.send.mockReset();
    dynamoMock.send.mockResolvedValue({});
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = previousEnv;
  });

  it("stays off unless explicitly enabled or Resend is configured", async () => {
    expect(billingNotificationsMode()).toBe("off");

    const result = await sendBillingNotification({
      kind: "wallet_topup_confirmed",
      userEmail: "buyer@example.com",
      dedupeKey: "topup:cs_123",
      subject: "Recarga confirmada",
      text: "ok",
    });

    expect(result).toEqual({ sent: false, skipped: true, reason: "mode_off" });
    expect(dynamoMock.send).not.toHaveBeenCalled();
  });

  it("supports low-balance threshold configuration", () => {
    expect(walletLowBalanceThresholdMicros()).toBe(2_000_000);
    process.env.FOLDDER_WALLET_LOW_BALANCE_USD = "7.5";
    expect(walletLowBalanceThresholdMicros()).toBe(7_500_000);
  });

  it("claims and logs notifications idempotently in log mode", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.FOLDDER_BILLING_NOTIFICATIONS_MODE = "log";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";

    const template = topupConfirmedTemplate({ amountMicros: 25_000_000 });
    const result = await sendBillingNotification({
      kind: "wallet_topup_confirmed",
      userEmail: "buyer@example.com",
      dedupeKey: "topup:cs_123",
      subject: template.subject,
      text: template.text,
      html: template.html,
      now: new Date("2026-06-10T00:00:00.000Z"),
    });

    expect(result).toMatchObject({ sent: true, skipped: false, mode: "log" });
    expect(consoleInfo).toHaveBeenCalledWith(
      "[billing-notification]",
      expect.objectContaining({
        kind: "wallet_topup_confirmed",
        subject: "Recarga confirmada en Foldder",
        userEmail: "buyer@example.com",
      }),
    );
    const put = commandInput("PutCommand");
    expect(put).toMatchObject({
      TableName: "wallet-test",
      ConditionExpression: "attribute_not_exists(#pk) OR #status = :failed",
    });
    expect(put.Item).toMatchObject({
      entityType: "billing-notification",
      kind: "wallet_topup_confirmed",
      status: "claimed",
      userEmail: "buyer@example.com",
    });
    const update = commandInput("UpdateCommand");
    expect(update.ExpressionAttributeValues).toMatchObject({ ":status": "logged" });
  });

  it("skips duplicate notification claims", async () => {
    process.env.FOLDDER_BILLING_NOTIFICATIONS_MODE = "log";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    const error = new Error("duplicate") as Error & { name: string };
    error.name = "ConditionalCheckFailedException";
    dynamoMock.send.mockRejectedValueOnce(error);

    const result = await sendBillingNotification({
      kind: "wallet_topup_confirmed",
      userEmail: "buyer@example.com",
      dedupeKey: "topup:cs_123",
      subject: "Recarga confirmada",
      text: "ok",
    });

    expect(result).toEqual({ sent: false, skipped: true, reason: "duplicate" });
    expect(dynamoMock.send).toHaveBeenCalledTimes(1);
  });

  it("sends through Resend in send mode after claiming idempotency", async () => {
    process.env.FOLDDER_BILLING_NOTIFICATIONS_MODE = "send";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    process.env.FOLDDER_BILLING_EMAIL_FROM = "Foldder <billing@foldder.test>";
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const template = lowBalanceTemplate({ availableMicros: 1_000_000, thresholdMicros: 2_000_000 });
    const result = await sendBillingNotification({
      kind: "wallet_low_balance",
      userEmail: "buyer@example.com",
      dedupeKey: "low-balance:2026-06-10",
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    expect(result).toMatchObject({ sent: true, skipped: false, mode: "send" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer re_test" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: "Foldder <billing@foldder.test>",
      subject: "Tu saldo Foldder está bajo",
      to: ["buyer@example.com"],
    });
    expect(commandInput("UpdateCommand").ExpressionAttributeValues).toMatchObject({ ":status": "sent" });
  });

  it("does not notify low balance while the account remains above threshold", async () => {
    process.env.FOLDDER_BILLING_NOTIFICATIONS_MODE = "log";
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";

    const result = await notifyLowWalletBalance({
      userEmail: "buyer@example.com",
      availableMicros: 3_000_000,
      thresholdMicros: 2_000_000,
      operationId: "op_1",
    });

    expect(result).toBeNull();
    expect(dynamoMock.send).not.toHaveBeenCalled();
  });
});
