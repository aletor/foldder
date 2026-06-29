import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { transformColor3 } from "./lightroom-color-matrix";
import { parseDcpFile } from "./lightroom-dcp-parser";
import { resolveColorMatrix } from "./lightroom-profile-registry";
import type { CameraProfile } from "./lightroom-profile-registry";

function profileFromDcp(path: string, id: string): CameraProfile {
  const buf = readFileSync(path);
  const dcp = parseDcpFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return {
    id,
    name: id,
    thumb: "",
    builtin: false,
    uniqueCameraModel: dcp.uniqueCameraModel,
    colorMatrix1: dcp.colorMatrix1,
    colorMatrix2: dcp.colorMatrix2,
    forwardMatrix1: dcp.forwardMatrix1,
    forwardMatrix2: dcp.forwardMatrix2,
    illuminant1: dcp.illuminant1,
    illuminant2: dcp.illuminant2,
    toneCurve: dcp.toneCurve,
  };
}

describe("DCP color pipeline", () => {
  it("Canon EOS 5D profile avoids green-dominant direct ColorMatrix", () => {
    const profile = profileFromDcp(
      join(process.cwd(), "public/assets/camera-profiles/canon/Canon EOS 5D Adobe Standard.dcp"),
      "test:5d",
    );
    const m = resolveColorMatrix(profile, 0);
    const [r, g, b] = transformColor3(m, 0.18, 0.18, 0.18);
    // El bug anterior aplicaba CM en dirección XYZ→cámara → dominante verde (g >> r).
    expect(g).toBeLessThan(r * 1.15);
    expect(Math.abs(r - g)).toBeLessThan(0.15);
  });

  it("Canon EOS 5D Mark II uses ForwardMatrix when present", () => {
    const profile = profileFromDcp(
      join(process.cwd(), "public/assets/camera-profiles/canon/Canon EOS 5D Mark II Adobe Standard.dcp"),
      "test:5d2",
    );
    expect(profile.forwardMatrix1?.length).toBe(9);
    const m = resolveColorMatrix(profile, 0);
    const [r, g, b] = transformColor3(m, 0.18, 0.18, 0.18);
    expect(Math.abs(r - g)).toBeLessThan(0.05);
    expect(Math.abs(g - b)).toBeLessThan(0.05);
  });
});
