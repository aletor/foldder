import { describe, expect, it } from "vitest";
import {
  parseDescriberAnalysisStatus,
  resolveDescriberAnalysisDisplay,
  isValidDescriberStructuredOutput,
} from "./parse-describer-sections";

const SAMPLE = `
SUBJECT & POSE: Woman seated on counter.
WARDROBE & TEXT: White sweatshirt.
CAMERA: Wide lens.
COMPOSITION & FRAMING: Portrait vertical.
LIGHTING: Window light from frame-left.
COLOR GRADE: Cool shadows.
ENVIRONMENT & PROPS: Kitchen with stools.
MOOD, ATMOSPHERE & STYLE: Casual domestic.
`.trim();

describe("parseDescriberAnalysisStatus", () => {
  it("detects all structured sections", () => {
    const status = parseDescriberAnalysisStatus(SAMPLE);
    expect(status.subject).toBe(true);
    expect(status.wardrobe).toBe(true);
    expect(status.camera).toBe(true);
    expect(status.framing).toBe(true);
    expect(status.lighting).toBe(true);
    expect(status.color).toBe(true);
    expect(status.environment).toBe(true);
    expect(status.mood).toBe(true);
  });

  it("returns all false for empty text", () => {
    const status = parseDescriberAnalysisStatus("");
    expect(Object.values(status).every((v) => !v)).toBe(true);
  });
});

describe("resolveDescriberAnalysisDisplay", () => {
  it("marks every tile done only when sections are present", () => {
    const status = resolveDescriberAnalysisDisplay(SAMPLE);
    expect(Object.values(status).every(Boolean)).toBe(true);
  });

  it("marks no tiles done for unstructured refusal text", () => {
    const status = resolveDescriberAnalysisDisplay(
      "I'm unable to provide a detailed analysis of the image.",
    );
    expect(Object.values(status).every((v) => !v)).toBe(true);
  });
});

describe("isValidDescriberStructuredOutput", () => {
  it("requires SUBJECT & POSE header", () => {
    expect(isValidDescriberStructuredOutput(SAMPLE)).toBe(true);
    expect(
      isValidDescriberStructuredOutput(
        "I'm unable to provide a detailed analysis of the image.",
      ),
    ).toBe(false);
  });
});
