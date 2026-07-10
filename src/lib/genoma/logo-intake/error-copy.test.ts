import { describe, expect, it } from "vitest";
import { humanizeLogoIntakeError } from "./error-copy";

describe("humanizeLogoIntakeError", () => {
  it("traduce códigos conocidos", () => {
    expect(humanizeLogoIntakeError("missing_project_id")).toContain("identificador");
    expect(humanizeLogoIntakeError("validate_failed")).toContain("validar");
  });

  it("deja mensajes humanos tal cual", () => {
    const msg = "El archivo está corrupto.";
    expect(humanizeLogoIntakeError(msg)).toBe(msg);
  });
});
