import { describe, expect, it } from "vitest";
import { describeWalletLedgerEntry, movementAmountMicros, visibleSpentMicros } from "./wallet-display";
import type { WalletStatusResponse } from "./wallet-client-events";

type Entry = WalletStatusResponse["recentEntries"][number];

function entry(partial: Partial<Entry> & Pick<Entry, "type">): Entry {
  return {
    entryId: partial.entryId || "entry_1",
    type: partial.type,
    amountMicros: partial.amountMicros ?? 100_000,
    balanceDeltaMicros: partial.balanceDeltaMicros ?? 0,
    reservedDeltaMicros: partial.reservedDeltaMicros ?? 0,
    availableDeltaMicros: partial.availableDeltaMicros ?? 0,
    serviceId: partial.serviceId,
    provider: partial.provider,
    route: partial.route,
    createdAt: partial.createdAt || "2026-06-10T00:00:00.000Z",
  };
}

describe("wallet-display", () => {
  it("translates Stripe purchases into user-facing copy", () => {
    expect(describeWalletLedgerEntry(entry({ type: "purchase" }))).toMatchObject({
      title: "Recarga confirmada",
      subtitle: "Stripe Checkout",
      tone: "positive",
    });
  });

  it("turns capture events into product actions instead of ledger terms", () => {
    expect(
      describeWalletLedgerEntry(
        entry({
          type: "capture",
          serviceId: "gemini-veo",
          route: "/api/gemini/video",
          balanceDeltaMicros: -552_000,
        }),
      ),
    ).toMatchObject({
      title: "Vídeo Veo",
      subtitle: "Consumo aplicado",
      icon: "video",
    });
  });

  it("uses balance deltas as the visible movement amount", () => {
    expect(movementAmountMicros(entry({ type: "capture", amountMicros: 500_000, balanceDeltaMicros: -320_000 }))).toBe(
      -320_000,
    );
  });

  it("summarizes visible spend from captures only", () => {
    const entries = [
      entry({ type: "reserve", availableDeltaMicros: -500_000 }),
      entry({ type: "capture", balanceDeltaMicros: -320_000 }),
      entry({ type: "release", availableDeltaMicros: 180_000 }),
    ];

    expect(visibleSpentMicros(entries)).toBe(320_000);
  });
});
