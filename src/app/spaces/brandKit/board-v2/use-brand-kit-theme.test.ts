import { describe, expect, it } from "vitest";
import { createEmptyBrandKit } from "@/lib/brandkit/brand-kit-defaults";
import { deriveBrandThemeFromDoc } from "@/lib/brandkit/brand-theme-color";
import { useBrandKitTheme } from "./use-brand-kit-theme";
import { renderHook } from "@testing-library/react";

describe("useBrandKitTheme", () => {
  it("conserva el último tema cuando palette pasa a candidates", () => {
    const resolved = createEmptyBrandKit();
    resolved.slots.palette = {
      ...resolved.slots.palette,
      status: "resolved",
      value: {
        colors: [
          { hex: "#1B3A8A", role: "primary" },
          { hex: "#141414", role: "text" },
        ],
      },
      confidence: 0.9,
    };

    const { result, rerender } = renderHook(({ doc }) => useBrandKitTheme(doc), {
      initialProps: { doc: resolved },
    });

    expect(result.current.ready).toBe(true);
    const firstPrimary = result.current.vars["--brand-primary"];

    const candidates = {
      ...resolved,
      slots: {
        ...resolved.slots,
        palette: {
          ...resolved.slots.palette,
          status: "candidates" as const,
          value: undefined,
          candidates: [
            {
              value: { colors: [{ hex: "#FF0000", role: "primary" as const }] },
              score: 0.8,
              provenance: { type: "file_upload" as const, detail: "new.pdf" },
            },
          ],
        },
      },
    };

    rerender({ doc: candidates });
    expect(result.current.ready).toBe(true);
    expect(result.current.vars["--brand-primary"]).toBe(firstPrimary);
  });

  it("vuelve a neutro en brandKit vacío", () => {
    const resolved = createEmptyBrandKit();
    resolved.slots.palette = {
      ...resolved.slots.palette,
      status: "resolved",
      value: { colors: [{ hex: "#1B3A8A", role: "primary" }] },
      confidence: 0.9,
    };

    const { result, rerender } = renderHook(({ doc }) => useBrandKitTheme(doc), {
      initialProps: { doc: resolved },
    });
    expect(result.current.ready).toBe(true);

    rerender({ doc: createEmptyBrandKit() });
    expect(result.current.ready).toBe(false);
  });

  it("recalcula al volver a resolved", () => {
    const resolved = createEmptyBrandKit();
    resolved.slots.palette = {
      ...resolved.slots.palette,
      status: "resolved",
      value: {
        colors: [
          { hex: "#1B3A8A", role: "primary" },
          { hex: "#141414", role: "text" },
        ],
      },
      confidence: 0.9,
    };

    const { result, rerender } = renderHook(({ doc }) => useBrandKitTheme(doc), {
      initialProps: { doc: resolved },
    });

    const candidates = {
      ...resolved,
      slots: {
        ...resolved.slots,
        palette: {
          ...resolved.slots.palette,
          status: "candidates" as const,
          value: undefined,
          candidates: [],
        },
      },
    };
    rerender({ doc: candidates });

    const nextResolved = {
      ...resolved,
      slots: {
        ...resolved.slots,
        palette: {
          ...resolved.slots.palette,
          status: "resolved" as const,
          value: {
            colors: [
              { hex: "#FF6B00", role: "primary" as const },
              { hex: "#141414", role: "text" as const },
            ],
          },
        },
      },
    };
    rerender({ doc: nextResolved });

    expect(result.current.vars["--brand-primary"]).toBe("#FF6B00");
    expect(deriveBrandThemeFromDoc(nextResolved).ready).toBe(true);
  });
});
