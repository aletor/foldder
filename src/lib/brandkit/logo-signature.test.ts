import { describe, expect, it } from "vitest";
import { appendRejectedLogoSignature, shouldVectorizeOnValidation } from "./vectorize-logo";
import { logoUrlSignature } from "./logo-signature";
import { defaultProjectAssets } from "@/app/spaces/project-assets-metadata";

describe("logo-signature + L6 hooks", () => {
  it("logoUrlSignature es estable por pathname", () => {
    expect(logoUrlSignature("https://cdn.example.com/logos/acme.png?v=1")).toBe("/logos/acme.png?v=1");
  });

  it("shouldVectorizeOnValidation solo en logo.primary", () => {
    expect(shouldVectorizeOnValidation("logo.primary")).toBe(true);
    expect(shouldVectorizeOnValidation("logo.alt")).toBe(false);
  });

  it("appendRejectedLogoSignature acumula firmas en brainMeta", () => {
    const assets = defaultProjectAssets();
    const next = appendRejectedLogoSignature(assets, "https://x.test/logo.png");
    expect(next.brainMeta?.rejectedLogoSignatures).toContain("/logo.png");
  });
});
