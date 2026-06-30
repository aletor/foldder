import { describe, expect, it } from "vitest";
import {
  collectImageRefs,
  firstPortOfKind,
  portText,
  type PortInputs,
} from "./node-executor";

function inputs(byHandle: PortInputs["byHandle"]): PortInputs {
  return { byHandle };
}

describe("node-executor — helpers de inputs", () => {
  it("portText lee un handle concreto o el primer texto", () => {
    const i = inputs({
      prompt: { kind: "text", text: "hola" },
      other: { kind: "text", text: "mundo" },
    });
    expect(portText(i, "prompt")).toBe("hola");
    expect(portText(i)).toBe("hola");
    expect(portText(i, "missing")).toBe("");
  });

  it("firstPortOfKind devuelve el primer input del tipo pedido", () => {
    const i = inputs({
      a: { kind: "text", text: "t" },
      b: { kind: "image", url: "u" },
    });
    expect(firstPortOfKind(i, "image")).toEqual({ kind: "image", url: "u" });
    expect(firstPortOfKind(i, "video")).toBeUndefined();
  });

  it("collectImageRefs respeta el orden de handles indicado y añade el resto", () => {
    const i = inputs({
      image2: { kind: "image", url: "b", s3Key: "kb" },
      image: { kind: "image", url: "a" },
      extra: { kind: "image", url: "z" },
      prompt: { kind: "text", text: "x" },
    });
    const refs = collectImageRefs(i, ["image", "image2", "image3", "image4"]);
    expect(refs).toEqual([
      { url: "a", s3Key: undefined },
      { url: "b", s3Key: "kb" },
      { url: "z", s3Key: undefined },
    ]);
  });

  it("collectImageRefs ignora valores de imagen sin url", () => {
    const i = inputs({ image: { kind: "image", url: "" } });
    expect(collectImageRefs(i, ["image"])).toEqual([]);
  });
});
