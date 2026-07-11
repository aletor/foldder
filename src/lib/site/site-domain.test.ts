import { describe, expect, it } from "vitest";
import { foldderCdnHostname, normalizeCustomDomain, validateCustomDomain } from "./site-domain";

describe("site-domain", () => {
  it("builds foldder CDN hostname from slug", () => {
    expect(foldderCdnHostname("mi-marca")).toBe("mi-marca.foldder.com");
  });

  it("normalizes custom domain input", () => {
    expect(normalizeCustomDomain("HTTPS://WWW.Ejemplo.COM/path")).toBe("www.ejemplo.com");
  });

  it("validates custom domains", () => {
    expect(validateCustomDomain("www.marca.com")).toEqual({ ok: true, domain: "www.marca.com" });
    expect(validateCustomDomain("")).toEqual({ ok: false, error: "Dominio vacío." });
    expect(validateCustomDomain("demo.foldder.com").ok).toBe(false);
  });
});
