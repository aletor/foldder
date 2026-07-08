import { describe, expect, it } from "vitest";
import {
  axesSignature,
  freshGenomaIngestOperationId,
  freshGenomaVectorizeOperationId,
  freshGenomaVisualOperationId,
  genomaOperationId,
  textSampleSignature,
} from "./paid-operations";

describe("paid-operations", () => {
  it("genera IDs estables por firma", () => {
    const id1 = genomaOperationId("visual", axesSignature({ sujeto: "personas", paleta: "cálida" }));
    const id2 = genomaOperationId("visual", axesSignature({ paleta: "cálida", sujeto: "personas" }));
    expect(id1).toBe(id2);
    expect(id1.startsWith("genoma:visual:")).toBe(true);
  });

  it("firma muestras de texto para voz", () => {
    expect(textSampleSignature("hola mundo")).toBe(textSampleSignature("hola mundo"));
  });

  it("genera IDs de ingesta distintos por intento", () => {
    const a = freshGenomaIngestOperationId("abc123deadbeef", "nonce-a");
    const b = freshGenomaIngestOperationId("abc123deadbeef", "nonce-b");
    expect(a).not.toBe(b);
    expect(a.startsWith("genoma:ingest:")).toBe(true);
  });

  it("genera IDs visuales distintos por intento", () => {
    const sig = axesSignature({ sujeto: "personas" });
    const a = freshGenomaVisualOperationId(sig, "nonce-a");
    const b = freshGenomaVisualOperationId(sig, "nonce-b");
    expect(a).not.toBe(b);
    expect(a.startsWith("genoma:visual:")).toBe(true);
  });

  it("genera IDs de vectorización distintos por intento", () => {
    const a = freshGenomaVectorizeOperationId("sig-logo", "nonce-a");
    const b = freshGenomaVectorizeOperationId("sig-logo", "nonce-b");
    expect(a).not.toBe(b);
    expect(a.startsWith("genoma:vectorize:")).toBe(true);
  });
});
