import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Foldder todavía tiene nodos legacy grandes con contratos externos no tipados.
      // Mantenemos la señal, pero no bloqueamos CI hasta migrarlos por módulos.
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler aporta buenas señales, pero estas reglas nuevas requieren
      // refactors de UX en componentes legacy; por ahora deben avisar, no bloquear.
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
