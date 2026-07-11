import { describe, expect, it } from "vitest";
import {
  patchButtonLocaleLabel,
  patchTextLocaleValue,
  resolveButtonLabel,
  resolveTextValue,
} from "./site-i18n";
import type { ButtonContent, TextContent } from "./site-types";

describe("site-i18n", () => {
  it("resolves localized text with fallback to value", () => {
    const content: TextContent = {
      role: "body",
      value: "Hola",
      localeValues: { en: "Hello" },
    };
    expect(resolveTextValue(content, "en")).toBe("Hello");
    expect(resolveTextValue(content, "fr")).toBe("Hola");
  });

  it("patches locale-specific text values", () => {
    const content: TextContent = { role: "h1", value: "Título" };
    const next = patchTextLocaleValue(content, "en", "Title");
    expect(next.localeValues?.en).toBe("Title");
    expect(next.value).toBe("Título");
  });

  it("resolves button labels per locale", () => {
    const content: ButtonContent = {
      label: "Empezar",
      localeLabels: { en: "Start" },
      target: { kind: "url", value: "#" },
      variant: "primary",
    };
    expect(resolveButtonLabel(content, "en")).toBe("Start");
    expect(patchButtonLocaleLabel(content, "en", "Go").localeLabels?.en).toBe("Go");
  });
});
