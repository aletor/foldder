import { beforeEach, describe, expect, it, vi } from "vitest";

let lastCompletionParams: Record<string, unknown> | undefined;

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: vi.fn(async (params: Record<string, unknown>) => {
          lastCompletionParams = params;
          return {
            choices: [
              {
                message: {
                  content:
                    "SUBJECT & POSE: Woman seated on kitchen counter edge.\nCAMERA: Three-quarter left, eye-level medium shot.",
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          };
        }),
      },
    };
  },
}));

vi.mock("@/lib/api-usage", () => ({
  recordApiUsage: vi.fn(async () => undefined),
  resolveUsageUserEmailFromRequest: async () => "test@local.foldder",
}));

vi.mock("@/lib/api-usage-controls", () => ({
  ApiServiceDisabledError: class ApiServiceDisabledError extends Error {
    label = "OpenAI Describe";
  },
  assertApiServiceEnabled: vi.fn(async () => undefined),
}));

vi.mock("@/lib/pricing-config", () => ({
  estimateOpenAIUsd: () => 0.005,
}));

vi.mock("@/lib/spaces-access-control", () => ({
  requireSpacesAuthUser: vi.fn(async () => ({
    ok: true,
    user: { email: "test@local.foldder", image: null, name: "Test" },
  })),
}));

vi.mock("@/lib/wallet-api-gate", () => ({
  reserveApiWalletCharge: vi.fn(async () => ({
    capture: vi.fn(async () => undefined),
  })),
  reserveUsdToMicros: (usd: number) => Math.round(usd * 1_000_000),
  releaseApiWalletChargeOnError: vi.fn(async () => undefined),
  walletGateErrorResponse: () => null,
}));

vi.mock("@/lib/vision-media-prepare", () => ({
  prepareOpenAiVisionImageUrl: vi.fn(async (url: string) => url),
  isVisionRefusalText: () => false,
  VisionMediaPrepareError: class VisionMediaPrepareError extends Error {},
}));

import { MEDIA_DESCRIBER_VISION_PROMPT } from "@/lib/media-describer-prompt";
import { POST } from "./route";

describe("/api/spaces/describe", () => {
  beforeEach(() => {
    lastCompletionParams = undefined;
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("uses structured vision prompt with lower temperature and higher max_tokens", async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from("fake image").toString("base64")}`;
    const request = new Request("http://localhost/api/spaces/describe", {
      method: "POST",
      body: JSON.stringify({ url: dataUrl, type: "image" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.description).toContain("SUBJECT & POSE:");
    expect(lastCompletionParams?.temperature).toBe(0.35);
    expect(lastCompletionParams?.max_tokens).toBe(4096);

    const messages = lastCompletionParams?.messages as Array<{ role: string; content: unknown }>;
    const userContent = messages[0].content as Array<{ type: string; text?: string }>;
    expect(userContent[0].text).toBe(MEDIA_DESCRIBER_VISION_PROMPT);
  });

  it("respects promptOverride when provided", async () => {
    const customPrompt = "Describe only wardrobe colors.";
    const dataUrl = `data:image/png;base64,${Buffer.from("fake image").toString("base64")}`;
    const request = new Request("http://localhost/api/spaces/describe", {
      method: "POST",
      body: JSON.stringify({ url: dataUrl, type: "image", promptOverride: customPrompt }),
    });

    await POST(request);

    const messages = lastCompletionParams?.messages as Array<{ role: string; content: unknown }>;
    const userContent = messages[0].content as Array<{ type: string; text?: string }>;
    expect(userContent[0].text).toBe(customPrompt);
  });
});
