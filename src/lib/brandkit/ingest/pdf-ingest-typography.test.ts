import { describe, expect, it, vi } from "vitest";
import { createBrandKitTypographyVisionInvoker } from "./pdf-ingest-typography";

vi.mock("@/lib/brain/pdf-typography-vision-fallback", () => ({
  synthesizeTypographyFromPdfRenders: vi.fn(),
}));

import { synthesizeTypographyFromPdfRenders } from "@/lib/brain/pdf-typography-vision-fallback";

describe("createBrandKitTypographyVisionInvoker", () => {
  const buffer = Buffer.from("pdf");

  it("no expone invoker sin allowPaidRefinement", () => {
    expect(createBrandKitTypographyVisionInvoker(buffer, { allowPaidRefinement: false })).toBeUndefined();
    expect(synthesizeTypographyFromPdfRenders).not.toHaveBeenCalled();
  });

  it("expone invoker y mapea el resultado de visión", async () => {
    vi.mocked(synthesizeTypographyFromPdfRenders).mockResolvedValue({
      typography: { primary: { family: "Fraktul", weights: ["Regular"] } },
      confidence: 0.42,
      evidenceKind: "llm-synthesis",
      provider: "mock",
    });

    const invoker = createBrandKitTypographyVisionInvoker(buffer, {
      allowPaidRefinement: true,
      userEmail: "user@test.com",
    });
    expect(invoker).toBeTypeOf("function");

    const guess = await invoker!();
    expect(guess?.primary?.family).toBe("Fraktul");
    expect(synthesizeTypographyFromPdfRenders).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer,
        userEmail: "user@test.com",
        route: "/lib/brandKit/ingest/pdf",
      }),
    );
  });
});
