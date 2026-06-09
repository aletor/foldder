import { describe, expect, it, vi } from "vitest";

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));

vi.mock("@/lib/api-usage-s3", () => ({
  isUsageS3Enabled: () => false,
  readUsageLogFromS3: async () => "",
  appendUsageLineToS3Queued: async () => {},
}));

vi.mock("@/lib/auth", () => ({
  auth: async () => null,
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  const mod = actual as unknown as { default?: Record<string, unknown> };
  const base = { ...(mod.default ?? (actual as unknown as Record<string, unknown>)) } as Record<string, unknown>;
  const inner = { ...base, readFile: readFileMock };
  return {
    ...actual,
    default: inner,
    readFile: readFileMock,
  };
});

import {
  aggregateUsageSince,
  inferServiceIdFromRecord,
  type UsageRecordLine,
} from "@/lib/api-usage";

function line(overrides: Partial<UsageRecordLine> & Pick<UsageRecordLine, "provider" | "route">): UsageRecordLine {
  return {
    ts: new Date().toISOString(),
    costUsd: 0,
    ...overrides,
  } as UsageRecordLine;
}

describe("inferServiceIdFromRecord", () => {
  it("clasifica verificación Gemini en /api/spaces/search con operation explícita", () => {
    const id = inferServiceIdFromRecord(
      line({
        provider: "gemini",
        route: "/api/spaces/search",
        operation: "image_intent_verify",
        serviceId: undefined,
      }),
    );
    expect(id).toBe("gemini-search-verify");
  });

  it("no asigna gemini-search-verify a /api/spaces/search sin evidencia de verificación", () => {
    const id = inferServiceIdFromRecord(
      line({
        provider: "gemini",
        route: "/api/spaces/search",
        model: "gemini-2.0-flash",
        serviceId: undefined,
      }),
    );
    expect(id).toBe("unknown-ai");
  });

  it("respeta serviceId openai-embeddings en legado sin reasignar a assistant", () => {
    expect(
      inferServiceIdFromRecord(
        line({
          provider: "openai",
          route: "/api/spaces/brain/knowledge/chat",
          serviceId: "openai-embeddings",
          operation: "embedding",
        }),
      ),
    ).toBe("openai-embeddings");
  });

  it("mapea rutas Beeble sin serviceId", () => {
    expect(
      inferServiceIdFromRecord(line({ provider: "beeble", route: "/api/beeble/foo/bar" })),
    ).toBe("beeble-api");
  });

  it("mapea Inspiration Unsplash sin serviceId", () => {
    expect(
      inferServiceIdFromRecord(line({ provider: "unsplash", route: "/api/inspiration/search" })),
    ).toBe("unsplash-search");
  });
});

describe("aggregateUsageSince", () => {
  it("agrupa por serviceId y separa embeddings de brain chat", async () => {
    readFileMock.mockImplementation(async (p: string | URL) => {
      const s = String(p);
      if (s.includes("usage") && s.includes("jsonl")) {
        const ts = "2026-04-20T12:00:00.000Z";
        return [
          JSON.stringify({
            ts,
            provider: "openai",
            route: "/api/spaces/brain/knowledge/chat",
            serviceId: "openai-brain-chat",
            model: "gpt-4o",
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            costUsd: 0,
          }),
          JSON.stringify({
            ts,
            provider: "openai",
            route: "/api/spaces/brain/knowledge/chat",
            serviceId: "openai-embeddings",
            model: "text-embedding-3-small",
            operation: "embedding",
            inputTokens: 20,
            outputTokens: 0,
            totalTokens: 20,
            costUsd: 0,
          }),
        ].join("\n");
      }
      throw new Error("enoent");
    });

    const agg = await aggregateUsageSince("2026-04-01T00:00:00.000Z");
    const chat = agg.services.find((s) => s.id === "openai-brain-chat");
    const emb = agg.services.find((s) => s.id === "openai-embeddings");
    expect(chat?.calls).toBe(1);
    expect(emb?.calls).toBe(1);
    expect(chat?.totalTokens).toBe(15);
    expect(emb?.totalTokens).toBe(20);

    const brainCat = agg.categories.find((c) => c.category === "brain");
    const embCat = agg.categories.find((c) => c.category === "embeddings");
    expect(brainCat?.services.some((s) => s.id === "openai-brain-chat" && s.calls === 1)).toBe(true);
    expect(embCat?.services.some((s) => s.id === "openai-embeddings" && s.calls === 1)).toBe(true);

    readFileMock.mockReset();
  });

  it("acepta líneas antiguas sin serviceId vía inferencia", async () => {
    readFileMock.mockImplementation(async (p: string | URL) => {
      const s = String(p);
      if (s.includes("usage") && s.includes("jsonl")) {
        const ts = "2026-04-20T12:00:00.000Z";
        return JSON.stringify({
          ts,
          provider: "openai",
          route: "/api/spaces/brain/knowledge/analyze",
          model: "gpt-4o",
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          costUsd: 0,
        });
      }
      throw new Error("enoent");
    });

    const agg = await aggregateUsageSince("2026-04-01T00:00:00.000Z");
    const row = agg.services.find((s) => s.id === "openai-brain-analyze");
    expect(row?.calls).toBe(1);

    readFileMock.mockReset();
  });
});
