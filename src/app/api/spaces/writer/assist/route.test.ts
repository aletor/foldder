import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => vi.fn(async () => undefined));
const release = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create } };
  },
}));

vi.mock("@/lib/api-usage", () => ({
  recordApiUsage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api-usage-controls", () => ({
  ApiServiceDisabledError: class ApiServiceDisabledError extends Error {
    label = "OpenAI";
  },
  assertApiServiceEnabled: vi.fn(async () => undefined),
}));

vi.mock("@/lib/pricing-config", () => ({
  estimateOpenAIUsd: () => 0.001,
}));

vi.mock("@/lib/spaces-access-control", () => ({
  requireSpacesAuthUser: vi.fn(async () => ({
    ok: true,
    user: { email: "test@local.foldder", image: null, name: "Test" },
  })),
}));

vi.mock("@/lib/wallet-api-gate", () => ({
  reserveApiWalletCharge: vi.fn(async () => ({ capture, release })),
  reserveUsdToMicros: (usd: number) => Math.round(usd * 1_000_000),
  releaseApiWalletChargeOnError: release,
  walletGateErrorResponse: () => null,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/spaces/writer/assist", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/spaces/writer/assist", () => {
  beforeEach(() => {
    create.mockReset();
    capture.mockClear();
    release.mockClear();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("returns one proposal and does not call the model again", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "seguía lloviendo" } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
    });
    const response = await POST(
      request({ action: "continue", profile: "document", before: "Llovía.", after: "", selection: "" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "seguía lloviendo" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it("does not call the model again when the proposal is empty", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "   " } }],
      usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
    });
    const response = await POST(
      request({ action: "continue", profile: "document", before: "Llovía.", after: "", selection: "" }),
    );
    expect(response.status).toBe(502);
    expect(create).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("stops after a provider error", async () => {
    create.mockRejectedValueOnce(new Error("timeout"));
    const response = await POST(
      request({ action: "rewrite", profile: "post", before: "", after: "", selection: "frase larga" }),
    );
    expect(response.status).toBe(500);
    expect(create).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
  });

  it("answers Ask Story once and does not call the model again when the JSON is unreadable", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: '{"answer":"Una posible motivación sería recuperar el control.","suggestedMemories":[{"text":"Recuperar el control."}]}' } }],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    });
    const response = await POST(
      request({
        action: "ask_story",
        profile: "screenplay",
        question: "¿Cuál podría ser ahora la motivación de Pedro?",
        preview: { title: "Pedro", notes: 1, fragments: 2, chapters: "CAP. 2" },
        storyContext: {
          entities: [{ label: "Pedro", definition: "Es orgulloso.", established: ["Su hermana ve su vulnerabilidad."] }],
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ answer: "Una posible motivación sería recuperar el control." });
    expect(create).toHaveBeenCalledTimes(1);

    create.mockResolvedValueOnce({
      choices: [{ message: { content: "Pedro quiere vengar a su padre" } }],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
    });
    const plain = await POST(
      request({ action: "ask_story", profile: "document", question: "¿Cómo afecta la muerte del padre?" }),
    );
    expect(plain.status).toBe(200);
    expect(await plain.json()).toMatchObject({ answer: "Pedro quiere vengar a su padre" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("reads one Update Story completion and does not retry a broken payload", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: '{"storyDelta":{"events":[],"stateChanges":[],"facts":[],"analyzedBlockIds":["b1"]}}' } }],
      usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
    });
    const response = await POST(
      request({
        action: "update_story",
        profile: "screenplay",
        batch: { dirty: [{ blockId: "b1", text: "Pedro salta del barco." }] },
        preview: { blocks: 1, characters: 1, chapterCount: 1, calls: 1 },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ storyDelta: { analyzedBlockIds: ["b1"] } });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ temperature: 0.2 });

    create.mockResolvedValueOnce({
      choices: [{ message: { content: "Pedro podría vengarse." } }],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
    });
    const broken = await POST(
      request({
        action: "update_story",
        profile: "screenplay",
        batch: { dirty: [{ blockId: "b1", text: "Pedro salta del barco." }] },
      }),
    );
    expect(broken.status).toBe(502);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not call the model when the fragment is missing", async () => {
    const response = await POST(request({ action: "rewrite", profile: "document", selection: "" }));
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
