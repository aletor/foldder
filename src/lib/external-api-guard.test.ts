import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGuardedFetch,
  getExternalApiVerifyBlocked,
  resetExternalApiGuardForTests,
} from "./external-api-guard";

describe("external-api-guard", () => {
  beforeEach(() => {
    resetExternalApiGuardForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows parallel calls to the same route with different bodies", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const inner = vi.fn(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const guarded = createGuardedFetch(inner);

    const [a, b] = await Promise.all([
      guarded("/api/grok/generate", { method: "POST", body: JSON.stringify({ prompt: "a" }) }),
      guarded("/api/grok/generate", { method: "POST", body: JSON.stringify({ prompt: "b" }) }),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(2);
    expect(getExternalApiVerifyBlocked()).toBe(false);
  });

  it("rejects an exact duplicate within the repeat window without global block", async () => {
    const inner = vi.fn(async () => new Response("{}", { status: 200 }));
    const guarded = createGuardedFetch(inner);
    const init = { method: "POST", body: JSON.stringify({ prompt: "same" }) };

    const first = await guarded("/api/openai/enhance", init);
    const second = await guarded("/api/openai/enhance", init);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(getExternalApiVerifyBlocked()).toBe(false);
  });

  it("allows the same route again after the repeat window", async () => {
    const inner = vi.fn(async () => new Response("{}", { status: 200 }));
    const guarded = createGuardedFetch(inner);
    const init = { method: "POST", body: JSON.stringify({ prompt: "same" }) };

    await guarded("/api/openai/enhance", init);
    vi.advanceTimersByTime(4001);
    const again = await guarded("/api/openai/enhance", init);

    expect(again.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("does not guard non-AI routes", async () => {
    const inner = vi.fn(async () => new Response("{}", { status: 200 }));
    const guarded = createGuardedFetch(inner);
    const init = { method: "POST", body: "{}" };

    await guarded("/api/spaces", init);
    await guarded("/api/spaces", init);

    expect(inner).toHaveBeenCalledTimes(2);
  });
});
