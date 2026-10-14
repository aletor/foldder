import { describe, expect, it } from "vitest";
import { isMediaDerivativeObjectKey, mediaDerivativeObjectKey } from "@/lib/media-derivative-key";

describe("media derivative keys", () => {
  it("stores the webp next to the source key", () => {
    const source = "knowledge-files/user-assets/abc/shot.png";
    expect(mediaDerivativeObjectKey(source, 480)).toBe(
      "knowledge-files/user-assets/abc/shot.png__foldder_480.webp",
    );
    expect(mediaDerivativeObjectKey(source, 1600)).toBe(
      "knowledge-files/user-assets/abc/shot.png__foldder_1600.webp",
    );
  });

  it("clamps the side into the allowed thumb range", () => {
    const source = "knowledge-files/user-assets/abc/shot.png";
    expect(mediaDerivativeObjectKey(source, 10)).toContain("__foldder_64.webp");
    expect(mediaDerivativeObjectKey(source, 9000)).toContain("__foldder_2048.webp");
  });

  it("recognizes derivative keys", () => {
    expect(isMediaDerivativeObjectKey(mediaDerivativeObjectKey("knowledge-files/a.png", 480))).toBe(true);
    expect(isMediaDerivativeObjectKey("knowledge-files/a.png")).toBe(false);
  });
});
