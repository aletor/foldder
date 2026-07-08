import { describe, expect, it } from "vitest";
import { normalizeBrainMeta } from "./brain-meta";

describe("normalizeBrainMeta", () => {
  it("preserva rejectedLogoSignatures y pendingLogoPicker", () => {
    const meta = normalizeBrainMeta({
      brainVersion: 2,
      analysisStatus: "idle",
      staleReasons: [],
      rejectedLogoSignatures: ["abc123", "0".repeat(32)],
      pendingLogoPicker: true,
    });
    expect(meta.rejectedLogoSignatures).toEqual(["abc123", "0".repeat(32)]);
    expect(meta.pendingLogoPicker).toBe(true);
  });
});
