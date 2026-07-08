import { describe, expect, it, vi, beforeEach } from "vitest";
import { WalletDuplicateOperationError } from "@/lib/wallet-api-gate";

const reserveApiWalletCharge = vi.fn();

vi.mock("@/lib/wallet-api-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wallet-api-gate")>();
  return {
    ...actual,
    reserveApiWalletCharge: (...args: unknown[]) => reserveApiWalletCharge(...args),
    walletGateMode: () => "enforce" as const,
  };
});

describe("reserveGenomaIngestAnalysisCharge", () => {
  beforeEach(() => {
    reserveApiWalletCharge.mockReset();
  });

  it("reintenta con operationId nuevo tras duplicate_wallet_operation", async () => {
    const capture = vi.fn();
    reserveApiWalletCharge
      .mockRejectedValueOnce(new WalletDuplicateOperationError("genoma:ingest:old"))
      .mockResolvedValueOnce({ capture, release: vi.fn() });

    const { reserveGenomaIngestAnalysisCharge } = await import("./genoma-ingest-wallet");
    const charge = await reserveGenomaIngestAnalysisCharge({
      userEmail: "user@test.com",
      contentSignature: "abc123deadbeef",
      kind: "pdf",
      operationId: "genoma:ingest:old",
    });

    expect(charge).toBeTruthy();
    expect(reserveApiWalletCharge).toHaveBeenCalledTimes(2);
    const secondId = reserveApiWalletCharge.mock.calls[1]?.[0]?.operationId as string;
    expect(secondId).not.toBe("genoma:ingest:old");
    expect(secondId.startsWith("genoma:ingest:")).toBe(true);
  });
});
