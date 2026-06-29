import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProfileForCamera } from "./lightroom-bundled-profiles";
import { parseDcpFile } from "./lightroom-dcp-parser";
import type { CameraProfile } from "./lightroom-profile-registry";

describe("lightroom-bundled-profiles", () => {
  it("parseDcpFile reads color matrix from bundled Canon 5D Mark II Adobe Standard", () => {
    const path = join(
      process.cwd(),
      "public/assets/camera-profiles/canon/Canon EOS 5D Mark II Adobe Standard.dcp",
    );
    const buf = readFileSync(path);
    const dcp = parseDcpFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "Canon EOS 5D Mark II.dcp");
    expect(dcp.uniqueCameraModel).toBe("Canon EOS 5D Mark II");
    expect(dcp.colorMatrix1[0]).toBeGreaterThan(0.5);
    expect(dcp.colorMatrix1[0]).toBeLessThan(1.5);
  });

  it("cameraModelMatchNames links EOS 5D and Canon EOS 5D", async () => {
    const { cameraModelMatchNames } = await import("./lightroom-bundled-profiles");
    expect(cameraModelMatchNames("EOS 5D")).toContain("Canon EOS 5D");
    expect(cameraModelMatchNames("Canon EOS 5D")).toContain("EOS 5D");
  });

  it("validateProfileForCamera warns on model mismatch for user DCP", () => {
    const profile: CameraProfile = {
      id: "dcp:test",
      name: "Test DCP",
      thumb: "",
      builtin: false,
      uniqueCameraModel: "Canon EOS 5D Mark III",
      colorMatrix1: new Float32Array(9),
      colorMatrix2: new Float32Array(9),
      illuminant1: 17,
      illuminant2: 21,
      toneCurve: new Float32Array(256),
    };
    const result = validateProfileForCamera(profile, "Canon EOS 5D");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("5D Mark III");
  });
});
