import { describe, expect, it } from "vitest";

import { analyzeCineScript, cleanScriptText } from "./cine-engine";

const SARA_SCRIPT = `
**Voz en off:** En la vida, cada escalón puede ser un desafío, un miedo que debemos superar. Para Sara, hoy es la escalera de su edificio.
**Texto en pantalla:** **Paso a Paso**
**Notas visuales:**
- **Duración: 0:10** Vista de la escalera de madera desde arriba, mostrando su altura y antigüedad.

**Voz en off:** Sara respira hondo. Cada escalón cruje bajo sus pies, pero ella decide seguir bajando.
**Texto en pantalla:** *Un paso más cerca de ser libre.*
**Notas visuales:**
- **Duración: 0:20** Primer plano de Sara en la escalera, agarrando la barandilla con determinación.

**Voz en off:** Hace un tiempo, en una entrevista de trabajo, Sara sintió que podía empezar de nuevo.
**Texto en pantalla:** Entrevista
**Notas visuales:**
- **Duración: 0:12** Sala de entrevista sobria, Sara nerviosa pero aliviada, luz suave de oficina.

**Voz en off:** El recuerdo de la pérdida todavía pesa, pero ya no la paraliza.
**Texto en pantalla:** Coraje
**Notas visuales:**
- **Duración: 0:11** Espacio de recuerdo íntimo y silencioso, Sara en un momento de reflexión.

**Voz en off:** Sara llega al último tramo de la escalera. Sonríe, con una bolsa de basura en la mano.
**Texto en pantalla:** Hoy
**Notas visuales:**
- **Duración: 0:14** Sara llegando al final de la escalera, con gesto de victoria tranquila.

**Voz en off:** Al abrir la puerta, la luz del sol le devuelve el rostro. Sara camina hacia la salida.
**Texto en pantalla:** Salida
**Notas visuales:**
- **Duración: 0:09** Puerta de salida y hall iluminado, luz cálida entrando sobre el rostro de Sara.
`;

function collectText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectText);
  return [];
}

describe("Cine analyzer V1.7", () => {
  it("cleans markdown without losing label content", () => {
    expect(cleanScriptText("**Paso a Paso**")).toBe("Paso a Paso");
    expect(cleanScriptText("*Un paso más cerca de ser libre.*")).toBe("Un paso más cerca de ser libre.");
    expect(cleanScriptText("**Duración: 0:10** Vista de la escalera")).toBe("Duración: 0:10 Vista de la escalera");
  });

  it("parses Sara's audiovisual script into useful storyboard data", () => {
    const result = analyzeCineScript(SARA_SCRIPT);
    const characterNames = result.characters.map((character) => character.name);
    const sceneWithInterview = result.scenes.find((scene) => /entrevista/i.test(scene.sourceText ?? ""));
    const sceneWithLoss = result.scenes.find((scene) => /pérdida|perdida/i.test(scene.sourceText ?? ""));

    expect(result.scenes.length).toBeGreaterThanOrEqual(5);
    expect(result.scenes.length).toBeLessThanOrEqual(6);
    expect(result.characters).toHaveLength(1);
    expect(characterNames).toEqual(["Sara"]);
    expect(characterNames).not.toContain("Paso");
    expect(characterNames).not.toContain("Cada");
    expect(characterNames).not.toContain("Hoy");
    expect(result.scenes[0]?.visualNotes).toContain("escalera de madera");
    expect(result.scenes[0]?.durationSeconds).toBe(10);
    expect(result.scenes[0]?.onScreenText).toContain("Paso a Paso");
    expect(result.scenes[1]?.durationSeconds).toBe(20);
    expect(sceneWithInterview?.sceneKind).toBe("flashback");
    expect(sceneWithLoss?.sceneKind).toBe("memory");
    expect(result.backgrounds.map((background) => background.name)).toEqual(
      expect.arrayContaining([
        "Escalera antigua del edificio",
        "Sala de entrevista",
        "Espacio de recuerdo / reflexión",
        "Hall o puerta de salida iluminada",
      ]),
    );
    expect(result.scenes.every((scene) => (scene.characters ?? []).every((characterId) => result.characters.some((character) => character.id === characterId)))).toBe(true);
    expect(collectText(result).some((text) => text.includes("**"))).toBe(false);
  });
});
