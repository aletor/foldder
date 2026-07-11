import { describe, expect, it } from "vitest";
import {
  axesSignature,
  freshBrandKitIngestOperationId,
  freshBrandKitVectorizeOperationId,
  freshBrandKitVisualOperationId,
  brandKitOperationId,
  textSampleSignature,
} from "./paid-operations";

describe("paid-operations", () => {
  it("genera IDs estables por firma", () => {
    const id1 = brandKitOperationId("visual", axesSignature({ sujeto: "personas", paleta: "cálida" }));
    const id2 = brandKitOperationId("visual", axesSignature({ paleta: "cálida", sujeto: "personas" }));
    expect(id1).toBe(id2);
    expect(id1.startsWith("brandKit:visual:")).toBe(true);
  });

  it("firma muestras de texto para voz", () => {
    expect(textSampleSignature("hola mundo")).toBe(textSampleSignature("hola mundo"));
  });

  it("genera IDs de ingesta distintos por intento", () => {
    const a = freshBrandKitIngestOperationId("abc123deadbeef", "nonce-a");
    const b = freshBrandKitIngestOperationId("abc123deadbeef", "nonce-b");
    expect(a).not.toBe(b);
    expect(a.startsWith("brandKit:ingest:")).toBe(true);
  });

  it("genera IDs visuales distintos por intento", () => {
    const sig = axesSignature({ sujeto: "personas" });
    const a = freshBrandKitVisualOperationId(sig, "nonce-a");
    const b = freshBrandKitVisualOperationId(sig, "nonce-b");
    expect(a).not.toBe(b);
    expect(a.startsWith("brandKit:visual:")).toBe(true);
  });

  it("genera IDs de vectorización distintos por intento", () => {
    const a = freshBrandKitVectorizeOperationId("sig-logo", "nonce-a");
    const b = freshBrandKitVectorizeOperationId("sig-logo", "nonce-b");
    expect(a).not.toBe(b);
    expect(a.startsWith("brandKit:vectorize:")).toBe(true);
  });
});
