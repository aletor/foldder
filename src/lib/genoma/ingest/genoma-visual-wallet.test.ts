import { describe, expect, it, vi, beforeEach } from "vitest";
import { WalletDuplicateOperationError } from "@/lib/wallet-api-gate";
import { reserveGenomaVisualGenerateCharge } from "./genoma-visual-wallet";

vi.mock("@/lib/wallet-api-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wallet-api-gate")>();
  return {
    ...actual,
    reserveApiWalletCharge: vi.fn(),
    walletGateMode: () => "enforce" as const,
  };
});

import { reserveApiWalletCharge } from "@/lib/wallet-api-gate";

describe("reserveGenomaVisualGenerateCharge", () => {
  beforeEach(() => {
    vi.mocked(reserveApiWalletCharge).mockReset();
  });

  it("reintenta con operationId nuevo tras duplicate_wallet_operation", async () => {
    vi.mocked(reserveApiWalletCharge)
      .mockRejectedValueOnce(new WalletDuplicateOperationError("genoma:visual:old"))
      .mockResolvedValueOnce({
        mode: "enforce",
        operationId: "genoma:visual:new",
        reservationId: "res-1",
        reservedMicros: 1000,
        capture: vi.fn(),
        release: vi.fn(),
      } as never);

    const charge = await reserveGenomaVisualGenerateCharge({
      userEmail: "user@test.com",
      axesSignature: "sujeto=personas",
      operationId: "genoma:visual:old",
    });

    expect(charge?.operationId).toBe("genoma:visual:new");
    expect(reserveApiWalletCharge).toHaveBeenCalledTimes(2);
  });
});
