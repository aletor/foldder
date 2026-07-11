import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getVectorizerCredentials, vectorizeRasterBuffer } from "./vectorizer-ai-client";

describe("vectorizer-ai-client", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.VECTORIZER_API_ID;
    delete process.env.VECTORIZER_API_SECRET;
    delete process.env.VECTORIZER_BASIC_AUTH;
    delete process.env.VECTORIZER_API_KEY;
  });

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("getVectorizerCredentials usa ID + secret", () => {
    process.env.VECTORIZER_API_ID = "test-id";
    process.env.VECTORIZER_API_SECRET = "test-secret";
    const creds = getVectorizerCredentials();
    expect(creds?.authorizationHeader).toBe(`Basic ${Buffer.from("test-id:test-secret").toString("base64")}`);
  });

  it("vectorizeRasterBuffer envía multipart a Vectorizer.AI", async () => {
    process.env.VECTORIZER_API_ID = "id";
    process.env.VECTORIZER_API_SECRET = "secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<svg></svg>", { status: 200, headers: { "Content-Type": "image/svg+xml" } }),
    );

    const svg = await vectorizeRasterBuffer({
      buffer: Buffer.from("fake-png"),
      filename: "logo.png",
      mode: "test",
    });

    expect(svg.toString()).toContain("<svg");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.vectorizer.ai/api/v1/vectorize",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
  });
});
