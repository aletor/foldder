import type { ThemeOverride } from "./site-types";

/** CSS scoped por bloque/sección desde el ledger del proyecto. */
export function ledgerOverridesStylesheet(ledger: ThemeOverride[]): string {
  if (!ledger.length) return "";
  return ledger
    .map((entry) => {
      const selector = `[data-block-id="${entry.blockId.replace(/"/g, '\\"')}"]`;
      return `${selector} { ${entry.path}: ${entry.value}; }`;
    })
    .join("\n");
}

export const LEDGER_PATH_PRESETS: Array<{ path: string; label: string; placeholder: string }> = [
  { path: "--c-accent", label: "Acento", placeholder: "#6ec4a8" },
  { path: "--c-fg", label: "Texto", placeholder: "#111111" },
  { path: "--c-bg", label: "Fondo", placeholder: "#ffffff" },
  { path: "opacity", label: "Opacidad", placeholder: "0.85" },
];
