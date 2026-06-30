import { describe, expect, it } from "vitest";
import {
  buildMultiChannelPromptTemplatesByNodeId,
  composeChannelEffectivePrompt,
} from "./loop-channel-prompt";

describe("composeChannelEffectivePrompt", () => {
  const sharedIdentity =
    "Retrato de la misma persona, fondo neutro, luz suave de estudio, mismo estilo fotográfico";

  it("compone nodePrompt + channelPrompt cuando ambos están presentes", () => {
    expect(
      composeChannelEffectivePrompt(sharedIdentity, "mirando a cámara, brazos cruzados"),
    ).toBe(`${sharedIdentity}, mirando a cámara, brazos cruzados`);
  });

  it("fallback: channelPrompt vacío devuelve solo el prompt del nodo", () => {
    expect(composeChannelEffectivePrompt(sharedIdentity, "")).toBe(sharedIdentity);
    expect(composeChannelEffectivePrompt(sharedIdentity, "   ")).toBe(sharedIdentity);
    expect(composeChannelEffectivePrompt(sharedIdentity, undefined)).toBe(sharedIdentity);
    expect(composeChannelEffectivePrompt(sharedIdentity, null)).toBe(sharedIdentity);
  });

  it("preserva la identidad del nodo idéntica entre canales (mismo prefijo)", () => {
    const poseA = composeChannelEffectivePrompt(sharedIdentity, "de perfil izquierdo");
    const poseB = composeChannelEffectivePrompt(sharedIdentity, "de espaldas");
    expect(poseA.startsWith(sharedIdentity)).toBe(true);
    expect(poseB.startsWith(sharedIdentity)).toBe(true);
    expect(poseA.slice(0, sharedIdentity.length)).toBe(poseB.slice(0, sharedIdentity.length));
  });

  it("sin channelPrompt, todos los canales comparten el mismo prompt efectivo", () => {
    const a = composeChannelEffectivePrompt(sharedIdentity, "");
    const b = composeChannelEffectivePrompt(sharedIdentity, undefined);
    expect(a).toBe(b);
    expect(a).toBe(sharedIdentity);
  });

  it("solo channelPrompt si el nodo no tiene prompt", () => {
    expect(composeChannelEffectivePrompt("", "pose sentada")).toBe("pose sentada");
  });
});

describe("buildMultiChannelPromptTemplatesByNodeId", () => {
  const identity = "Misma persona, retrato, fondo blanco";

  it("genera un template por sink con prompt compuesto", () => {
    const map = buildMultiChannelPromptTemplatesByNodeId([
      { channelId: "imgA", nodePrompt: identity, channelPrompt: "de frente" },
      { channelId: "imgB", nodePrompt: identity, channelPrompt: "de perfil" },
    ]);
    expect(map).toEqual({
      imgA: `${identity}, de frente`,
      imgB: `${identity}, de perfil`,
    });
  });

  it("fallback multi-canal: sin channelPrompt usa solo el prompt del nodo", () => {
    const map = buildMultiChannelPromptTemplatesByNodeId([
      { channelId: "imgA", nodePrompt: identity },
      { channelId: "imgB", nodePrompt: identity },
    ]);
    expect(map).toEqual({ imgA: identity, imgB: identity });
  });
});
