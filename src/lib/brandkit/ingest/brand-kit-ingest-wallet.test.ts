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

describe("reserveBrandKitIngestAnalysisCharge", () => {
  beforeEach(() => {
    reserveApiWalletCharge.mockReset();
  });

  it("reintenta con operationId nuevo tras duplicate_wallet_operation", async () => {
    const capture = vi.fn();
    reserveApiWalletCharge
      .mockRejectedValueOnce(new WalletDuplicateOperationError("brandKit:ingest:old"))
      .mockResolvedValueOnce({ capture, release: vi.fn() });

    const { reserveBrandKitIngestAnalysisCharge } = await import("./brand-kit-ingest-wallet");
    const charge = await reserveBrandKitIngestAnalysisCharge({
      userEmail: "user@test.com",
      contentSignature: "abc123deadbeef",
      kind: "pdf",
      operationId: "brandKit:ingest:old",
    });

    expect(charge).toBeTruthy();
    expect(reserveApiWalletCharge).toHaveBeenCalledTimes(2);
    const secondId = reserveApiWalletCharge.mock.calls[1]?.[0]?.operationId as string;
    expect(secondId).not.toBe("brandKit:ingest:old");
    expect(secondId.startsWith("brandKit:ingest:")).toBe(true);
  });
});
