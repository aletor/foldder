/**
 * Shell del BrandKit Studio: onboarding (1 columna) vs studio (2 columnas).
 *
 * Onboarding solo mientras el kit no ha “nacido” (sin fuentes) y durante el
 * primer ingest. En cuanto hay fuentes y el análisis ha terminado, el shell
 * queda desbloqueado y el split es permanente — también en ingest posteriores.
 */

export type BrandKitStudioShellInput = {
  sourceCount: number;
  isAnalyzing: boolean;
  /** True una vez el kit ha salido del vacío con al menos una fuente tras un ingest. */
  shellUnlocked: boolean;
};

export function shouldUnlockBrandKitStudioShell(input: {
  sourceCount: number;
  isAnalyzing: boolean;
}): boolean {
  return !input.isAnalyzing && input.sourceCount > 0;
}

export function isBrandKitStudioOnboardingLayout(input: BrandKitStudioShellInput): boolean {
  if (input.shellUnlocked) return false;
  if (shouldUnlockBrandKitStudioShell(input)) return false;
  return true;
}
