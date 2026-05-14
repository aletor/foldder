import { describe, expect, it } from "vitest";

import { readJsonWithHttpError, type HttpJsonError } from "./read-response-json";

describe("readJsonWithHttpError", () => {
  it("preserves structured error metadata from JSON responses", async () => {
    const response = new Response(
      JSON.stringify({
        code: "PROJECT_DATA_INTEGRITY_ERROR",
        detail: "HASH_MISMATCH",
        error: "Project data integrity check failed.",
        retryable: false,
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );

    await expect(readJsonWithHttpError(response, "GET /api/spaces")).rejects.toMatchObject({
      code: "PROJECT_DATA_INTEGRITY_ERROR",
      detail: "HASH_MISMATCH",
      message: "Project data integrity check failed.",
      retryable: false,
      status: 500,
    } satisfies Partial<HttpJsonError>);
  });

  it("adds status and context for invalid non-JSON responses", async () => {
    const response = new Response("Request Entity Too Large", { status: 413 });

    await expect(readJsonWithHttpError(response, "POST /api/spaces")).rejects.toMatchObject({
      context: "POST /api/spaces",
      message: "POST /api/spaces: respuesta no válida (413).",
      status: 413,
    } satisfies Partial<HttpJsonError>);
  });
});
