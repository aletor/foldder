import { describe, expect, it } from "vitest";
import {
  describeWalletLedgerEntry,
  groupWalletActivityRows,
  movementAmountMicros,
  visibleSpentMicros,
} from "./wallet-display";
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
    reservationId: partial.reservationId,
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

  it("groups reserve, capture, and release from one OpenAI call into one activity row", () => {
    const entries = [
      entry({
        entryId: "release_1",
        type: "release",
        reservationId: "rsv_openai_1",
        amountMicros: 35_000,
        availableDeltaMicros: 35_000,
        serviceId: "openai-enhance",
        provider: "openai",
        route: "/api/openai/enhance",
        createdAt: "2026-06-10T14:41:03.000Z",
      }),
      entry({
        entryId: "capture_1",
        type: "capture",
        reservationId: "rsv_openai_1",
        amountMicros: 5_000,
        balanceDeltaMicros: -5_000,
        serviceId: "openai-enhance",
        provider: "openai",
        route: "/api/openai/enhance",
        createdAt: "2026-06-10T14:41:02.000Z",
      }),
      entry({
        entryId: "reserve_1",
        type: "reserve",
        reservationId: "rsv_openai_1",
        amountMicros: 40_000,
        availableDeltaMicros: -40_000,
        serviceId: "openai-enhance",
        provider: "openai",
        route: "/api/openai/enhance",
        createdAt: "2026-06-10T14:41:01.000Z",
      }),
    ];

    expect(groupWalletActivityRows(entries)).toEqual([
      expect.objectContaining({
        title: "Prompt mejorado",
        nodeLabel: "Nodo Prompt",
        providerLabel: "OpenAI",
        status: "settled",
        reserveMicros: 40_000,
        captureMicros: 5_000,
        releaseMicros: 35_000,
        netMicros: -5_000,
        entryCount: 3,
      }),
    ]);
  });

  it("keeps standalone purchases as compact activity rows", () => {
    expect(
      groupWalletActivityRows([
        entry({
          type: "purchase",
          amountMicros: 25_000_000,
          balanceDeltaMicros: 25_000_000,
          availableDeltaMicros: 25_000_000,
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        title: "Recarga confirmada",
        providerLabel: "Foldder",
        status: "credited",
        netMicros: 25_000_000,
      }),
    ]);
  });
});
