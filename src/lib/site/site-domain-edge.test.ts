import { describe, expect, it } from "vitest";
import { resolveSlugFromCdnHost } from "./site-domain-edge";

describe("site-domain-edge", () => {
  it("resolves slug from CDN subdomain", () => {
    expect(resolveSlugFromCdnHost("mi-marca.foldder.com")).toBe("mi-marca");
    expect(resolveSlugFromCdnHost("localhost:3000")).toBeNull();
    expect(resolveSlugFromCdnHost("www.example.com")).toBeNull();
  });
});
