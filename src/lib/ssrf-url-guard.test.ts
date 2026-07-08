import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateOrLocalHostname, SsrfBlockedUrlError } from "./ssrf-url-guard";

describe("ssrf-url-guard", () => {
  it("blocks private and local hostnames", () => {
    expect(isPrivateOrLocalHostname("127.0.0.1")).toBe(true);
    expect(isPrivateOrLocalHostname("10.0.0.1")).toBe(true);
    expect(isPrivateOrLocalHostname("169.254.169.254")).toBe(true);
    expect(isPrivateOrLocalHostname("localhost")).toBe(true);
    expect(isPrivateOrLocalHostname("example.com")).toBe(false);
  });

  it("rejects credentials in URL", async () => {
    await expect(assertPublicHttpUrl("https://user:pass@example.com/path")).rejects.toBeInstanceOf(SsrfBlockedUrlError);
  });

  it("rejects non-standard ports", async () => {
    await expect(assertPublicHttpUrl("http://example.com:8080/")).rejects.toBeInstanceOf(SsrfBlockedUrlError);
  });
});
