import { describe, expect, it } from "vitest";
import {
  isBrandKitStudioOnboardingLayout,
  shouldUnlockBrandKitStudioShell,
} from "./brand-kit-studio-shell";

describe("brand-kit-studio-shell", () => {
  it("onboarding en vacío sin análisis", () => {
    expect(
      isBrandKitStudioOnboardingLayout({
        sourceCount: 0,
        isAnalyzing: false,
        shellUnlocked: false,
      }),
    ).toBe(true);
  });

  it("onboarding durante el primer ingest aunque ya haya fuentes parciales", () => {
    expect(
      isBrandKitStudioOnboardingLayout({
        sourceCount: 1,
        isAnalyzing: true,
        shellUnlocked: false,
      }),
    ).toBe(true);
  });

  it("desbloquea al terminar el primer ingest con fuentes", () => {
    expect(shouldUnlockBrandKitStudioShell({ sourceCount: 1, isAnalyzing: false })).toBe(true);
    expect(
      isBrandKitStudioOnboardingLayout({
        sourceCount: 1,
        isAnalyzing: false,
        shellUnlocked: false,
      }),
    ).toBe(false);
  });

  it("shell desbloqueado: siempre studio, también en ingest posteriores", () => {
    expect(
      isBrandKitStudioOnboardingLayout({
        sourceCount: 2,
        isAnalyzing: true,
        shellUnlocked: true,
      }),
    ).toBe(false);
  });

  it("no desbloquea mientras analiza sin haber cerrado el job", () => {
    expect(shouldUnlockBrandKitStudioShell({ sourceCount: 1, isAnalyzing: true })).toBe(false);
  });
});
